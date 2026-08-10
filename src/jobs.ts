import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  unlinkSync,
  createWriteStream,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { config, sessionName, type Lane, type WorkerKind } from "./config.ts";
import { getAdapter } from "./adapters/index.ts";
import { spawn } from "node:child_process";
import { createWorkerSession, sessionExists, killSession } from "./tmux.ts";
import { newJobId, shellQuote } from "./util.ts";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "killed";

export interface Job {
  id: string;
  schema: "cursor-route.job.v1";
  status: JobStatus;
  worker: WorkerKind;
  lane?: Lane;
  prompt: string;
  cwd: string;
  alwaysApprove: boolean;
  tmuxSession: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  logBytes?: number;
  logTail?: string;
}

function ensureJobsDir(): void {
  mkdirSync(config.jobsDir, { recursive: true });
}

export function jobPaths(id: string) {
  ensureJobsDir();
  return {
    json: join(config.jobsDir, `${id}.json`),
    prompt: join(config.jobsDir, `${id}.prompt`),
    log: join(config.jobsDir, `${id}.log`),
  };
}

export function readJob(id: string): Job | null {
  const p = jobPaths(id).json;
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Job;
  } catch {
    return null;
  }
}

export function writeJob(job: Job): void {
  writeFileSync(jobPaths(job.id).json, JSON.stringify(job, null, 2));
}

function refreshStatus(job: Job): Job {
  if (job.status === "running") {
    const alive = sessionExists(job.tmuxSession);
    if (!alive) {
      // Completion hook may already have written status; re-read.
      const fresh = readJob(job.id);
      if (fresh && fresh.status !== "running") return fresh;
      job.status = "completed";
      job.completedAt = job.completedAt || new Date().toISOString();
      writeJob(job);
    }
  }
  return job;
}

export function listJobs(limit = config.jobsListLimit): Job[] {
  ensureJobsDir();
  const files = readdirSync(config.jobsDir).filter((f) => f.endsWith(".json"));
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
  cwd?: string;
  alwaysApprove?: boolean;
  dryRun?: boolean;
  /** Background process without tmux (CI / hosts without tmux). No attach/send. */
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
  const alwaysApprove =
    opts.alwaysApprove !== false &&
    process.env.CURSOR_ROUTE_ASK !== "1" &&
    process.env.CLAUDE_DS_ASK !== "1";

  const id = newJobId();
  const paths = jobPaths(id);
  writeFileSync(paths.prompt, opts.prompt);

  const adapter = getAdapter(worker);
  let plan;
  try {
    plan = adapter.buildLaunch({
      promptFile: paths.prompt,
      cwd,
      alwaysApprove,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const job: Job = {
    id,
    schema: "cursor-route.job.v1",
    status: "pending",
    worker,
    lane: opts.lane,
    prompt: opts.prompt,
    cwd,
    alwaysApprove: plan.alwaysApprove,
    tmuxSession: sessionName(id),
    createdAt: new Date().toISOString(),
  };
  writeJob(job);

  if (opts.dryRun) {
    return { ok: true, job, dryRun: true, command: plan.command };
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const markComplete = join(here, "mark-complete.ts");

  if (opts.noTmux) {
    job.tmuxSession = `headless-${id}`;
    writeJob(job);
    const wrapped = [
      plan.command,
      `exit_code=$?`,
      `bun ${shellQuote(markComplete)} ${shellQuote(paths.json)} "$exit_code" ${shellQuote(paths.log)}`,
      `exit $exit_code`,
    ].join("; ");
    const child = spawn("sh", ["-c", wrapped], {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const logStream = createWriteStream(paths.log, { flags: "a" });
    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);
    child.unref();
    job.status = "running";
    job.startedAt = new Date().toISOString();
    writeJob(job);
    return { ok: true, job };
  }

  const created = createWorkerSession({
    jobId: id,
    cwd,
    workerCmd: plan.command,
    logFile: paths.log,
    jobFile: paths.json,
    markCompleteScript: markComplete,
  });

  if (!created.ok) {
    job.status = "failed";
    job.error = created.error;
    job.completedAt = new Date().toISOString();
    writeJob(job);
    return { ok: false, error: created.error };
  }

  job.status = "running";
  job.startedAt = new Date().toISOString();
  writeJob(job);
  return { ok: true, job };
}

export function killJob(id: string): { ok: true; job: Job } | { ok: false; error: string } {
  const job = readJob(id);
  if (!job) return { ok: false, error: `Job not found: ${id}` };
  killSession(job.tmuxSession);
  job.status = "killed";
  job.completedAt = new Date().toISOString();
  writeJob(job);
  return { ok: true, job };
}

export function cleanJobs(olderThanDays = 7): number {
  ensureJobsDir();
  const cutoff = Date.now() - olderThanDays * 86400000;
  let n = 0;
  for (const f of readdirSync(config.jobsDir)) {
    if (!f.endsWith(".json")) continue;
    const p = join(config.jobsDir, f);
    try {
      const job = JSON.parse(readFileSync(p, "utf8")) as Job;
      const t = Date.parse(job.completedAt || job.createdAt);
      if (
        Number.isFinite(t) &&
        t < cutoff &&
        (job.status === "completed" || job.status === "failed" || job.status === "killed")
      ) {
        const id = job.id;
        for (const ext of [".json", ".prompt", ".log"]) {
          const fp = join(config.jobsDir, `${id}${ext}`);
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
