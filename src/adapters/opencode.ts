import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { Adapter, WorkerHealth } from "./types.ts";
import { shellQuote } from "../util.ts";
import { openCodeModel, OPENCODE_DEFAULT_MODEL } from "../config.ts";

/**
 * Opt-in OpenCode worker (`opencode run`) — a coding agent that can use
 * OpenCode Zen free models (default `opencode/big-pickle`) to cut Grok /
 * DeepSeek usage. Not a lane default: mid stays claude-ds; easy stays
 * OpenRouter chat (no tools).
 *
 * We never rewrite ~/.config/opencode/opencode.json (parallel jobs would
 * race). Always-approve maps to `opencode run --auto` (still honors explicit
 * deny rules). Prompt is inlined via cat — never interpolated.
 */

function findOpencode(): string | null {
  // Env override lets tests pin a fake opencode — but it must exist, so a
  // stale override cannot pass health with a dangling path.
  const override = process.env.CURSOR_ROUTE_OPENCODE_BIN;
  if (override) return existsSync(override) ? override : null;
  try {
    return (
      execSync("command -v opencode", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env },
      }).trim() || null
    );
  } catch {
    return null;
  }
}

export const opencodeAdapter: Adapter = {
  kind: "opencode",
  label: "OpenCode (free Zen / other models)",
  health(): WorkerHealth {
    const binary = findOpencode();
    if (!binary) {
      return {
        worker: "opencode",
        ok: false,
        binary: null,
        detail:
          "opencode not found — install: npm i -g opencode-ai (or brew install opencode). Then: opencode auth login. Mid default remains claude-ds.",
      };
    }
    let defaultModel = OPENCODE_DEFAULT_MODEL;
    try {
      defaultModel = openCodeModel();
    } catch {
      /* invalid env — health still ok; startJob will fail loud */
    }
    return {
      worker: "opencode",
      ok: true,
      binary,
      detail: `ok (opencode run; default model ${defaultModel}; auth at first start — opencode auth login if jobs fail; mid default remains claude-ds)`,
    };
  },
  buildLaunch({ promptFile, cwd, alwaysApprove, modelId }) {
    // Missing binary is tolerated here so `--dry-run` can still print the
    // command; real starts are gated by the health preflight.
    const binary = findOpencode() || "opencode";
    const id = openCodeModel(modelId);

    const ask = process.env.CURSOR_ROUTE_ASK === "1";
    const skip = alwaysApprove && !ask;

    const parts = [
      shellQuote(binary),
      "run",
      "--dir",
      shellQuote(cwd),
      "--model",
      shellQuote(id),
    ];
    if (skip) parts.push("--auto");
    parts.push(`"$(cat ${shellQuote(promptFile)})"`);

    return {
      worker: "opencode",
      command: `cd ${shellQuote(cwd)} && ${parts.join(" ")}`,
      alwaysApprove: skip,
    };
  },
};
