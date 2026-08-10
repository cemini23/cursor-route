#!/usr/bin/env node
/**
 * npm bin entry — prefers Bun, falls back to pinned tsx.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "src", "cli.ts");
const args = process.argv.slice(2);

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", env: process.env });
  if (r.error && r.error.code === "ENOENT") return null;
  process.exit(r.status ?? 1);
}

const bun = spawnSync("bun", ["--version"], { encoding: "utf8" });
if (bun.status === 0) {
  run("bun", [cli, ...args]);
}

run("npx", ["--yes", "tsx@4.19.4", cli, ...args]);
console.error("cursor-route: need Bun (https://bun.sh) or Node 20+ with npx");
process.exit(127);
