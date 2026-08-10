import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Adapter, WorkerHealth } from "./types.ts";
import { shellQuote } from "../util.ts";

/**
 * Mid-lane = DeepSeek (cheap). The Claude Code binary is only a harness —
 * requests must hit DeepSeek, not Anthropic.
 *
 * Resolution order:
 * 1. claude-ds / deepseek-claude shims
 * 2. stock `claude` when ANTHROPIC_BASE_URL (env or ~/.claude/settings.json)
 *    points at api.deepseek.com — auto-ok, no opt-in
 * 3. stock `claude` on Anthropic only if CURSOR_ROUTE_ALLOW_ANTHROPIC=1
 *    (explicit expensive escape hatch — not the product default)
 */

function which(cmd: string): string | null {
  try {
    return (
      execSync(`command -v ${shellQuote(cmd)}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

/** True when URL hostname is deepseek.com (or a subdomain). */
export function isDeepSeekBaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host === "deepseek.com" || host.endsWith(".deepseek.com");
  } catch {
    return false;
  }
}

function deepseekBaseFromSettings(): string | null {
  // Home settings only — do not trust cwd/.claude/settings.json (spoof / exfil risk)
  const p = join(homedir(), ".claude", "settings.json");
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8")) as {
      env?: Record<string, string>;
    };
    const url = j.env?.ANTHROPIC_BASE_URL;
    if (url && isDeepSeekBaseUrl(url)) return url;
  } catch {
    /* ignore */
  }
  return null;
}

/** Resolved DeepSeek base URL for the mid-lane harness, or null. */
export function resolvedDeepSeekBaseUrl(): string | null {
  for (const candidate of [
    process.env.ANTHROPIC_BASE_URL,
    process.env.CURSOR_ROUTE_ANTHROPIC_BASE_URL,
    deepseekBaseFromSettings(),
  ]) {
    if (candidate && isDeepSeekBaseUrl(candidate)) return candidate;
  }
  return null;
}

/** True when Claude Code harness is routed to DeepSeek (cheap path). */
export function isDeepSeekRouted(): boolean {
  return Boolean(resolvedDeepSeekBaseUrl());
}

function resolveClaudeDs(): { binary: string; mode: string } | null {
  for (const c of [
    { cmd: "claude-ds", mode: "claude-ds (DeepSeek shim)" },
    { cmd: "deepseek-claude", mode: "deepseek-claude" },
  ] as const) {
    const path = which(c.cmd);
    if (path) return { binary: path, mode: c.mode };
  }

  const claude = which("claude");
  if (!claude) return null;

  if (isDeepSeekRouted()) {
    return {
      binary: claude,
      mode: "claude → DeepSeek (ANTHROPIC_BASE_URL)",
    };
  }

  // Expensive Anthropic path — opt-in only so we never silently bill frontier rates
  if (
    process.env.CURSOR_ROUTE_ALLOW_ANTHROPIC === "1" ||
    process.env.CURSOR_ROUTE_ALLOW_STOCK_CLAUDE === "1" // legacy alias
  ) {
    return {
      binary: claude,
      mode: "claude → Anthropic (CURSOR_ROUTE_ALLOW_ANTHROPIC=1)",
    };
  }

  return null;
}

/**
 * Env that must reach stock `claude` for DeepSeek routing.
 * Passed via process/tmux env — never interpolated into the printed command.
 */
function deepSeekWorkerEnv(): Record<string, string> | undefined {
  const base = resolvedDeepSeekBaseUrl();
  if (!base) return undefined;
  const env: Record<string, string> = { ANTHROPIC_BASE_URL: base };
  const token =
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    "";
  if (token) env.ANTHROPIC_AUTH_TOKEN = token;
  const model = process.env.ANTHROPIC_MODEL;
  if (model) env.ANTHROPIC_MODEL = model;
  return env;
}

export const claudeDsAdapter: Adapter = {
  kind: "claude-ds",
  label: "DeepSeek (via Claude Code harness)",
  health(): WorkerHealth {
    const resolved = resolveClaudeDs();
    if (!resolved) {
      const hasClaude = Boolean(which("claude"));
      return {
        worker: "claude-ds",
        ok: false,
        binary: null,
        detail: hasClaude
          ? "claude on PATH but ANTHROPIC_BASE_URL is not DeepSeek — set https://api.deepseek.com/anthropic (see README). Refusing Anthropic default so mid-lane stays cheap."
          : "need claude-ds, deepseek-claude, or claude + DeepSeek ANTHROPIC_BASE_URL — see README DeepSeek setup",
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
      throw new Error("DeepSeek worker not available — run: cursor-route health");
    }

    const ask = process.env.CURSOR_ROUTE_ASK === "1" || process.env.CLAUDE_DS_ASK === "1";
    const skip = alwaysApprove && !ask;
    // Stock `claude` needs DeepSeek env injected into the worker process
    // (tmux panes may not inherit client env from a long-lived server).
    const env =
      resolved.mode.startsWith("claude → DeepSeek") ? deepSeekWorkerEnv() : undefined;

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
        env,
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
      env,
    };
  },
};
