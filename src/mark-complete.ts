#!/usr/bin/env bun
/**
 * Marks a job completed/failed after the worker process exits.
 * Invoked from tmux / headless completion hooks — keep dep-free.
 */
import { readFileSync, writeFileSync } from "node:fs";

const jobPath = process.argv[2];
const exitCode = Number(process.argv[3] ?? "1");
const logPath = process.argv[4];

if (!jobPath) process.exit(0);

try {
  const job = JSON.parse(readFileSync(jobPath, "utf8")) as Record<string, unknown>;
  if (job.status === "running" || job.status === "pending") {
    job.status = exitCode === 0 ? "completed" : "failed";
    job.exitCode = exitCode;
    job.completedAt = new Date().toISOString();
    if (exitCode !== 0 && !job.error) {
      job.error = `Worker exited with code ${exitCode}`;
    }
    if (logPath) {
      try {
        const log = readFileSync(logPath, "utf8");
        job.logBytes = Buffer.byteLength(log);
        // Avoid retaining secret-looking tails in job metadata
        const redacted = log
          .replace(/\bsk-[a-zA-Z0-9]{20,}\b/g, "[REDACTED]")
          .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, "[REDACTED]")
          .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gi, "[REDACTED]");
        job.logTail = redacted.slice(-2000);
      } catch {
        /* ignore */
      }
    }
    writeFileSync(jobPath, JSON.stringify(job, null, 2), { mode: 0o600 });
  }
} catch {
  /* never fail the shell hook hard */
}
process.exit(0);
