import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Adapter, WorkerHealth } from "./types.ts";
import { shellQuote } from "../util.ts";
import {
  cachedOrFreePick,
  OPENROUTER_FALLBACK_MODEL,
  openRouterBaseUrl,
} from "../config.ts";

/**
 * Resolve how to invoke the one-shot runner. Prefer the compiled dist via node
 * (no loader); else Bun on src. No npx/tsx — same policy as mark-complete.
 */
function resolveRunner(): { command: string } | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const compiled = join(here, "..", "..", "dist", "openrouter-run.js");
  if (existsSync(compiled)) {
    return { command: `node ${shellQuote(compiled)}` };
  }
  const srcFile = join(here, "..", "openrouter-run.ts");
  if (existsSync(srcFile)) {
    return { command: `bun ${shellQuote(srcFile)}` };
  }
  return null;
}

function openRouterEnv(modelId?: string): Record<string, string> | undefined {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return undefined;
  const env: Record<string, string> = { OPENROUTER_API_KEY: key };
  const model = modelId || process.env.CURSOR_ROUTE_OPENROUTER_MODEL;
  if (model) env.CURSOR_ROUTE_OPENROUTER_MODEL = model;
  const base = process.env.OPENROUTER_BASE_URL;
  if (base) env.OPENROUTER_BASE_URL = base;
  return env;
}

export const openRouterAdapter: Adapter = {
  kind: "openrouter",
  label: "OpenRouter (free easy lane)",
  health(): WorkerHealth {
    const runner = resolveRunner();
    if (!process.env.OPENROUTER_API_KEY) {
      return {
        worker: "openrouter",
        ok: false,
        binary: runner?.command ?? null,
        detail:
          "OPENROUTER_API_KEY not set — export your OpenRouter key (easy lane live-picks a free model at start; pin with CURSOR_ROUTE_OPENROUTER_MODEL)",
      };
    }
    if (!runner) {
      return {
        worker: "openrouter",
        ok: false,
        binary: null,
        detail: "openrouter-run not found — run bun run build (or use Bun from a source clone)",
      };
    }
    // Health stays offline: ranked cache hit, else label the router fallback
    // (do not present openrouter/free as a fresh live pick).
    const cached = cachedOrFreePick();
    const detail = cached
      ? `ok (live pick at start; cached ${cached} @ ${openRouterBaseUrl()})`
      : `ok (live pick at start; no catalog cache, fetch-fail fallback ${OPENROUTER_FALLBACK_MODEL} @ ${openRouterBaseUrl()})`;
    return {
      worker: "openrouter",
      ok: true,
      binary: runner.command,
      detail,
    };
  },
  buildLaunch({ promptFile, modelId }) {
    const runner = resolveRunner();
    if (!runner) throw new Error("openrouter runner not available — run: bun run build");
    // Missing key is tolerated here so `--dry-run` can still print the command;
    // real starts are gated by the health preflight (which requires the key).
    const env = openRouterEnv(modelId);

    // No interactive approval concept for a pure HTTP call — nothing to auto-approve.
    return {
      worker: "openrouter",
      command: `${runner.command} --prompt-file ${shellQuote(promptFile)}`,
      alwaysApprove: false,
      env,
    };
  },
};
