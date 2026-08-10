import { spawnSync } from "node:child_process";

/** Shell-escape a string for single-quoted POSIX use. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Short job id (8 hex chars). */
export function newJobId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function commandExists(cmd: string): boolean {
  try {
    const r = spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" });
    return r.status === 0 && Boolean(r.stdout?.trim());
  } catch {
    return false;
  }
}
