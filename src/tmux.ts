import { spawnSync, execSync } from "node:child_process";
import { config, sessionName } from "./config.ts";
import { shellQuote } from "./util.ts";

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
  try {
    execSync(`tmux send-keys -t ${shellQuote(name)} -- ${shellQuote(message)}`, {
      stdio: "ignore",
    });
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
 * Create a detached tmux session that runs `workerCmd`, logs via `script`,
 * then marks the job complete and exits the session.
 */
export function createWorkerSession(options: {
  jobId: string;
  cwd: string;
  workerCmd: string;
  logFile: string;
  jobFile: string;
  markCompleteScript: string;
}): { ok: true; session: string } | { ok: false; error: string } {
  const name = sessionName(options.jobId);
  const isLinux = process.platform === "linux";

  const completion = [
    `exit_code=$?`,
    `bun ${shellQuote(options.markCompleteScript)} ${shellQuote(options.jobFile)} "$exit_code" ${shellQuote(options.logFile)}`,
    `echo ""`,
    `echo "[cursor-route: session complete — closing in 5s]"`,
    `sleep 5`,
    `tmux kill-session -t ${shellQuote(name)} 2>/dev/null || true`,
  ].join("; ");

  const wrapped = isLinux
    ? `script -q -e -c ${shellQuote(options.workerCmd)} ${shellQuote(options.logFile)}; ${completion}`
    : `script -q ${shellQuote(options.logFile)} ${options.workerCmd}; ${completion}`;

  const r = spawnSync(
    "tmux",
    ["new-session", "-d", "-s", name, "-c", options.cwd, wrapped],
    { encoding: "utf8", cwd: options.cwd },
  );

  if (r.status !== 0) {
    return {
      ok: false,
      error: (r.stderr || r.stdout || "tmux new-session failed").toString().trim(),
    };
  }
  return { ok: true, session: name };
}
