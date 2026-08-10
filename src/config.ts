import { homedir } from "node:os";
import { join } from "node:path";
import { defaultJobsDir } from "./runtime.ts";

export type WorkerKind = "grok" | "claude-ds";
export type Lane = "mid" | "hard";

export const WORKERS: WorkerKind[] = ["grok", "claude-ds"];
export const LANES: Lane[] = ["mid", "hard"];

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
  version: "0.1.4",
  get jobsDir(): string {
    return defaultJobsDir();
  },
  tmuxPrefix: "cursor-route",
  defaultWorker: "grok" as WorkerKind,
  /** Lane → default worker (Cemini /route public core). */
  laneWorkers: {
    mid: "claude-ds" as WorkerKind,
    hard: "grok" as WorkerKind,
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
