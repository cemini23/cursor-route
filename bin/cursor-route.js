#!/usr/bin/env node
/**
 * npm bin redirect — prefers compiled dist (node), else Bun on src.
 * The shell launcher (bin/cursor-route) is the primary npm bin entry;
 * this file keeps direct `node bin/cursor-route.js` working the same way.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", env: process.env });
  if (r.error && r.error.code === "ENOENT") return null;
  process.exit(r.status ?? 1);
}

function main() {
  const distCli = join(root, "dist", "cli.js");
  if (existsSync(distCli) && run("node", [distCli, ...args]) !== null) return;
  if (run("bun", [join(root, "src", "cli.ts"), ...args]) !== null) return;
  console.error("cursor-route: no compiled build (run 'bun run build') and no Bun — need Node 20+ or Bun (https://bun.sh)");
  process.exit(127);
}

main();
