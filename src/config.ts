import { homedir } from "node:os";
import { join } from "node:path";
import { defaultJobsDir } from "./runtime.ts";

/** Workers with a live adapter. `deepseek` is a reserved slot (unreleased harness). */
export type WorkerKind = "grok" | "claude-ds" | "openrouter" | "deepseek";
export type Lane = "easy" | "mid" | "hard";

/** Public CLI aliases for mid-lane DeepSeek models. */
export type DsModelAlias = "flash" | "pro";

export interface DsModelChoice {
  alias: DsModelAlias;
  /** Exact id passed to claude-ds `-Model` / stock `claude --model`. */
  id: string;
}

export const WORKERS: WorkerKind[] = ["grok", "claude-ds", "openrouter", "deepseek"];
export const LANES: Lane[] = ["easy", "mid", "hard"];
export const DS_MODELS: DsModelAlias[] = ["flash", "pro"];

export const DS_MODEL_IDS: Record<DsModelAlias, string> = {
  flash: "deepseek-v4-flash",
  pro: "deepseek-v4-pro",
};

/**
 * Resolve --model / env to alias + concrete model id.
 * Preserves `deepseek-v4-pro[1m]` (does not silently strip the SKU).
 * Empty → Flash.
 */
export function resolveDsModel(raw?: string | null): DsModelChoice {
  if (!raw || !raw.trim()) {
    return { alias: "flash", id: DS_MODEL_IDS.flash };
  }
  const v = raw.trim().toLowerCase();
  if (v === "flash" || v === "deepseek-v4-flash") {
    return { alias: "flash", id: DS_MODEL_IDS.flash };
  }
  if (v === "pro" || v === "deepseek-v4-pro") {
    return { alias: "pro", id: DS_MODEL_IDS.pro };
  }
  if (v === "deepseek-v4-pro[1m]") {
    return { alias: "pro", id: "deepseek-v4-pro[1m]" };
  }
  throw new Error(`Invalid --model ${raw}; expected flash|pro`);
}

/** Alias-only helper (tests / callers that do not need the concrete id). */
export function resolveDsModelAlias(raw?: string | null): DsModelAlias {
  return resolveDsModel(raw).alias;
}

/**
 * Mid default from env: CURSOR_ROUTE_DS_MODEL, else ANTHROPIC_MODEL, else flash.
 * Throws if the env value is set but invalid (fail loud on start).
 */
export function defaultDsModelFromEnv(): DsModelChoice {
  const raw = process.env.CURSOR_ROUTE_DS_MODEL || process.env.ANTHROPIC_MODEL;
  return resolveDsModel(raw);
}

/** OpenRouter model for the easy lane (env CURSOR_ROUTE_OPENROUTER_MODEL). */
export function openRouterModel(): string {
  return process.env.CURSOR_ROUTE_OPENROUTER_MODEL || "openrouter/free";
}

/** OpenRouter API base URL (env OPENROUTER_BASE_URL). */
export function openRouterBaseUrl(): string {
  return process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
}

function maxConcurrentJobsFromEnv(): number {
  const raw = process.env.CURSOR_ROUTE_MAX_JOBS;
  if (raw) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return 50;
}

/**
 * Live getters for env-derived paths/limits so tests can set
 * CURSOR_ROUTE_JOBS_DIR / CURSOR_ROUTE_MAX_JOBS before exercising jobs
 * even if another module imported config earlier.
 */
export const config = {
  product: "cursor-route",
  version: "0.1.7",
  get jobsDir(): string {
    return defaultJobsDir();
  },
  tmuxPrefix: "cursor-route",
  defaultWorker: "grok" as WorkerKind,
  /** Lane → default worker (Cemini /route public core). */
  laneWorkers: {
    easy: "openrouter" as WorkerKind,
    mid: "claude-ds" as WorkerKind,
    hard: "grok" as WorkerKind,
  },
  /**
   * Default mid DeepSeek model (Flash = cheap execute).
   * Live: CURSOR_ROUTE_DS_MODEL / ANTHROPIC_MODEL; invalid env → flash (health-safe).
   * Override on start: --model. startJob uses defaultDsModelFromEnv() and fails on invalid env.
   */
  get defaultDsModel(): DsModelAlias {
    try {
      return defaultDsModelFromEnv().alias;
    } catch {
      return "flash";
    }
  },
  jobsListLimit: 20,
  /** Max simultaneously active (running|pending) jobs. Override: CURSOR_ROUTE_MAX_JOBS. */
  get maxConcurrentJobs(): number {
    return maxConcurrentJobsFromEnv();
  },
};

export function sessionName(jobId: string): string {
  return `${config.tmuxPrefix}-${jobId}`;
}

/** Home for docs only — not used as jobsDir. */
export function productHomeHint(): string {
  return join(process.env.HOME || homedir(), ".cursor-route");
}
