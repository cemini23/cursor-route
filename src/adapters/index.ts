import type { WorkerKind } from "../config.ts";
import type { Adapter } from "./types.ts";
import { grokAdapter } from "./grok.ts";
import { claudeDsAdapter } from "./claude-ds.ts";
import { openRouterAdapter } from "./openrouter.ts";
import { deepseekAdapter } from "./deepseek.ts";

const registry: Record<WorkerKind, Adapter> = {
  grok: grokAdapter,
  "claude-ds": claudeDsAdapter,
  openrouter: openRouterAdapter,
  deepseek: deepseekAdapter,
};

export function getAdapter(worker: WorkerKind): Adapter {
  const a = registry[worker];
  if (!a) throw new Error(`Unknown worker: ${worker}`);
  return a;
}

export function allAdapters(): Adapter[] {
  return Object.values(registry);
}

export type { Adapter, WorkerHealth, LaunchPlan } from "./types.ts";
