#!/usr/bin/env bun
/**
 * cursor-route CLI — Cursor brain, Grok + DeepSeek workers in tmux.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { config, WORKERS, LANES, type WorkerKind, type Lane } from "./config.ts";
import { runHealth, printHealth } from "./health.ts";
import {
  startJob,
  listJobs,
  readJob,
  killJob,
  cleanJobs,
  jobPaths,
} from "./jobs.ts";
import {
  capturePane,
  sendKeys,
  attachHint,
  listManagedSessions,
  sessionExists,
} from "./tmux.ts";

function usage(): never {
  console.log(`cursor-route v${config.version}

Cursor stays the brain. Grok CLI + DeepSeek (claude-ds) are the parallel army.

Usage:
  cursor-route health [--json]
  cursor-route start <prompt> [options]
  cursor-route start --prompt-file <path> [options]
  cursor-route jobs [--json] [--limit N]
  cursor-route status <jobId> [--json]
  cursor-route capture <jobId> [lines]
  cursor-route send <jobId> <message>
  cursor-route attach <jobId>
  cursor-route kill <jobId>
  cursor-route sessions
  cursor-route clean [--days N]

Start options:
  --worker <grok|claude-ds>   Worker adapter (default: grok)
  --lane <mid|hard>           Cemini /route lane → worker (mid=claude-ds, hard=grok)
  --dir <path>                Working directory (default: cwd)
  --ask                       Disable always-approve for this job
  --dry-run                   Print launch command; do not start tmux
  --no-tmux                   Headless background process (no attach/send)
  --json                      JSON output where supported

Env:
  CURSOR_ROUTE_ASK=1          Global opt-out of always-approve
  CURSOR_ROUTE_JOBS_DIR       Override ~/.cursor-route/jobs
`);
  process.exit(0);
}

function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (
      a === "--json" ||
      a === "--ask" ||
      a === "--dry-run" ||
      a === "--no-tmux" ||
      a === "-h" ||
      a === "--help"
    ) {
      if (a === "-h" || a === "--help") flags.help = true;
      if (a === "--dry-run") flags.dryRun = true;
      if (a === "--no-tmux") flags.noTmux = true;
      if (a === "--ask") flags.ask = true;
      if (a === "--json") flags.json = true;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = val;
        i++;
      }
      continue;
    }
    positional.push(a);
  }
  return { flags, positional };
}

function asWorker(v: unknown): WorkerKind | undefined {
  if (typeof v !== "string") return undefined;
  if ((WORKERS as string[]).includes(v)) return v as WorkerKind;
  throw new Error(`Invalid --worker ${v}; expected ${WORKERS.join("|")}`);
}

function asLane(v: unknown): Lane | undefined {
  if (typeof v !== "string") return undefined;
  if ((LANES as string[]).includes(v)) return v as Lane;
  throw new Error(`Invalid --lane ${v}; expected ${LANES.join("|")}`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") usage();

  const cmd = argv[0];
  const { flags, positional } = parseArgs(argv.slice(1));
  const json = Boolean(flags.json);

  if (cmd === "health") {
    const report = runHealth();
    printHealth(report, json);
    process.exit(report.ok ? 0 : 1);
  }

  if (cmd === "start") {
    let prompt = "";
    if (flags["prompt-file"]) {
      const p = resolve(String(flags["prompt-file"]));
      if (!existsSync(p)) {
        console.error(`prompt file not found: ${p}`);
        process.exit(2);
      }
      prompt = readFileSync(p, "utf8");
    } else {
      prompt = positional.join(" ").trim();
    }
    if (!prompt) {
      console.error("start requires a prompt or --prompt-file");
      process.exit(2);
    }

    // Secret-deny soft check
    if (/(api[_-]?key|sk-[a-zA-Z0-9]|BEGIN (RSA |OPENSSH )?PRIVATE KEY)/i.test(prompt)) {
      console.error(
        "Refusing to start: prompt looks like it contains secrets. Remove keys and retry.",
      );
      process.exit(3);
    }

    const result = startJob({
      prompt,
      worker: asWorker(flags.worker),
      lane: asLane(flags.lane),
      cwd: flags.dir ? resolve(String(flags.dir)) : process.cwd(),
      alwaysApprove: !flags.ask,
      dryRun: Boolean(flags.dryRun),
      noTmux: Boolean(flags.noTmux),
    });

    if (!result.ok) {
      console.error(result.error);
      process.exit(1);
    }

    if (json) {
      console.log(JSON.stringify({ ...result.job, command: result.command }, null, 2));
    } else if (result.dryRun) {
      console.log(`dry-run job ${result.job.id}`);
      console.log(`worker: ${result.job.worker}`);
      console.log(`command: ${result.command}`);
    } else {
      console.log(`started ${result.job.id} (${result.job.worker})`);
      console.log(`session: ${result.job.tmuxSession}`);
      if (String(result.job.tmuxSession).startsWith("headless-")) {
        console.log(`mode:    headless (--no-tmux); use capture/status (no attach/send)`);
      } else {
        console.log(`attach:  ${attachHint(result.job.id)}`);
      }
      console.log(`capture: cursor-route capture ${result.job.id}`);
    }
    return;
  }

  if (cmd === "jobs") {
    const limit = flags.limit ? Number(flags.limit) : config.jobsListLimit;
    const jobs = listJobs(limit);
    if (json) {
      console.log(JSON.stringify(jobs, null, 2));
    } else if (jobs.length === 0) {
      console.log("No jobs yet. Try: cursor-route start \"say hello\" --worker grok");
    } else {
      for (const j of jobs) {
        const age = j.startedAt || j.createdAt;
        console.log(
          `${j.id}  ${j.status.padEnd(10)}  ${j.worker.padEnd(10)}  ${age}  ${j.prompt.slice(0, 48).replace(/\n/g, " ")}`,
        );
      }
    }
    return;
  }

  if (cmd === "status") {
    const id = positional[0];
    if (!id) {
      console.error("status requires <jobId>");
      process.exit(2);
    }
    const job = readJob(id);
    if (!job) {
      console.error(`Job not found: ${id}`);
      process.exit(1);
    }
    const alive = sessionExists(job.tmuxSession);
    const view = { ...job, sessionAlive: alive };
    if (json) console.log(JSON.stringify(view, null, 2));
    else {
      console.log(`${job.id}  ${job.status}  worker=${job.worker}  sessionAlive=${alive}`);
      if (job.error) console.log(`error: ${job.error}`);
    }
    return;
  }

  if (cmd === "capture") {
    const id = positional[0];
    const lines = positional[1] ? Number(positional[1]) : 50;
    if (!id) {
      console.error("capture requires <jobId>");
      process.exit(2);
    }
    const job = readJob(id);
    if (!job) {
      console.error(`Job not found: ${id}`);
      process.exit(1);
    }
    if (sessionExists(job.tmuxSession)) {
      const out = capturePane(job.tmuxSession, lines);
      process.stdout.write(out.endsWith("\n") ? out : out + "\n");
      return;
    }
    const logPath = jobPaths(id).log;
    if (existsSync(logPath)) {
      const log = readFileSync(logPath, "utf8");
      const parts = log.split("\n");
      console.log(parts.slice(-lines).join("\n"));
      return;
    }
    console.error("No live session or log for this job");
    process.exit(1);
  }

  if (cmd === "send") {
    const id = positional[0];
    const message = positional.slice(1).join(" ").trim();
    if (!id || !message) {
      console.error('send requires <jobId> "<message>"');
      process.exit(2);
    }
    const job = readJob(id);
    if (!job) {
      console.error(`Job not found: ${id}`);
      process.exit(1);
    }
    if (!sendKeys(job.tmuxSession, message)) {
      console.error(`Failed to send — is session alive? ${attachHint(id)}`);
      process.exit(1);
    }
    console.log(`sent to ${id}`);
    return;
  }

  if (cmd === "attach") {
    const id = positional[0];
    if (!id) {
      console.error("attach requires <jobId>");
      process.exit(2);
    }
    console.log(attachHint(id));
    return;
  }

  if (cmd === "kill") {
    const id = positional[0];
    if (!id) {
      console.error("kill requires <jobId>");
      process.exit(2);
    }
    const r = killJob(id);
    if (!r.ok) {
      console.error(r.error);
      process.exit(1);
    }
    console.log(`killed ${id}`);
    return;
  }

  if (cmd === "sessions") {
    const sessions = listManagedSessions();
    if (json) console.log(JSON.stringify(sessions, null, 2));
    else if (sessions.length === 0) console.log("No active cursor-route tmux sessions");
    else sessions.forEach((s) => console.log(s));
    return;
  }

  if (cmd === "clean") {
    const days = flags.days ? Number(flags.days) : 7;
    const n = cleanJobs(days);
    console.log(`cleaned ${n} job(s) older than ${days}d`);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  usage();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
