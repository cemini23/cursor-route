import { spawnSync, execSync } from "node:child_process";
import { config, sessionName } from "./config.ts";
import { shellQuote } from "./util.ts";
import { markCompleteInvoker } from "./runtime.ts";

export function isTmuxAvailable(): boolean {
  try {
    execSync("command -v tmux", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function sessionExists(name: string): boolean {
  try {
    execSync(`tmux has-session -t ${shellQuote(name)} 2>/dev/null`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function listManagedSessions(): string[] {
  try {
    const out = execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null', {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!out) return [];
    return out.split("\n").filter((n) => n.startsWith(`${config.tmuxPrefix}-`));
  } catch {
    return [];
  }
}

export function capturePane(name: string, lines = 50): string {
  try {
    return execSync(
      `tmux capture-pane -t ${shellQuote(name)} -p -S -${Math.max(1, lines)}`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    return "";
  }
}

export function sendKeys(name: string, message: string): boolean {
  if (!sessionExists(name)) return false;
  // Reject embedded newlines — they would submit early even with -l
  if (/[\r\n]/.test(message)) return false;
  try {
    // -l = literal keys (so "C-c" types text, does not SIGINT the worker)
    execSync(
      `tmux send-keys -l -t ${shellQuote(name)} -- ${shellQuote(message)}`,
      { stdio: "ignore" },
    );
    spawnSync("sleep", ["0.25"]);
    execSync(`tmux send-keys -t ${shellQuote(name)} Enter`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function killSession(name: string): boolean {
  try {
    execSync(`tmux kill-session -t ${shellQuote(name)}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function attachHint(jobId: string): string {
  return `tmux attach -t ${sessionName(jobId)}`;
}

/**
 * Create a detached tmux session that runs `workerCmd` via `sh -c` under `script`,
 * then marks the job complete and exits the session.
 * Always quote the shell expression so macOS BSD `script` does not split `cd && …`.
 */
export function createWorkerSession(options: {
  jobId: string;
  cwd: string;
  workerCmd: string;
  logFile: string;
  jobFile: string;
  markCompleteScript: string;
  env?: Record<string, string>;
}): { ok: true; session: string } | { ok: false; error: string } {
  const name = sessionName(options.jobId);
  const isLinux = process.platform === "linux";
  const invoker = markCompleteInvoker(options.markCompleteScript);

  const completion = [
    `exit_code=$?`,
    `${invoker} ${shellQuote(options.jobFile)} "$exit_code" ${shellQuote(options.logFile)}`,
    `echo ""`,
    `echo "[cursor-route: session complete — closing in 5s]"`,
    `sleep 5`,
    `tmux kill-session -t ${shellQuote(name)} 2>/dev/null || true`,
  ].join("; ");

  // Always run workerCmd under sh -c so `cd … && …` stays one expression.
  // Linux script: script -q -e -c '<cmd>' <logfile>
  // macOS script: script -q <logfile> <cmd> <args...>
  const wrapped = isLinux
    ? `script -q -e -c ${shellQuote(`/bin/sh -c ${shellQuote(options.workerCmd)}`)} ${shellQuote(options.logFile)}; ${completion}`
    : `script -q ${shellQuote(options.logFile)} /bin/sh -c ${shellQuote(options.workerCmd)}; ${completion}`;

  const args = ["new-session", "-d", "-s", name, "-c", options.cwd];
  if (options.env) {
    for (const [k, v] of Object.entries(options.env)) {
      args.push("-e", `${k}=${v}`);
    }
  }
  args.push(wrapped);

  const r = spawnSync("tmux", args, {
    encoding: "utf8",
    cwd: options.cwd,
  });

  if (r.status !== 0) {
    return {
      ok: false,
      error: (r.stderr || r.stdout || "tmux new-session failed").toString().trim(),
    };
  }
  return { ok: true, session: name };
}
