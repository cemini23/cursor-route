import type { WorkerKind, DsModelAlias } from "../config.ts";

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
  /** Extra env for the worker process (never print secret values). */
  env?: Record<string, string>;
}

export interface Adapter {
  kind: WorkerKind;
  label: string;
  health(): WorkerHealth;
  buildLaunch(opts: {
    promptFile: string;
    cwd: string;
    alwaysApprove: boolean;
    /** Mid-lane DeepSeek flash|pro|vision (claude-ds + deepseek; ignored by grok / Anthropic escape hatch). */
    model?: DsModelAlias;
    /** Concrete DeepSeek id (preserves pro[1m]) or OpenCode/OpenRouter provider/model. */
    modelId?: string;
    /** True on --dry-run: adapters may drop artifacts they just wrote (e.g. dsh patch). */
    dryRun?: boolean;
  }): LaunchPlan;
}
