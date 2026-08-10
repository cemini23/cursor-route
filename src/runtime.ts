import { join } from "node:path";
import { homedir } from "node:os";
import { commandExists, shellQuote } from "./util.ts";

/**
 * Resolve how to re-invoke TypeScript helpers (mark-complete) from shell hooks.
 * Prefer bun; else pinned npx tsx — never bare network-unpinned without note.
 */
export function markCompleteInvoker(scriptPath: string): string {
  if (commandExists("bun")) {
    return `bun ${shellQuote(scriptPath)}`;
  }
  // Pin tsx major for supply-chain predictability on Node-only hosts
  return `npx --yes tsx@4.19.4 ${shellQuote(scriptPath)}`;
}

/** XDG-ish default away from git-clone install dir (~/.cursor-route). */
export function defaultJobsDir(): string {
  if (process.env.CURSOR_ROUTE_JOBS_DIR) return process.env.CURSOR_ROUTE_JOBS_DIR;
  const home = process.env.HOME || homedir();
  const xdg = process.env.XDG_DATA_HOME || join(home, ".local", "share");
  return join(xdg, "cursor-route", "jobs");
}
