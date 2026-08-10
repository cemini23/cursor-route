import { homedir } from "node:os";
import { join } from "node:path";

export type WorkerKind = "grok" | "claude-ds";
export type Lane = "mid" | "hard";

export const WORKERS: WorkerKind[] = ["grok", "claude-ds"];
export const LANES: Lane[] = ["mid", "hard"];

const home = process.env.HOME || homedir();

export const config = {
  product: "cursor-route",
  version: "0.1.0",
  jobsDir: process.env.CURSOR_ROUTE_JOBS_DIR || join(home, ".cursor-route", "jobs"),
  tmuxPrefix: "cursor-route",
  defaultWorker: "grok" as WorkerKind,
  /** Lane → default worker (Cemini /route public core). */
  laneWorkers: {
    mid: "claude-ds" as WorkerKind,
    hard: "grok" as WorkerKind,
  },
  jobsListLimit: 20,
  defaultTimeoutMin: 60,
};

export function sessionName(jobId: string): string {
  return `${config.tmuxPrefix}-${jobId}`;
}
