import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { commandExists, shellQuote } from "./util.ts";

/**
 * Resolve how to re-invoke the completion hook (mark-complete) from shell hooks.
 * Prefer compiled dist via node (no loader); else Bun on src. No npx/tsx on the
 * happy path — surface a clear failure if neither is available.
 */
export function markCompleteInvoker(scriptPath: string): string {
  const compiled = scriptPath.replace(/\.ts$/, ".js");
  if (existsSync(compiled)) {
    return `node ${shellQuote(compiled)}`;
  }
  if (commandExists("bun")) {
    return `bun ${shellQuote(scriptPath)}`;
  }
  return `sh -c 'echo "cursor-route: completion hook needs a compiled dist or Bun (run bun run build)" >&2; exit 1'`;
}

/** XDG-ish default away from git-clone install dir (~/.cursor-route). */
export function defaultJobsDir(): string {
  if (process.env.CURSOR_ROUTE_JOBS_DIR) return process.env.CURSOR_ROUTE_JOBS_DIR;
  const home = process.env.HOME || homedir();
  const xdg = process.env.XDG_DATA_HOME || join(home, ".local", "share");
  return join(xdg, "cursor-route", "jobs");
}
