#!/usr/bin/env bun
/**
 * cursor-route CLI — Cursor brain, Grok + DeepSeek workers in tmux.
 */
import { readFileSync, existsSync, realpathSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";
import { config, WORKERS, LANES, type WorkerKind, type Lane } from "./config.ts";
import { runHealth, printHealth } from "./health.ts";
import {
  startJob,
  listJobs,
  readJob,
  killJob,
  cleanJobs,
  jobPaths,
  refreshStatus,
} from "./jobs.ts";
import {
  capturePane,
  sendKeys,
  attachHint,
  listManagedSessions,
  sessionExists,
} from "./tmux.ts";
import { looksLikeSecretMaterial, redactSecrets } from "./secrets.ts";

function usage(exitCode = 0): never {
  console.log(`cursor-route v${config.version}

Cursor stays the brain. Grok CLI + DeepSeek (claude-ds) are the parallel army.

Usage:
  cursor-route --version
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
  --lane <mid|hard>           Lane → worker (mid=claude-ds, hard=grok)
  --dir <path>                Working directory (default: cwd)
  --ask                       Disable always-approve for this job
  --dry-run                   Print launch command; do not start
  --no-tmux                   Headless background process (no attach/send)
  --json                      JSON output where supported

Env:
  CURSOR_ROUTE_ASK=1                 Opt out of always-approve
  CURSOR_ROUTE_JOBS_DIR              Override jobs dir (default: ~/.local/share/cursor-route/jobs)
  CURSOR_ROUTE_MAX_JOBS              Max active jobs (default: 50)
  CURSOR_ROUTE_RELAXED=1             health OK without tmux/workers (CI / infra smoke)
  CURSOR_ROUTE_ALLOW_ANTHROPIC=1     Allow mid-lane on Anthropic Claude (expensive; not default)
  CURSOR_ROUTE_GROK_BIN              Override the grok binary path (tests / power users)
  CURSOR_ROUTE_CLAUDE_DS_BIN         Override the claude-ds binary path (tests / power users)
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (
      a === "--json" ||
      a === "--ask" ||
      a === "--dry-run" ||
      a === "--no-tmux" ||
      a === "-h" ||
      a === "--help" ||
      a === "--version" ||
      a === "-V"
    ) {
      if (a === "-h" || a === "--help") flags.help = true;
      if (a === "--version" || a === "-V") flags.version = true;
      if (a === "--dry-run") flags.dryRun = true;
      if (a === "--no-tmux") flags.noTmux = true;
      if (a === "--ask") flags.ask = true;
      if (a === "--json") flags.json = true;
      continue;
    }
    if (a.startsWith("--")) {
      let key = a.slice(2);
      let val: string | boolean = true;
      if (key.includes("=")) {
        const eq = key.indexOf("=");
        val = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          val = next;
          i++;
        }
      }
      flags[key] = val;
      continue;
    }
    positional.push(a);
  }
  return { flags, positional };
}

/** Require a string value for flags that must not be bare booleans. */
function requireStringFlag(
  flags: Record<string, string | boolean>,
  key: string,
): string | undefined {
  if (!(key in flags)) return undefined;
  const v = flags[key];
  if (typeof v !== "string" || !v.trim()) {
    console.error(`--${key} requires a value`);
    process.exit(2);
  }
  return v;
}

function requireNonNegNumber(raw: string | undefined, label: string, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`${label} must be a non-negative number`);
    process.exit(2);
  }
  return n;
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

function refuseSecrets(text: string, context: string): void {
  if (looksLikeSecretMaterial(text)) {
    console.error(
      `Refusing ${context}: looks like secret key material. Remove tokens/keys and retry.`,
    );
    process.exit(3);
  }
}

function refuseDangerousPromptFile(path: string): void {
  let resolved: string;
  try {
    resolved = realpathSync(path);
  } catch {
    resolved = resolve(path);
  }
  const base = basename(resolved);
  const lower = resolved.toLowerCase();
  if (
    base.startsWith(".env") ||
    lower.includes("/.ssh/") ||
    lower.includes("/.aws/") ||
    lower.includes("/.kube/") ||
    base === ".npmrc" ||
    base === ".git-credentials" ||
    base === ".pgpass" ||
    base === "id_rsa" ||
    base === "id_ed25519" ||
    base === "id_ecdsa" ||
    base === "id_dsa" ||
    base === "credentials" ||
    base.endsWith(".pem") ||
    base.endsWith(".key") ||
    base.endsWith(".p12") ||
    base.endsWith(".pfx")
  ) {
    console.error(`Refusing --prompt-file path that looks credential-related: ${path}`);
    process.exit(3);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) usage(0);

  if (argv[0] === "--version" || argv[0] === "-V") {
    console.log(config.version);
    return;
  }
  if (argv[0] === "-h" || argv[0] === "--help") usage(0);

  const cmd = argv[0];
  const { flags: f, positional: pos } = parseArgs(argv.slice(1));
  const json = Boolean(f.json);

  if (cmd === "health") {
    const report = runHealth();
    printHealth(report, json);
    process.exit(report.ok ? 0 : 1);
  }

  if (cmd === "start") {
    requireStringFlag(f, "worker");
    requireStringFlag(f, "lane");
    const promptFile = requireStringFlag(f, "prompt-file");
    const dirFlag = requireStringFlag(f, "dir");

    let prompt = "";
    if (promptFile) {
      const p = resolve(promptFile);
      refuseDangerousPromptFile(p);
      if (!existsSync(p)) {
        console.error(`prompt file not found: ${p}`);
        process.exit(2);
      }
      prompt = readFileSync(p, "utf8");
    } else {
      prompt = pos.join(" ").trim();
    }
    if (!prompt) {
      console.error("start requires a prompt or --prompt-file");
      process.exit(2);
    }
    refuseSecrets(prompt, "to start");

    let cwd = process.cwd();
    if (dirFlag) {
      cwd = resolve(dirFlag);
      try {
        if (!statSync(cwd).isDirectory()) {
          console.error(`--dir is not a directory: ${cwd}`);
          process.exit(2);
        }
      } catch {
        console.error(`--dir does not exist: ${cwd}`);
        process.exit(2);
      }
    }

    const result = startJob({
      prompt,
      worker: asWorker(f.worker),
      lane: asLane(f.lane),
      cwd,
      alwaysApprove: !f.ask,
      dryRun: Boolean(f.dryRun),
      noTmux: Boolean(f.noTmux),
    });

    if (!result.ok) {
      console.error(result.error);
      process.exit(1);
    }

    if (json) {
      console.log(
        JSON.stringify(
          {
            ...result.job,
            command: result.command ? redactSecrets(result.command) : result.command,
          },
          null,
          2,
        ),
      );
    } else if (result.dryRun) {
      console.log(`dry-run job ${result.job.id}`);
      console.log(`worker: ${result.job.worker}`);
      console.log(`command: ${redactSecrets(result.command || "")}`);
    } else {
      console.log(`started ${result.job.id} (${result.job.worker})`);
      console.log(`session: ${result.job.tmuxSession}`);
      if (String(result.job.tmuxSession).startsWith("headless-")) {
        console.log(`mode:    headless (--no-tmux); use capture/status (no attach/send)`);
        if (result.job.pid) console.log(`pid:     ${result.job.pid}`);
      } else {
        console.log(`attach:  ${attachHint(result.job.id)}`);
      }
      console.log(`capture: cursor-route capture ${result.job.id}`);
    }
    return;
  }

  if (cmd === "jobs") {
    const limitRaw = requireStringFlag(f, "limit");
    const limit = requireNonNegNumber(limitRaw, "--limit", config.jobsListLimit);
    const jobs = listJobs(limit);
    if (json) {
      console.log(JSON.stringify(jobs, null, 2));
    } else if (jobs.length === 0) {
      console.log('No jobs yet. Try: cursor-route start "say hello" --worker grok');
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
    const id = pos[0];
    if (!id) {
      console.error("status requires <jobId>");
      process.exit(2);
    }
    let job = readJob(id);
    if (!job) {
      console.error(`Job not found: ${id}`);
      process.exit(1);
    }
    job = refreshStatus(job);
    const alive = job.tmuxSession.startsWith("headless-")
      ? Boolean(job.pid && (() => {
          try {
            process.kill(job!.pid!, 0);
            return true;
          } catch {
            return false;
          }
        })())
      : sessionExists(job.tmuxSession);
    const view = { ...job, sessionAlive: alive };
    if (json) console.log(JSON.stringify(view, null, 2));
    else {
      console.log(`${job.id}  ${job.status}  worker=${job.worker}  sessionAlive=${alive}`);
      if (job.error) console.log(`error: ${job.error}`);
    }
    return;
  }

  if (cmd === "capture") {
    const id = pos[0];
    const linesRaw = pos[1];
    const lines = linesRaw
      ? requireNonNegNumber(linesRaw, "capture lines", 50)
      : 50;
    if (!id) {
      console.error("capture requires <jobId>");
      process.exit(2);
    }
    const job = readJob(id);
    if (!job) {
      console.error(`Job not found: ${id}`);
      process.exit(1);
    }
    if (!job.tmuxSession.startsWith("headless-") && sessionExists(job.tmuxSession)) {
      const out = capturePane(job.tmuxSession, lines);
      if (out.trim()) {
        process.stdout.write(out.endsWith("\n") ? out : out + "\n");
        return;
      }
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
    const id = pos[0];
    const message = pos.slice(1).join(" ").trim();
    if (!id || !message) {
      console.error('send requires <jobId> "<message>"');
      process.exit(2);
    }
    refuseSecrets(message, "to send");
    const job = readJob(id);
    if (!job) {
      console.error(`Job not found: ${id}`);
      process.exit(1);
    }
    if (job.tmuxSession.startsWith("headless-")) {
      console.error("send is not supported for --no-tmux jobs");
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
    const id = pos[0];
    if (!id) {
      console.error("attach requires <jobId>");
      process.exit(2);
    }
    const job = readJob(id);
    if (!job) {
      console.error(`Job not found: ${id}`);
      process.exit(1);
    }
    if (job.tmuxSession.startsWith("headless-")) {
      console.error("headless job — use capture/status (no tmux attach)");
      process.exit(1);
    }
    console.log(attachHint(id));
    return;
  }

  if (cmd === "kill") {
    const id = pos[0];
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
    const daysRaw = requireStringFlag(f, "days");
    const days = requireNonNegNumber(daysRaw, "--days", 7);
    const n = cleanJobs(days);
    console.log(`cleaned ${n} job(s) older than ${days}d`);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  usage(2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
