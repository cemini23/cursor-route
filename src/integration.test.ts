/**
 * Fake-worker integration tests (headless, no tmux needed).
 *
 * Env (set before importing config/jobs so jobsDir + limit take effect):
 *   CURSOR_ROUTE_JOBS_DIR  → unique tmpdir
 *   CURSOR_ROUTE_MAX_JOBS  → 2 (so the concurrency refusal is cheap to test)
 *   CURSOR_ROUTE_GROK_BIN  → absolute path to the fake grok shim (read in-process
 *                            by the adapter; PATH shadowing alone is unreliable
 *                            under bun, which snapshots env for child processes)
 */
import { describe, expect, test, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Job } from "./jobs.ts";

const tmp = mkdtempSync(join(tmpdir(), "cursor-route-int-"));
const jobsDir = join(tmp, "jobs");
const shimDir = join(tmp, "bin");
const shimLog = join(tmp, "shim.log");

process.env.CURSOR_ROUTE_JOBS_DIR = jobsDir;
process.env.CURSOR_ROUTE_MAX_JOBS = "2";

mkdirSync(shimDir, { recursive: true });

function writeShim(name: string): void {
  const body = `#!/usr/bin/env sh
{
  echo "argv=$*"
  echo "pwd=$PWD"
} >> '${shimLog}'
sleep "\${FAKE_WORKER_SLEEP:-1}"
exit "\${FAKE_WORKER_EXIT:-0}"
`;
  const p = join(shimDir, name);
  writeFileSync(p, body);
  chmodSync(p, 0o755);
}
writeShim("grok");
writeShim("claude-ds");
process.env.CURSOR_ROUTE_GROK_BIN = join(shimDir, "grok");
process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = join(shimDir, "claude-ds");

const { startJob, readJob, killJob, refreshStatus, countActiveJobs } = await import("./jobs.ts");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTerminal(jobId: string, timeoutMs = 15000): Promise<Job> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = readJob(jobId);
    if (!job) {
      await sleep(100);
      continue;
    }
    const fresh = refreshStatus(job);
    if (fresh.status === "completed" || fresh.status === "failed" || fresh.status === "killed") {
      return fresh;
    }
    await sleep(200);
  }
  throw new Error(`timed out waiting for job ${jobId} to reach terminal state`);
}

afterAll(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("fake-worker integration (headless, no tmux)", () => {
  test(
    "start → completed with exitCode 0",
    async () => {
      delete process.env.FAKE_WORKER_EXIT;
      delete process.env.FAKE_WORKER_SLEEP;
      const r = startJob({ prompt: "say ok", worker: "grok", noTmux: true });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const job = await waitForTerminal(r.job.id);
      expect(job.status).toBe("completed");
      expect(job.exitCode).toBe(0);
    },
    20000,
  );

  test(
    "FAKE_WORKER_EXIT=7 → failed with exitCode 7",
    async () => {
      process.env.FAKE_WORKER_EXIT = "7";
      delete process.env.FAKE_WORKER_SLEEP;
      try {
        const r = startJob({ prompt: "say fail", worker: "grok", noTmux: true });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const job = await waitForTerminal(r.job.id);
        expect(job.status).toBe("failed");
        expect(job.exitCode).toBe(7);
      } finally {
        delete process.env.FAKE_WORKER_EXIT;
      }
    },
    20000,
  );

  test(
    "kill running job → killed; second kill refused as terminal",
    async () => {
      process.env.FAKE_WORKER_SLEEP = "30";
      delete process.env.FAKE_WORKER_EXIT;
      try {
        const r = startJob({ prompt: "long job", worker: "grok", noTmux: true });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Give the detached spawn a beat so the pid is recorded and the shim is alive.
        await sleep(300);
        const k = killJob(r.job.id);
        expect(k.ok).toBe(true);
        if (k.ok) expect(k.job.status).toBe("killed");

        const again = killJob(r.job.id);
        expect(again.ok).toBe(false);
        if (!again.ok) expect(again.error).toContain("terminal");
      } finally {
        delete process.env.FAKE_WORKER_SLEEP;
      }
    },
    20000,
  );

  test(
    "concurrent limit: refuses start once active jobs reach CURSOR_ROUTE_MAX_JOBS",
    async () => {
      process.env.FAKE_WORKER_SLEEP = "30";
      delete process.env.FAKE_WORKER_EXIT;
      try {
        const a = startJob({ prompt: "job a", worker: "grok", noTmux: true });
        const b = startJob({ prompt: "job b", worker: "grok", noTmux: true });
        expect(a.ok).toBe(true);
        expect(b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(countActiveJobs()).toBe(2);

        const c = startJob({ prompt: "job c", worker: "grok", noTmux: true });
        expect(c.ok).toBe(false);
        if (!c.ok) expect(c.error).toContain("Too many active jobs");
      } finally {
        delete process.env.FAKE_WORKER_SLEEP;
        // Cleanup any running jobs so the tmpdir can be removed.
        for (const f of readdirSync(jobsDir)) {
          if (!f.endsWith(".json")) continue;
          const job = readJob(f.replace(/\.json$/, ""));
          if (job && (job.status === "running" || job.status === "pending")) killJob(job.id);
        }
      }
    },
    20000,
  );
});
