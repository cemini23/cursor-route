import { execSync } from "node:child_process";
import type { Adapter, WorkerHealth } from "./types.ts";
import { shellQuote } from "../util.ts";

/**
 * DeepSeek today rides Claude Code via a local `claude-ds` or `deepseek-claude` shim.
 * Stock `claude` is NOT an automatic fallback (wrong bill / wrong provider).
 * Native DeepSeek harness = later adapter.
 */
function resolveClaudeDs(): { binary: string; mode: string } | null {
  const candidates: Array<{ cmd: string; mode: string }> = [
    { cmd: "claude-ds", mode: "claude-ds" },
    { cmd: "deepseek-claude", mode: "deepseek-claude" },
  ];
  for (const c of candidates) {
    try {
      const path = execSync(`command -v ${c.cmd}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (path) return { binary: path, mode: c.mode };
    } catch {
      /* continue */
    }
  }
  // Explicit opt-in only
  if (process.env.CURSOR_ROUTE_ALLOW_STOCK_CLAUDE === "1") {
    try {
      const path = execSync("command -v claude", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (path) {
        return {
          binary: path,
          mode: "claude (CURSOR_ROUTE_ALLOW_STOCK_CLAUDE=1 — configure DeepSeek base URL)",
        };
      }
    } catch {
      /* empty */
    }
  }
  return null;
}

export const claudeDsAdapter: Adapter = {
  kind: "claude-ds",
  label: "DeepSeek via claude-ds / Claude Code",
  health(): WorkerHealth {
    const resolved = resolveClaudeDs();
    if (!resolved) {
      return {
        worker: "claude-ds",
        ok: false,
        binary: null,
        detail:
          "claude-ds / deepseek-claude not on PATH — see README DeepSeek setup (stock claude needs CURSOR_ROUTE_ALLOW_STOCK_CLAUDE=1)",
      };
    }
    return {
      worker: "claude-ds",
      ok: true,
      binary: resolved.binary,
      detail: `ok (${resolved.mode})`,
    };
  },
  buildLaunch({ promptFile, cwd, alwaysApprove }) {
    const resolved = resolveClaudeDs();
    if (!resolved) {
      throw new Error("claude-ds worker not available — run: cursor-route health");
    }

    const ask = process.env.CURSOR_ROUTE_ASK === "1" || process.env.CLAUDE_DS_ASK === "1";
    const skip = alwaysApprove && !ask;

    if (resolved.mode.startsWith("claude-ds")) {
      const parts = [
        shellQuote(resolved.binary),
        "-PromptFile",
        shellQuote(promptFile),
      ];
      if (skip) parts.push("--dangerously-skip-permissions");
      return {
        worker: "claude-ds",
        command: `cd ${shellQuote(cwd)} && ${parts.join(" ")}`,
        alwaysApprove: skip,
      };
    }

    const parts = [
      shellQuote(resolved.binary),
      "-p",
      `"$(cat ${shellQuote(promptFile)})"`,
    ];
    if (skip) parts.push("--dangerously-skip-permissions");
    return {
      worker: "claude-ds",
      command: `cd ${shellQuote(cwd)} && ${parts.join(" ")}`,
      alwaysApprove: skip,
    };
  },
};
