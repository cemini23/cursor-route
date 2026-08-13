import type { Adapter, WorkerHealth } from "./types.ts";

/**
 * Reserved slot for the official DeepSeek coding harness when it ships.
 * Mid lane stays on claude-ds until then — do not route jobs here.
 */
export const deepseekAdapter: Adapter = {
  kind: "deepseek",
  label: "Official DeepSeek harness (unreleased)",
  health(): WorkerHealth {
    return {
      worker: "deepseek",
      ok: false,
      binary: null,
      detail:
        "unreleased — mid lane uses claude-ds (DeepSeek behind Claude Code). See README.",
    };
  },
  buildLaunch() {
    throw new Error(
      "Official DeepSeek harness is not available yet — use --lane mid / --worker claude-ds",
    );
  },
};
