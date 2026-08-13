import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  unlinkSync,
  openSync,
  closeSync,
  chmodSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  config,
  sessionName,
  defaultDsModelFromEnv,
  DS_MODEL_IDS,
  type Lane,
  type WorkerKind,
  type DsModelAlias,
} from "./config.ts";
import { getAdapter } from "./adapters/index.ts";
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { createWorkerSession, sessionExists, killSession } from "./tmux.ts";
import { newJobId, shellQuote } from "./util.ts";
import { markCompleteInvoker } from "./runtime.ts";
import { assertJobId, JOB_ID_RE } from "./secrets.ts";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "killed";

export interface Job {
  id: string;
  schema: "cursor-route.job.v1";
  status: JobStatus;
  worker: WorkerKind;
  lane?: Lane;
  /** Mid-lane DeepSeek model alias (flash|pro). Only set for claude-ds. */
  model?: DsModelAlias;
  prompt: string;
  cwd: string;
  alwaysApprove: boolean;
  tmuxSession: string;
  /** Headless process id (process group leader). */
  pid?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  logBytes?: number;
  logTail?: string;
  exitCode?: number;
}

function ensureJobsDir(): void {
  mkdirSync(config.jobsDir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(config.jobsDir, 0o700);
  } catch {
    /* ignore */
  }
}

function writeSecure(path: string, data: string): void {
  writeFileSync(path, data, { mode: 0o600 });
}

function underJobsDir(id: string, ext: string): string {
  assertJobId(id);
  const base = resolve(config.jobsDir);
  const full = resolve(join(base, `${id}${ext}`));
  if (!full.startsWith(base + "/") && full !== base) {
    throw new Error("Job path escapes jobsDir");
  }
  return full;
}

export function jobPaths(id: string) {
  ensureJobsDir();
  return {
    json: underJobsDir(id, ".json"),
    prompt: underJobsDir(id, ".prompt"),
    log: underJobsDir(id, ".log"),
  };
}

export function readJob(id: string): Job | null {
  try {
    assertJobId(id);
  } catch {
    return null;
  }
  const p = jobPaths(id).json;
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Job;
  } catch {
    return null;
  }
}

