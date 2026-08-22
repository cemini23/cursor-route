import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  rmSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveWorker, startJob, jobEvidence, type Job } from "./jobs.ts";
import { config, resolveDsModel, resolveDsModelAlias } from "./config.ts";
import { shellQuote, newJobId } from "./util.ts";
import { runHealth } from "./health.ts";
import { looksLikeSecretMaterial, redactSecrets } from "./secrets.ts";
import {
  isDeepSeekRouted,
  isDeepSeekBaseUrl,
  claudeDsAdapter,
  isMidDeepSeekProven,
} from "./adapters/claude-ds.ts";
import { deepseekAdapter, patchPathForPrompt } from "./adapters/deepseek.ts";
import { grokAdapter } from "./adapters/grok.ts";

describe("resolveWorker", () => {
  test("lane easy → openrouter", () => {
    expect(resolveWorker({ prompt: "x", lane: "easy" })).toBe("openrouter");
  });
  test("lane mid → claude-ds", () => {
    expect(resolveWorker({ prompt: "x", lane: "mid" })).toBe("claude-ds");
  });
  test("lane hard → grok", () => {
    expect(resolveWorker({ prompt: "x", lane: "hard" })).toBe("grok");
  });
  test("explicit worker wins", () => {
    expect(resolveWorker({ prompt: "x", lane: "hard", worker: "claude-ds" })).toBe(
      "claude-ds",
    );
    expect(resolveWorker({ prompt: "x", lane: "mid", worker: "openrouter" })).toBe(
      "openrouter",
    );
    expect(resolveWorker({ prompt: "x", lane: "mid", worker: "opencode" })).toBe(
      "opencode",
    );
  });
  test("default worker", () => {
    expect(resolveWorker({ prompt: "x" })).toBe(config.defaultWorker);
  });
});

describe("resolveDsModel", () => {
  test("defaults to flash", () => {
    expect(resolveDsModel()).toEqual({ alias: "flash", id: "deepseek-v4-flash" });
    expect(resolveDsModelAlias("")).toBe("flash");
  });
  test("accepts aliases and full ids", () => {
    expect(resolveDsModel("flash").id).toBe("deepseek-v4-flash");
    expect(resolveDsModel("pro").id).toBe("deepseek-v4-pro");
    expect(resolveDsModel("deepseek-v4-pro[1m]")).toEqual({
      alias: "pro",
      id: "deepseek-v4-pro[1m]",
    });
  });
  test("rejects unknown", () => {
    expect(() => resolveDsModel("opus")).toThrow(/flash\|pro/);
  });
});

