import { execSync } from "node:child_process";
import { allAdapters } from "./adapters/index.ts";
import { isMidDeepSeekProven, midDeepSeekProofDetail } from "./adapters/claude-ds.ts";
import { config } from "./config.ts";
import { isTmuxAvailable } from "./tmux.ts";
import { commandExists } from "./util.ts";

export interface HealthReport {
  ok: boolean;
  product: string;
  version: string;
  checks: Array<{
    name: string;
    ok: boolean;
    detail: string;
  }>;
  lanes: {
    mid: { worker: "claude-ds"; deepseek: boolean; detail: string };
  };
}

export function runHealth(): HealthReport {
  const checks: HealthReport["checks"] = [];

  const tmuxOk = isTmuxAvailable();
  checks.push({
    name: "tmux",
    ok: tmuxOk,
    detail: tmuxOk
      ? "ok"
      : "missing — install: brew install tmux (macOS) or apt install tmux (Linux)",
  });

  const bunOk = commandExists("bun");
  const nodeOk = commandExists("node");
  checks.push({
    name: "runtime",
    ok: bunOk || nodeOk,
    detail: bunOk ? "bun ok" : nodeOk ? "node ok (compiled dist)" : "need bun or node 20+",
  });

  const scriptOk = (() => {
    try {
      execSync("command -v script", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  checks.push({
    name: "script(1)",
    ok: scriptOk,
    detail: scriptOk ? "ok (tty log capture)" : "missing — needed for job logs on macOS/Linux",
  });

  for (const adapter of allAdapters()) {
    const h = adapter.health();
    checks.push({
      name: `worker:${h.worker}`,
      ok: h.ok,
      detail: h.binary ? `${h.detail} @ ${h.binary}` : h.detail,
    });
  }

  // Informational: mid is proven DeepSeek (not the overall OR-gate).
  const midOk = isMidDeepSeekProven();
  const midDetail = midDeepSeekProofDetail();
  checks.push({
    name: "lane:mid",
    ok: midOk,
    detail: midDetail,
  });

  // Optional supervisor probe (v0 skill-only; Cursor CLI agent is informational)
  const agentBin =
    (commandExists("agent") && "agent") ||
    (commandExists("cursor-agent") && "cursor-agent") ||
    null;
  checks.push({
    name: "cursor_cli",
    ok: true, // informational — does not fail health
    detail: agentBin
      ? `optional ok (${agentBin} on PATH) — v0 supervisor is Cursor skill, not CLI`
      : "optional — Cursor CLI agent not on PATH (skill-only supervisor is fine for v0)",
  });

  // At least one worker must be healthy for a green health gate.
  // CURSOR_ROUTE_RELAXED=1: pass without tmux and without workers (CI / infra smoke).
  const workerOk = checks.some((c) => c.name.startsWith("worker:") && c.ok);
  const relaxed = process.env.CURSOR_ROUTE_RELAXED === "1";
  const hardOk = (tmuxOk || relaxed) && (bunOk || nodeOk) && scriptOk;
  const ok = hardOk && (workerOk || relaxed);

  if (relaxed) {
    checks.push({
      name: "relaxed",
      ok: true,
      detail: workerOk
        ? "CURSOR_ROUTE_RELAXED=1 — tmux optional (headless OK)"
        : "CURSOR_ROUTE_RELAXED=1 — tmux/workers optional (CI / infra smoke)",
    });
  }

  checks.push({
    name: "jobs_dir",
    ok: true,
    detail: config.jobsDir,
  });

  return {
    ok,
    product: config.product,
    version: config.version,
    checks,
    lanes: {
      mid: { worker: "claude-ds", deepseek: midOk, detail: midDetail },
    },
  };
}

export function printHealth(report: HealthReport, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`${report.product} v${report.version}`);
  console.log(report.ok ? "health: OK" : "health: NEEDS SETUP");
  console.log("");
  for (const c of report.checks) {
    const mark = c.ok ? "✓" : "✗";
    console.log(`  ${mark} ${c.name.padEnd(16)} ${c.detail}`);
  }
  if (!report.ok) {
    console.log("");
    console.log("Fix the ✗ items, then re-run: cursor-route health");
    console.log("Tip: start with one worker (grok OR claude-ds OR opencode) before parallel demos.");
  } else if (report.checks.some((c) => c.name === "lane:mid" && !c.ok)) {
    console.log("");
    console.log(
      "Tip: health OK without a DeepSeek mid — --lane mid will fail until lane:mid is ✓.",
    );
  }
}