export function writeJob(job: Job): void {
  writeSecure(jobPaths(job.id).json, JSON.stringify(job, null, 2));
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  // kill(pid, 0) stays true for zombies, and terminatePid's sync waits block the
  // event loop so children can sit unreaped as zombies — a zombie is not a worker.
  try {
    const r = spawnSync("ps", ["-o", "state=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const state = (r.stdout || "").trim();
    return state !== "" && !state.startsWith("Z");
  } catch {
    return true;
  }
}

function sleepMs(ms: number): void {
  spawnSync("sleep", [String(ms / 1000)]);
}

function terminatePid(pid: number): boolean {
  const trySignal = (sig: NodeJS.Signals | number, group: boolean) => {
    try {
      process.kill(group ? -pid : pid, sig);
      return true;
    } catch {
      return false;
    }
  };
  trySignal("SIGTERM", true);
  trySignal("SIGTERM", false);
  for (let i = 0; i < 10; i++) {
    if (!pidAlive(pid)) return true;
    sleepMs(100);
  }
  trySignal("SIGKILL", true);
  trySignal("SIGKILL", false);
  for (let i = 0; i < 10; i++) {
    if (!pidAlive(pid)) return true;
    sleepMs(100);
  }
  return !pidAlive(pid);
}

/** Refresh running jobs without inventing success from "session gone". */
export function refreshStatus(job: Job): Job {
  if (job.status !== "running") return job;

  // Prefer completion-hook result if already written.
  const fresh = readJob(job.id);
  if (fresh && fresh.status !== "running") return fresh;

  const headless = job.tmuxSession.startsWith("headless-");
  if (headless) {
    if (job.pid && pidAlive(job.pid)) return job;
    if (job.pid && !pidAlive(job.pid)) {
      // Process exited but hook may not have run — mark unknown failure, not success.
      const again = readJob(job.id);
      if (again && again.status !== "running") return again;
      job.status = "failed";
      job.error = job.error || "Headless worker exited without completion marker";
      job.completedAt = new Date().toISOString();
      writeJob(job);
      return job;
    }
    // No pid recorded (legacy) — do not flip to completed.
    return job;
  }

  // tmux path: session gone → re-read; if still running, mark failed (unknown), not completed.
  if (!sessionExists(job.tmuxSession)) {
    const again = readJob(job.id);
    if (again && again.status !== "running") return again;
    job.status = "failed";
    job.error = job.error || "tmux session ended without completion marker";
    job.completedAt = new Date().toISOString();
    writeJob(job);
  }
  return job;
}

export function countActiveJobs(): number {
  ensureJobsDir();
  let n = 0;
  for (const f of readdirSync(config.jobsDir)) {
    if (!f.endsWith(".json")) continue;
    const id = f.replace(/\.json$/, "");
    if (!JOB_ID_RE.test(id)) continue;
    try {
      const job = JSON.parse(readFileSync(join(config.jobsDir, f), "utf8")) as Job;
      if (job?.schema === "cursor-route.job.v1" && (job.status === "running" || job.status === "pending")) {
        n++;
      }
    } catch {
      /* skip */
    }
  }
  return n;
}

export function listJobs(limit = config.jobsListLimit): Job[] {
  ensureJobsDir();
  const files = readdirSync(config.jobsDir).filter(
    (f) => f.endsWith(".json") && JOB_ID_RE.test(f.replace(/\.json$/, "")),
  );
  const jobs: Job[] = [];
  for (const f of files) {
    try {
      const job = JSON.parse(readFileSync(join(config.jobsDir, f), "utf8")) as Job;
      if (job?.schema === "cursor-route.job.v1") jobs.push(refreshStatus(job));
    } catch {
      /* skip */
    }
  }
  jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return jobs.slice(0, limit);
}

export interface StartOptions {
  prompt: string;
  worker?: WorkerKind;
  lane?: Lane;
  /** Mid-lane DeepSeek: flash (default) | pro. Ignored by grok/openrouter. */
  model?: DsModelAlias;
  /** Concrete DeepSeek id (preserves pro[1m]). Derived from --model / env when unset. */
  modelId?: string;
  cwd?: string;
  alwaysApprove?: boolean;
  dryRun?: boolean;
  noTmux?: boolean;
}

export function resolveWorker(opts: StartOptions): WorkerKind {
  if (opts.worker) return opts.worker;
  if (opts.lane) return config.laneWorkers[opts.lane];
  return config.defaultWorker;
}

export function startJob(opts: StartOptions): {
  ok: true;
  job: Job;
  dryRun?: boolean;
  command?: string;
} | { ok: false; error: string } {
  const worker = resolveWorker(opts);
  const cwd = opts.cwd || process.cwd();
  // CURSOR_ROUTE_ASK applies to all workers; CLAUDE_DS_ASK is mid-lane only
  const alwaysApprove =
    opts.alwaysApprove !== false &&
    process.env.CURSOR_ROUTE_ASK !== "1" &&
    !(worker === "claude-ds" && process.env.CLAUDE_DS_ASK === "1");

  if (!opts.dryRun) {
    const active = countActiveJobs();
    if (active >= config.maxConcurrentJobs) {
      return {
        ok: false,
        error: `Too many active jobs (${active} >= ${config.maxConcurrentJobs}) — wait for jobs to finish or raise CURSOR_ROUTE_MAX_JOBS`,
      };
    }
  }

  // Preflight: requested worker must be healthy
  const adapter = getAdapter(worker);
  const health = adapter.health();
  if (!health.ok && !opts.dryRun) {
    return { ok: false, error: `Worker ${worker} unavailable: ${health.detail}` };
  }

  const id = newJobId();
  const paths = jobPaths(id);
  writeSecure(paths.prompt, opts.prompt);

  let model: DsModelAlias | undefined;
  let modelId: string | undefined;
  if (worker === "claude-ds") {
    if (opts.model) {
      model = opts.model;
      modelId = opts.modelId ?? DS_MODEL_IDS[opts.model];
    } else {
      try {
        const choice = defaultDsModelFromEnv();
        model = choice.alias;
        modelId = opts.modelId ?? choice.id;
      } catch (e) {
        try {
          unlinkSync(paths.prompt);
        } catch {
          /* ignore */
        }
        return { ok: false, error: (e as Error).message };
      }
    }
  }

  let plan;
  try {
    plan = adapter.buildLaunch({
      promptFile: paths.prompt,
      cwd,
      alwaysApprove,
      model,
      modelId,
    });
  } catch (e) {
    try {
      unlinkSync(paths.prompt);
    } catch {
      /* ignore */
    }
    return { ok: false, error: (e as Error).message };
  }

  const job: Job = {
    id,
    schema: "cursor-route.job.v1",
    status: "pending",
    worker,
    lane: opts.lane,
    model,
    prompt: opts.prompt,
    cwd,
    alwaysApprove: plan.alwaysApprove,
    tmuxSession: opts.noTmux ? `headless-${id}` : sessionName(id),
    createdAt: new Date().toISOString(),
  };

  if (opts.dryRun) {
    // No durable prompt retention for dry-run
    try {
      unlinkSync(paths.prompt);
    } catch {
      /* ignore */
    }
    const envNote = plan.env
      ? ` (+env: ${Object.keys(plan.env).join(",")})`
      : "";
    return {
      ok: true,
      job,
      dryRun: true,
      command: plan.command + envNote,
    };
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const markComplete = join(here, "mark-complete.ts");
  const invoker = markCompleteInvoker(markComplete);

  // Persist running BEFORE launch so fast workers cannot race completion overwrite.
  job.status = "running";
  job.startedAt = new Date().toISOString();
  writeJob(job);

  if (opts.noTmux) {
    const wrapped = [
      plan.command,
      `exit_code=$?`,
      `${invoker} ${shellQuote(paths.json)} "$exit_code" ${shellQuote(paths.log)}`,
      `exit $exit_code`,
    ].join("; ");

    let logFd: number | undefined;
    try {
      logFd = openSync(paths.log, "a", 0o600);
    } catch (e) {
      job.status = "failed";
      job.error = `Cannot open log: ${(e as Error).message}`;
      job.completedAt = new Date().toISOString();
      writeJob(job);
      return { ok: false, error: job.error };
    }

    const child = spawn("sh", ["-c", wrapped], {
      cwd,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: plan.env ? { ...process.env, ...plan.env } : process.env,
    });
    try {
      closeSync(logFd);
    } catch {
      /* ignore */
    }

    if (child.pid == null) {
      job.status = "failed";
      job.error = "Failed to spawn headless worker";
      job.completedAt = new Date().toISOString();
      writeJob(job);
      return { ok: false, error: job.error };
    }

    // Merge-on-write: only set pid if still running (avoid clobbering mark-complete)
    const latest = readJob(id) || job;
    if (latest.status === "running" || latest.status === "pending") {
      latest.pid = child.pid;
      writeJob(latest);
      Object.assign(job, latest);
    }
    child.unref();
    return { ok: true, job };
  }

  const created = createWorkerSession({
    jobId: id,
    cwd,
    workerCmd: plan.command,
    logFile: paths.log,
    jobFile: paths.json,
    markCompleteScript: markComplete,
    env: plan.env,
  });

  if (!created.ok) {
    job.status = "failed";
    job.error = created.error;
    job.completedAt = new Date().toISOString();
    writeJob(job);
    return { ok: false, error: created.error };
  }

  // Re-read before final write — mark-complete may have already finished
  const after = readJob(id) || job;
  if (after.status === "running" || after.status === "pending") {
    writeJob(after);
  }
  return { ok: true, job: after };
}

export function killJob(id: string): { ok: true; job: Job } | { ok: false; error: string } {
  const job = readJob(id);
  if (!job) return { ok: false, error: `Job not found: ${id}` };

  if (job.status === "completed" || job.status === "failed" || job.status === "killed") {
    return { ok: false, error: `Job already terminal (${job.status}) — refuse kill rewrite` };
  }

  if (job.tmuxSession.startsWith("headless-")) {
    if (job.pid) {
      const ok = terminatePid(job.pid);
      if (!ok) {
        return { ok: false, error: `Failed to kill pid ${job.pid}` };
      }
    } else {
      return {
        ok: false,
        error: "Headless job has no pid — cannot kill (legacy job). Kill the worker process manually.",
      };
    }
  } else {
    const killed = killSession(job.tmuxSession);
    if (!killed && sessionExists(job.tmuxSession)) {
      return { ok: false, error: `Failed to kill tmux session ${job.tmuxSession}` };
    }
  }

  // Merge-on-write: do not clobber a completion that landed mid-kill
  const latest = readJob(id) || job;
  if (latest.status === "completed" || latest.status === "failed") {
    return { ok: false, error: `Job finished during kill (${latest.status})` };
  }
  latest.status = "killed";
  latest.completedAt = new Date().toISOString();
  writeJob(latest);
  return { ok: true, job: latest };
}

export function cleanJobs(olderThanDays = 7): number {
  ensureJobsDir();
  const cutoff = Date.now() - olderThanDays * 86400000;
  let n = 0;
  for (const f of readdirSync(config.jobsDir)) {
    if (!f.endsWith(".json")) continue;
    const id = f.replace(/\.json$/, "");
    if (!JOB_ID_RE.test(id)) continue;
    try {
      const job = JSON.parse(readFileSync(join(config.jobsDir, f), "utf8")) as Job;
      const t = Date.parse(job.completedAt || job.createdAt);
      if (
        Number.isFinite(t) &&
        t < cutoff &&
        (job.status === "completed" || job.status === "failed" || job.status === "killed")
      ) {
        for (const ext of [".json", ".prompt", ".log"] as const) {
          const fp = underJobsDir(id, ext);
          if (existsSync(fp)) unlinkSync(fp);
        }
        n++;
      }
    } catch {
      /* skip */
    }
  }
  return n;
}