describe("claude-ds -Model", () => {
  test("shim path passes -Model deepseek-v4-flash by default", () => {
    const prev = process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
    const prevDs = process.env.CURSOR_ROUTE_DS_MODEL;
    const prevAm = process.env.ANTHROPIC_MODEL;
    process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = "/tmp/fake-claude-ds";
    delete process.env.CURSOR_ROUTE_DS_MODEL;
    delete process.env.ANTHROPIC_MODEL;
    try {
      const plan = claudeDsAdapter.buildLaunch({
        promptFile: "/tmp/p.prompt",
        cwd: "/tmp",
        alwaysApprove: true,
      });
      expect(plan.command).toContain("-Model");
      expect(plan.command).toContain("deepseek-v4-flash");
    } finally {
      if (prev === undefined) delete process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
      else process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = prev;
      if (prevDs === undefined) delete process.env.CURSOR_ROUTE_DS_MODEL;
      else process.env.CURSOR_ROUTE_DS_MODEL = prevDs;
      if (prevAm === undefined) delete process.env.ANTHROPIC_MODEL;
      else process.env.ANTHROPIC_MODEL = prevAm;
    }
  });
  test("pro alias maps to deepseek-v4-pro", () => {
    const prev = process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
    process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = "/tmp/fake-claude-ds";
    try {
      const plan = claudeDsAdapter.buildLaunch({
        promptFile: "/tmp/p.prompt",
        cwd: "/tmp",
        alwaysApprove: true,
        model: "pro",
      });
      expect(plan.command).toContain("deepseek-v4-pro");
      expect(plan.command).not.toContain("deepseek-v4-flash");
    } finally {
      if (prev === undefined) delete process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
      else process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = prev;
    }
  });
  test("preserves deepseek-v4-pro[1m] via modelId", () => {
    const prev = process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
    process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = "/tmp/fake-claude-ds";
    try {
      const plan = claudeDsAdapter.buildLaunch({
        promptFile: "/tmp/p.prompt",
        cwd: "/tmp",
        alwaysApprove: true,
        model: "pro",
        modelId: "deepseek-v4-pro[1m]",
      });
      expect(plan.command).toContain("deepseek-v4-pro[1m]");
    } finally {
      if (prev === undefined) delete process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
      else process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = prev;
    }
  });
  test("Anthropic escape hatch omits DeepSeek --model", () => {
    const shimDir = join(tmpdir(), `cr-anth-escape-${process.pid}`);
    mkdirSync(shimDir, { recursive: true });
    const claude = join(shimDir, "claude");
    writeFileSync(claude, "#!/bin/sh\necho ok\n");
    chmodSync(claude, 0o755);

    const prev = {
      bin: process.env.CURSOR_ROUTE_CLAUDE_DS_BIN,
      allow: process.env.CURSOR_ROUTE_ALLOW_ANTHROPIC,
      base: process.env.ANTHROPIC_BASE_URL,
      path: process.env.PATH,
    };
    delete process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
    // Explicit non-DeepSeek base so ~/.claude/settings.json cannot force DeepSeek routing
    process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com";
    process.env.CURSOR_ROUTE_ALLOW_ANTHROPIC = "1";
    process.env.PATH = `${shimDir}:/usr/bin:/bin`;
    try {
      const plan = claudeDsAdapter.buildLaunch({
        promptFile: "/tmp/p.prompt",
        cwd: "/tmp",
        alwaysApprove: true,
        model: "pro",
      });
      expect(plan.command).toContain(claude);
      expect(plan.command).not.toContain("deepseek-v4");
      expect(plan.command).not.toContain("--model");
    } finally {
      if (prev.bin === undefined) delete process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
      else process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = prev.bin;
      if (prev.allow === undefined) delete process.env.CURSOR_ROUTE_ALLOW_ANTHROPIC;
      else process.env.CURSOR_ROUTE_ALLOW_ANTHROPIC = prev.allow;
      if (prev.base === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = prev.base;
      process.env.PATH = prev.path || "";
      rmSync(shimDir, { recursive: true, force: true });
    }
  });
});

describe("startJob product path", () => {
  test("CURSOR_ROUTE_DS_MODEL=pro applies when --model unset", () => {
    const prev = {
      bin: process.env.CURSOR_ROUTE_CLAUDE_DS_BIN,
      ds: process.env.CURSOR_ROUTE_DS_MODEL,
      am: process.env.ANTHROPIC_MODEL,
      jobs: process.env.CURSOR_ROUTE_JOBS_DIR,
    };
    const jobsDir = join(tmpdir(), `cr-jobs-ds-${process.pid}`);
    mkdirSync(jobsDir, { recursive: true });
    process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = "/tmp/fake-claude-ds";
    process.env.CURSOR_ROUTE_DS_MODEL = "pro";
    delete process.env.ANTHROPIC_MODEL;
    process.env.CURSOR_ROUTE_JOBS_DIR = jobsDir;
    try {
      const result = startJob({
        prompt: "ping",
        lane: "mid",
        dryRun: true,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.job.model).toBe("pro");
      expect(result.command).toContain("deepseek-v4-pro");
      expect(result.command).not.toContain("deepseek-v4-flash");
    } finally {
      if (prev.bin === undefined) delete process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
      else process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = prev.bin;
      if (prev.ds === undefined) delete process.env.CURSOR_ROUTE_DS_MODEL;
      else process.env.CURSOR_ROUTE_DS_MODEL = prev.ds;
      if (prev.am === undefined) delete process.env.ANTHROPIC_MODEL;
      else process.env.ANTHROPIC_MODEL = prev.am;
      if (prev.jobs === undefined) delete process.env.CURSOR_ROUTE_JOBS_DIR;
      else process.env.CURSOR_ROUTE_JOBS_DIR = prev.jobs;
      rmSync(jobsDir, { recursive: true, force: true });
    }
  });

  test("--worker deepseek dry-run succeeds with fake dsh + key", () => {
    const dir = join(tmpdir(), `cr-dsh-start-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const bin = join(dir, "dsh");
    writeFileSync(bin, "#!/bin/sh\necho fake-dsh\n");
    chmodSync(bin, 0o755);
    const prev = {
      bin: process.env.CURSOR_ROUTE_DSH_BIN,
      key: process.env.DEEPSEEK_API_KEY,
      ds: process.env.CURSOR_ROUTE_DS_MODEL,
      am: process.env.ANTHROPIC_MODEL,
      jobs: process.env.CURSOR_ROUTE_JOBS_DIR,
    };
    process.env.CURSOR_ROUTE_DSH_BIN = bin;
    // Not a real key: short and dash-separated so the CLI refuse gate would not trip.
    process.env.DEEPSEEK_API_KEY = "sk-test-not-a-real-key";
    delete process.env.CURSOR_ROUTE_DS_MODEL;
    delete process.env.ANTHROPIC_MODEL;
    process.env.CURSOR_ROUTE_JOBS_DIR = join(dir, "jobs");
    try {
      const result = startJob({
        prompt: "ping",
        worker: "deepseek",
        dryRun: true,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.job.worker).toBe("deepseek");
      expect(result.job.model).toBe("flash");
      expect(result.command).toContain("--profile headless");
      expect(result.command).toContain("--patch");
      expect(result.command).toContain("$(cat");
      expect(result.command).toContain("DSH_PERMISSION_MODE");
      expect(result.command).not.toContain("sk-test");
      expect(result.command).not.toContain("npx");
      // Dry-run keeps no durable artifacts (prompt + dsh patch both removed)
      expect(readdirSync(join(dir, "jobs")).length).toBe(0);
    } finally {
      if (prev.bin === undefined) delete process.env.CURSOR_ROUTE_DSH_BIN;
      else process.env.CURSOR_ROUTE_DSH_BIN = prev.bin;
      if (prev.key === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = prev.key;
      if (prev.ds === undefined) delete process.env.CURSOR_ROUTE_DS_MODEL;
      else process.env.CURSOR_ROUTE_DS_MODEL = prev.ds;
      if (prev.am === undefined) delete process.env.ANTHROPIC_MODEL;
      else process.env.ANTHROPIC_MODEL = prev.am;
      if (prev.jobs === undefined) delete process.env.CURSOR_ROUTE_JOBS_DIR;
      else process.env.CURSOR_ROUTE_JOBS_DIR = prev.jobs;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("grok command never includes deepseek-v4", () => {
    const prev = process.env.CURSOR_ROUTE_GROK_BIN;
    process.env.CURSOR_ROUTE_GROK_BIN = "/tmp/fake-grok";
    try {
      const plan = grokAdapter.buildLaunch({
        promptFile: "/tmp/p.prompt",
        cwd: "/tmp",
        alwaysApprove: true,
        model: "pro",
      });
      expect(plan.command).not.toContain("deepseek-v4");
      expect(plan.command).not.toMatch(/(^|[\s'-])Model\b/);
    } finally {
      if (prev === undefined) delete process.env.CURSOR_ROUTE_GROK_BIN;
      else process.env.CURSOR_ROUTE_GROK_BIN = prev;
    }
  });
});

describe("deepseek adapter (dsh)", () => {
  /** Executable fake `dsh` in a fresh tmpdir (existsSync passes). */
  const makeFakeDsh = (suffix: string) => {
    const dir = join(tmpdir(), `cr-dsh-${process.pid}-${suffix}`);
    mkdirSync(dir, { recursive: true });
    const bin = join(dir, "dsh");
    writeFileSync(bin, "#!/bin/sh\necho fake-dsh\n");
    chmodSync(bin, 0o755);
    return { dir, bin };
  };

  /** Set/delete env for the duration of fn; restore afterwards. */
  const withEnv = (
    patch: Record<string, string | undefined>,
    fn: () => void,
  ) => {
    const prev = new Map<string, string | undefined>();
    for (const k of Object.keys(patch)) {
      prev.set(k, process.env[k]);
      const v = patch[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      fn();
    } finally {
      for (const [k, v] of prev) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  test("health: no binary and no key → not ok, install hint names the npm package", () => {
    withEnv(
      {
        CURSOR_ROUTE_DSH_BIN: join(tmpdir(), `missing-dsh-${process.pid}`),
        DEEPSEEK_API_KEY: undefined,
      },
      () => {
        const h = deepseekAdapter.health();
        expect(h.ok).toBe(false);
        expect(h.detail).toMatch(/npm i -g @deepseek-ai\/dsh/);
      },
    );
  });

  test("health: binary but no key → not ok, tells operator to export DEEPSEEK_API_KEY", () => {
    const { bin } = makeFakeDsh("nokey");
    withEnv({ CURSOR_ROUTE_DSH_BIN: bin, DEEPSEEK_API_KEY: undefined }, () => {
      const h = deepseekAdapter.health();
      expect(h.ok).toBe(false);
      expect(h.detail).toMatch(/DEEPSEEK_API_KEY/);
    });
  });

  test("health: binary + key → ok", () => {
    const { bin } = makeFakeDsh("ok");
    withEnv({ CURSOR_ROUTE_DSH_BIN: bin, DEEPSEEK_API_KEY: "test-key" }, () => {
      const h = deepseekAdapter.health();
      expect(h.ok).toBe(true);
      expect(h.binary).toBe(bin);
    });
  });

  test("buildLaunch: flash default patch next to prompt; key only in env", () => {
    const { dir, bin } = makeFakeDsh("flash");
    const promptFile = join(dir, "job.prompt");
    writeFileSync(promptFile, "ping");
    withEnv(
      {
        CURSOR_ROUTE_DSH_BIN: bin,
        DEEPSEEK_API_KEY: "test-key",
        CURSOR_ROUTE_DS_MODEL: undefined,
        ANTHROPIC_MODEL: undefined,
      },
      () => {
        const plan = deepseekAdapter.buildLaunch({
          promptFile,
          cwd: dir,
          alwaysApprove: true,
        });
        expect(plan.command).toContain("--profile headless");
        expect(plan.command).toContain("--patch");
        expect(plan.command).toContain("$(cat");
        expect(plan.command).not.toContain("npx");
        expect(plan.command).not.toContain("test-key");
        expect(plan.env?.DSH_PERMISSION_MODE).toBe("danger-full-access");
        expect(plan.env?.DEEPSEEK_API_KEY).toBe("test-key");
        const patch = readFileSync(join(dir, "job.dsh-patch.yml"), "utf8");
        expect(patch).toContain("agent-default-model");
        expect(patch).toContain("provider: deepseek-official");
        expect(patch).toContain("deepseek-v4-flash");
        expect(patch).not.toContain("deepseek-v4-pro");
        expect(patch).not.toContain("test-key");
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildLaunch: pro model → deepseek-v4-pro in patch", () => {
    const { dir, bin } = makeFakeDsh("pro");
    const promptFile = join(dir, "job.prompt");
    writeFileSync(promptFile, "ping");
    withEnv(
      {
        CURSOR_ROUTE_DSH_BIN: bin,
        DEEPSEEK_API_KEY: "test-key",
        CURSOR_ROUTE_DS_MODEL: undefined,
        ANTHROPIC_MODEL: undefined,
      },
      () => {
        deepseekAdapter.buildLaunch({
          promptFile,
          cwd: dir,
          alwaysApprove: true,
          model: "pro",
        });
        const patch = readFileSync(join(dir, "job.dsh-patch.yml"), "utf8");
        expect(patch).toContain("deepseek-v4-pro");
        expect(patch).not.toContain("deepseek-v4-flash");
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildLaunch: preserves deepseek-v4-pro[1m] in patch via modelId", () => {
    const { dir, bin } = makeFakeDsh("pro1m");
    const promptFile = join(dir, "job.prompt");
    writeFileSync(promptFile, "ping");
    withEnv(
      {
        CURSOR_ROUTE_DSH_BIN: bin,
        DEEPSEEK_API_KEY: "test-key",
        CURSOR_ROUTE_DS_MODEL: undefined,
        ANTHROPIC_MODEL: undefined,
      },
      () => {
        deepseekAdapter.buildLaunch({
          promptFile,
          cwd: dir,
          alwaysApprove: true,
          model: "pro",
          modelId: "deepseek-v4-pro[1m]",
        });
        const patch = readFileSync(join(dir, "job.dsh-patch.yml"), "utf8");
        expect(patch).toContain("deepseek-v4-pro[1m]");
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildLaunch: alwaysApprove false (--ask) → workspace-write", () => {
    const { dir, bin } = makeFakeDsh("ask");
    const promptFile = join(dir, "job.prompt");
    writeFileSync(promptFile, "ping");
    withEnv(
      {
        CURSOR_ROUTE_DSH_BIN: bin,
        DEEPSEEK_API_KEY: "test-key",
        CURSOR_ROUTE_DS_MODEL: undefined,
        ANTHROPIC_MODEL: undefined,
      },
      () => {
        const plan = deepseekAdapter.buildLaunch({
          promptFile,
          cwd: dir,
          alwaysApprove: false,
        });
        expect(plan.env?.DSH_PERMISSION_MODE).toBe("workspace-write");
        expect(plan.env?.DSH_PERMISSION_MODE).not.toBe("danger-full-access");
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildLaunch: CURSOR_ROUTE_ASK=1 opts out even when alwaysApprove true", () => {
    const { dir, bin } = makeFakeDsh("ask-env");
    const promptFile = join(dir, "job.prompt");
    writeFileSync(promptFile, "ping");
    withEnv(
      {
        CURSOR_ROUTE_DSH_BIN: bin,
        DEEPSEEK_API_KEY: "test-key",
        CURSOR_ROUTE_ASK: "1",
        CURSOR_ROUTE_DS_MODEL: undefined,
        ANTHROPIC_MODEL: undefined,
      },
      () => {
        const plan = deepseekAdapter.buildLaunch({
          promptFile,
          cwd: dir,
          alwaysApprove: true,
        });
        expect(plan.env?.DSH_PERMISSION_MODE).toBe("workspace-write");
        expect(plan.alwaysApprove).toBe(false);
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildLaunch: missing binary falls back to plain `dsh` for dry-run", () => {
    const { dir } = makeFakeDsh("nobin");
    const promptFile = join(dir, "job.prompt");
    writeFileSync(promptFile, "ping");
    // Point PATH at an empty dir so `command -v dsh` finds nothing,
    // regardless of what the dev machine has installed.
    const empty = join(dir, "empty");
    mkdirSync(empty, { recursive: true });
    withEnv(
      {
        CURSOR_ROUTE_DSH_BIN: undefined,
        DEEPSEEK_API_KEY: undefined,
        PATH: empty,
        CURSOR_ROUTE_DS_MODEL: undefined,
        ANTHROPIC_MODEL: undefined,
      },
      () => {
        const plan = deepseekAdapter.buildLaunch({
          promptFile,
          cwd: dir,
          alwaysApprove: true,
          dryRun: true,
        });
        expect(plan.command).toContain("'dsh' --profile headless");
        expect(plan.command).toContain("--patch");
        expect(plan.env?.DEEPSEEK_API_KEY).toBeUndefined();
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildLaunch: non-.prompt promptFile does not overwrite the prompt", () => {
    const { dir, bin } = makeFakeDsh("noprompt-ext");
    const promptFile = join(dir, "job");
    writeFileSync(promptFile, "keep-me");
    withEnv(
      {
        CURSOR_ROUTE_DSH_BIN: bin,
        DEEPSEEK_API_KEY: "test-key",
        CURSOR_ROUTE_DS_MODEL: undefined,
        ANTHROPIC_MODEL: undefined,
      },
      () => {
        expect(patchPathForPrompt(promptFile)).toBe(`${promptFile}.dsh-patch.yml`);
        deepseekAdapter.buildLaunch({
          promptFile,
          cwd: dir,
          alwaysApprove: true,
        });
        expect(readFileSync(promptFile, "utf8")).toBe("keep-me");
        expect(existsSync(`${promptFile}.dsh-patch.yml`)).toBe(true);
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildLaunch: rejects modelId that would break YAML", () => {
    const { dir, bin } = makeFakeDsh("badid");
    const promptFile = join(dir, "job.prompt");
    writeFileSync(promptFile, "ping");
    withEnv(
      {
        CURSOR_ROUTE_DSH_BIN: bin,
        DEEPSEEK_API_KEY: "test-key",
        CURSOR_ROUTE_DS_MODEL: undefined,
        ANTHROPIC_MODEL: undefined,
      },
      () => {
        expect(() =>
          deepseekAdapter.buildLaunch({
            promptFile,
            cwd: dir,
            alwaysApprove: true,
            model: "flash",
            modelId: "x\n    injected: true",
          }),
        ).toThrow(/Invalid DeepSeek model id/);
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("util", () => {
  test("shellQuote", () => {
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
  test("newJobId length", () => {
    expect(newJobId()).toHaveLength(8);
  });
});

describe("secrets", () => {
  test("allows discussing API keys in prose", () => {
    expect(looksLikeSecretMaterial("load the API key from env")).toBe(false);
  });
  test("blocks sk- material", () => {
    expect(looksLikeSecretMaterial("token sk-abcdefghijklmnopqrstuvwxyz1234")).toBe(true);
  });
  test("blocks sk-proj and sk-ant", () => {
    expect(
      looksLikeSecretMaterial("sk-proj-abcdefghijklmnopqrstuvwxyz123456"),
    ).toBe(true);
    expect(
      looksLikeSecretMaterial("sk-ant-api03-abcdefghijklmnopqrstuvwxyz"),
    ).toBe(true);
  });
  test("blocks ghp_ and github_pat", () => {
    expect(looksLikeSecretMaterial("ghp_abcdefghijklmnopqrstuvwx")).toBe(true);
    expect(
      looksLikeSecretMaterial("github_pat_11AAAAAAAAabcdefghijklmnopqrstuvwxyz"),
    ).toBe(true);
  });
  test("redactSecrets strips material", () => {
    const out = redactSecrets("see sk-abcdefghijklmnopqrstuvwxyz1234 end");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-abcd");
  });
});

describe("deepseek routing", () => {
  test("detects deepseek base url", () => {
    const prev = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = "https://api.deepseek.com/anthropic";
    try {
      expect(isDeepSeekRouted()).toBe(true);
      expect(isDeepSeekBaseUrl("https://api.deepseek.com/anthropic")).toBe(true);
      expect(isDeepSeekBaseUrl("https://evil-deepseek.com.attacker.tld")).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = prev;
    }
  });
});

describe("health", () => {
  test("returns structured report", () => {
    const r = runHealth();
    expect(r.product).toBe("cursor-route");
    expect(r.version).toBe("0.1.11");
    expect(r.checks.length).toBeGreaterThan(3);
    expect(r.checks.some((c) => c.name === "tmux")).toBe(true);
    expect(r.checks.some((c) => c.name === "cursor_cli")).toBe(true);
    const mid = r.checks.find((c) => c.name === "lane:mid");
    expect(mid).toBeDefined();
    expect(r.lanes.mid.worker).toBe("claude-ds");
    expect(r.lanes.mid.deepseek).toBe(mid!.ok);
    expect(r.checks.some((c) => c.name === "worker:opencode")).toBe(true);
    expect(r.checks.some((c) => c.name === "worker:deepseek")).toBe(true);
  });

  test("config version is 0.1.11", () => {
    expect(config.version).toBe("0.1.11");
  });

  test("OR-gate: ok can be true while worker:opencode is false", () => {
    const prev = {
      relaxed: process.env.CURSOR_ROUTE_RELAXED,
      bin: process.env.CURSOR_ROUTE_OPENCODE_BIN,
    };
    process.env.CURSOR_ROUTE_RELAXED = "1";
    process.env.CURSOR_ROUTE_OPENCODE_BIN = join(tmpdir(), `missing-oc-${process.pid}`);
    try {
      const r = runHealth();
      const oc = r.checks.find((c) => c.name === "worker:opencode");
      expect(oc?.ok).toBe(false);
      expect(r.ok).toBe(true);
    } finally {
      if (prev.relaxed === undefined) delete process.env.CURSOR_ROUTE_RELAXED;
      else process.env.CURSOR_ROUTE_RELAXED = prev.relaxed;
      if (prev.bin === undefined) delete process.env.CURSOR_ROUTE_OPENCODE_BIN;
      else process.env.CURSOR_ROUTE_OPENCODE_BIN = prev.bin;
    }
  });

  test("OR-gate: ok can be true while worker:deepseek is false", () => {
    const prev = {
      relaxed: process.env.CURSOR_ROUTE_RELAXED,
      bin: process.env.CURSOR_ROUTE_DSH_BIN,
      key: process.env.DEEPSEEK_API_KEY,
    };
    process.env.CURSOR_ROUTE_RELAXED = "1";
    // Force deepseek unhealthy even on machines that have a real dsh + key.
    process.env.CURSOR_ROUTE_DSH_BIN = join(tmpdir(), `missing-dsh-${process.pid}`);
    delete process.env.DEEPSEEK_API_KEY;
    try {
      const r = runHealth();
      const ds = r.checks.find((c) => c.name === "worker:deepseek");
      expect(ds?.ok).toBe(false);
      expect(r.ok).toBe(true);
    } finally {
      if (prev.relaxed === undefined) delete process.env.CURSOR_ROUTE_RELAXED;
      else process.env.CURSOR_ROUTE_RELAXED = prev.relaxed;
      if (prev.bin === undefined) delete process.env.CURSOR_ROUTE_DSH_BIN;
      else process.env.CURSOR_ROUTE_DSH_BIN = prev.bin;
      if (prev.key === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = prev.key;
    }
  });

  test("relaxed env can pass without workers", () => {
    const prev = process.env.CURSOR_ROUTE_RELAXED;
    process.env.CURSOR_ROUTE_RELAXED = "1";
    try {
      const r = runHealth();
      expect(r.ok).toBe(true);
      expect(r.checks.some((c) => c.name === "relaxed")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.CURSOR_ROUTE_RELAXED;
      else process.env.CURSOR_ROUTE_RELAXED = prev;
    }
  });

  test("CURSOR_ROUTE_CLAUDE_DS_BIN pointing at an existing file proves mid DeepSeek", () => {
    const prev = process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
    const fake = join(tmpdir(), `cr-mid-proof-${process.pid}`);
    writeFileSync(fake, "#!/bin/sh\necho ok\n");
    chmodSync(fake, 0o755);
    process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = fake;
    try {
      expect(isMidDeepSeekProven()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
      else process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = prev;
      rmSync(fake, { force: true });
    }
  });

  test("Anthropic hatch is not DeepSeek proof (shim on PATH still is)", () => {
    const shimDir = join(tmpdir(), `cr-mid-hatch-${process.pid}`);
    mkdirSync(shimDir, { recursive: true });
    const claude = join(shimDir, "claude");
    writeFileSync(claude, "#!/bin/sh\necho ok\n");
    chmodSync(claude, 0o755);

    const prev = {
      bin: process.env.CURSOR_ROUTE_CLAUDE_DS_BIN,
      allow: process.env.CURSOR_ROUTE_ALLOW_ANTHROPIC,
      base: process.env.ANTHROPIC_BASE_URL,
      crBase: process.env.CURSOR_ROUTE_ANTHROPIC_BASE_URL,
      path: process.env.PATH,
    };
    delete process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
    delete process.env.CURSOR_ROUTE_ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com";
    process.env.CURSOR_ROUTE_ALLOW_ANTHROPIC = "1";
    process.env.PATH = `${shimDir}:/usr/bin:/bin`;
    try {
      const detail = claudeDsAdapter.health().detail;
      if (detail.includes("Anthropic")) {
        expect(isMidDeepSeekProven()).toBe(false);
        const r = runHealth();
        const mid = r.checks.find((c) => c.name === "lane:mid");
        expect(mid?.ok).toBe(false);
        expect(r.lanes.mid.deepseek).toBe(false);
      } else {
        // Real claude-ds / deepseek-claude on PATH is proof (hatch never engages).
        expect(isMidDeepSeekProven()).toBe(true);
      }
    } finally {
      if (prev.bin === undefined) delete process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
      else process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = prev.bin;
      if (prev.allow === undefined) delete process.env.CURSOR_ROUTE_ALLOW_ANTHROPIC;
      else process.env.CURSOR_ROUTE_ALLOW_ANTHROPIC = prev.allow;
      if (prev.base === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = prev.base;
      if (prev.crBase === undefined) delete process.env.CURSOR_ROUTE_ANTHROPIC_BASE_URL;
      else process.env.CURSOR_ROUTE_ANTHROPIC_BASE_URL = prev.crBase;
      process.env.PATH = prev.path || "";
      rmSync(shimDir, { recursive: true, force: true });
    }
  });
});

describe("jobEvidence", () => {
  test("verify.claim is always unverified; spawn/execute keys exist", () => {
    const job: Job = {
      id: "abcd1234",
      schema: "cursor-route.job.v1",
      status: "running",
      worker: "claude-ds",
      lane: "mid",
      model: "flash",
      prompt: "ping",
      cwd: "/tmp",
      alwaysApprove: true,
      tmuxSession: "cursor-route-abcd1234",
      createdAt: "2026-08-18T00:00:00.000Z",
      startedAt: "2026-08-18T00:00:01.000Z",
      logBytes: 42,
    };
    const ev = jobEvidence(job, true);
    expect(ev.verify.claim).toBe("unverified");
    expect(ev.verify.captureHint).toBe("cursor-route capture abcd1234");
    expect(ev.verify.logBytes).toBe(42);
    expect(ev.spawn.jobId).toBe("abcd1234");
    expect(ev.spawn.worker).toBe("claude-ds");
    expect(ev.spawn.lane).toBe("mid");
    expect(ev.spawn.model).toBe("flash");
    expect(ev.spawn.startedAt).toBe("2026-08-18T00:00:01.000Z");
    expect(ev.execute.status).toBe("running");
    expect(ev.execute.exitCode).toBe(null);
    expect(ev.execute.tmuxSession).toBe("cursor-route-abcd1234");
    expect(ev.execute.pid).toBe(null);
    expect(ev.execute.sessionAlive).toBe(true);
  });
});
