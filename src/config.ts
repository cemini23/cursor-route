import { homedir } from "node:os";
import { join } from "node:path";
import { defaultJobsDir } from "./runtime.ts";

export type WorkerKind = "grok" | "claude-ds";
export type Lane = "mid" | "hard";

export const WORKERS: WorkerKind[] = ["grok", "claude-ds"];
export const LANES: Lane[] = ["mid", "hard"];

export const config = {
  product: "cursor-route",
  version: "0.1.2",
  jobsDir: defaultJobsDir(),
  tmuxPrefix: "cursor-route",
  defaultWorker: "grok" as WorkerKind,
  /** Lane → default worker (Cemini /route public core). */
  laneWorkers: {
    mid: "claude-ds" as WorkerKind,
    hard: "grok" as WorkerKind,
  },
  jobsListLimit: 20,
};

export function sessionName(jobId: string): string {
  return `${config.tmuxPrefix}-${jobId}`;
}

/** Home for docs only — not used as jobsDir. */
export function productHomeHint(): string {
  return join(process.env.HOME || homedir(), ".cursor-route");
}
