import { execSync } from "node:child_process";
import type { Adapter, WorkerHealth } from "./types.ts";
import { shellQuote } from "../util.ts";

function findGrok(): string | null {
  try {
    return execSync("command -v grok", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

export const grokAdapter: Adapter = {
  kind: "grok",
  label: "Grok CLI (xAI)",
  health(): WorkerHealth {
    const binary = findGrok();
    if (!binary) {
      return {
        worker: "grok",
        ok: false,
        binary: null,
        detail: "grok not on PATH — install from https://x.ai/cli then run: grok login",
      };
    }
    return {
      worker: "grok",
      ok: true,
      binary,
      detail: "ok (auth checked at first start — run grok login if jobs fail)",
    };
  },
  buildLaunch({ promptFile, cwd, alwaysApprove }) {
    const parts = [
      "grok",
      "-p",
      `"$(cat ${shellQuote(promptFile)})"`,
      "--cwd",
      shellQuote(cwd),
      "--no-auto-update",
      "--output-format",
      "plain",
    ];
    if (alwaysApprove) parts.push("--always-approve");
    return {
      worker: "grok",
      command: parts.join(" "),
      alwaysApprove,
    };
  },
};
