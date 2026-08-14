import { execSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import type { Adapter, WorkerHealth } from "./types.ts";
import { shellQuote } from "../util.ts";
import {
  DS_MODEL_IDS,
  resolveDsModel,
  type DsModelAlias,
} from "../config.ts";

/**
 * Experimental official DeepSeek Harness (`dsh`, npm @deepseek-ai/dsh) as a
 * coding worker — `dsh --profile headless` with a per-job Cordis patch that
 * pins the model. Mid lane stays on claude-ds; this is an opt-in worker only
 * (`--worker deepseek`), not a mid replacement.
 *
 * We never write ~/.dsh/settings.yaml (parallel jobs would race) and never
 * put DEEPSEEK_API_KEY in the command or patch — the key travels via plan.env.
 */

function findDsh(): string | null {
  // Env override lets tests pin a fake dsh — but it must exist, so a stale
  // override cannot pass health with a dangling path.
  const override = process.env.CURSOR_ROUTE_DSH_BIN;
  if (override) return existsSync(override) ? override : null;
  try {
    return (
      execSync("command -v dsh", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        // Bun may ignore mutated process.env.PATH unless env is passed explicitly
        env: { ...process.env },
      }).trim() || null
    );
  } catch {
    return null;
  }
}

/** Same resolution as claude-ds: passed model/modelId wins, else env, else Flash. */
function pickModel(
  requested?: DsModelAlias,
  modelId?: string,
): { alias: DsModelAlias; id: string } {
  if (modelId) {
    const alias = requested ?? resolveDsModel(modelId).alias;
    return { alias, id: modelId };
  }
  if (requested) {
    return { alias: requested, id: DS_MODEL_IDS[requested] };
  }
  // Env default (startJob normally resolves this; kept for direct buildLaunch callers)
  return resolveDsModel(process.env.CURSOR_ROUTE_DS_MODEL || process.env.ANTHROPIC_MODEL);
}

/** Whitelist model ids before interpolating into YAML (no newlines / injection). */
function assertPatchModelId(modelId: string): string {
  if (!/^[a-z0-9][a-z0-9.\-[\]]*$/i.test(modelId)) {
    throw new Error(`Invalid DeepSeek model id for dsh patch: ${modelId}`);
  }
  return modelId;
}

/** Per-job Cordis patch path. Never reuse the prompt path (would overwrite it). */
export function patchPathForPrompt(promptFile: string): string {
  return promptFile.endsWith(".prompt")
    ? promptFile.replace(/\.prompt$/, ".dsh-patch.yml")
    : `${promptFile}.dsh-patch.yml`;
}

/** Per-job Cordis patch (whole-row replace). `name` is required or dsh silently skips. */
function patchYaml(modelId: string): string {
  const id = assertPatchModelId(modelId);
  return [
    "- id: agent-default-model",
    "  name: '@deepseek-ai/dsh-agent-default-model'",
    "  config:",
    "    provider: deepseek-official",
    `    model: '${id}'`,
  ].join("\n") + "\n";
}

export const deepseekAdapter: Adapter = {
  kind: "deepseek",
  label: "Official DeepSeek Harness (dsh)",
  health(): WorkerHealth {
    const binary = findDsh();
    if (!binary) {
      return {
        worker: "deepseek",
        ok: false,
        binary: null,
        detail:
          "dsh (@deepseek-ai/dsh) not found — install: npm i -g @deepseek-ai/dsh. Mid default remains claude-ds.",
      };
    }
    if (!process.env.DEEPSEEK_API_KEY) {
      return {
        worker: "deepseek",
        ok: false,
        binary,
        detail:
          "DEEPSEEK_API_KEY not set — export your DeepSeek API key to use dsh (@deepseek-ai/dsh). Mid default remains claude-ds.",
      };
    }
    return {
      worker: "deepseek",
      ok: true,
      binary,
      detail: "ok (dsh @deepseek-ai/dsh headless; mid default remains claude-ds)",
    };
  },
  buildLaunch({ promptFile, cwd, alwaysApprove, model, modelId, dryRun }) {
    // Missing dsh is tolerated here so `--dry-run` can still print the command;
    // real starts are gated by the health preflight (binary + DEEPSEEK_API_KEY).
    const binary = findDsh() || "dsh";
    const choice = pickModel(model, modelId);

    // Per-job patch next to the prompt file (never touch ~/.dsh/settings.yaml).
    const patchFile = patchPathForPrompt(promptFile);
    writeFileSync(patchFile, patchYaml(choice.id), { mode: 0o600 });
    if (dryRun) {
      // Dry-run keeps no durable artifacts (jobs.ts removes the prompt likewise).
      try {
        unlinkSync(patchFile);
      } catch {
        /* ignore */
      }
    }

    // Launcher flags before the task; prompt inlined via cat (never the key).
    const parts = [
      shellQuote(binary),
      "--profile",
      "headless",
      "--patch",
      shellQuote(patchFile),
      `"$(cat ${shellQuote(promptFile)})"`,
    ];

    const ask = process.env.CURSOR_ROUTE_ASK === "1";
    const skip = alwaysApprove && !ask;
    const env: Record<string, string> = {
      DSH_PERMISSION_MODE: skip ? "danger-full-access" : "workspace-write",
    };
    // Key travels via env only — never interpolated into command or patch.
    if (process.env.DEEPSEEK_API_KEY) {
      env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    }

    return {
      worker: "deepseek",
      command: `cd ${shellQuote(cwd)} && ${parts.join(" ")}`,
      alwaysApprove: skip,
      env,
    };
  },
};
