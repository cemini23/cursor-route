import type { WorkerKind } from "../config.ts";

export interface WorkerHealth {
  worker: WorkerKind;
  ok: boolean;
  binary: string | null;
  detail: string;
}

export interface LaunchPlan {
  worker: WorkerKind;
  /** Full shell command to run inside tmux (prompt already inlined via cat). */
  command: string;
  alwaysApprove: boolean;
}

export interface Adapter {
  kind: WorkerKind;
  label: string;
  health(): WorkerHealth;
  buildLaunch(opts: {
    promptFile: string;
    cwd: string;
    alwaysApprove: boolean;
  }): LaunchPlan;
}
