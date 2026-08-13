import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveWorker, startJob } from "./jobs.ts";
import { config, resolveDsModel, resolveDsModelAlias } from "./config.ts";
import { shellQuote, newJobId } from "./util.ts";
import { runHealth } from "./health.ts";
import { looksLikeSecretMaterial, redactSecrets } from "./secrets.ts";
import { isDeepSeekRouted, isDeepSeekBaseUrl, claudeDsAdapter } from "./adapters/claude-ds.ts";
import { deepseekAdapter } from "./adapters/deepseek.ts";
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

  test("--worker deepseek dry-run fails", () => {
    const result = startJob({
      prompt: "ping",
      worker: "deepseek",
      dryRun: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not available|claude-ds/i);
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

describe("deepseek adapter slot", () => {
  test("health is not ok and buildLaunch throws", () => {
    expect(deepseekAdapter.health().ok).toBe(false);
    expect(() =>
      deepseekAdapter.buildLaunch({
        promptFile: "/tmp/p",
        cwd: "/tmp",
        alwaysApprove: true,
      }),
    ).toThrow(/not available/);
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
    expect(r.version).toBe("0.1.7");
    expect(r.checks.length).toBeGreaterThan(3);
    expect(r.checks.some((c) => c.name === "tmux")).toBe(true);
    expect(r.checks.some((c) => c.name === "cursor_cli")).toBe(true);
  });

  test("OR-gate: ok can be true while worker:deepseek is false", () => {
    const prev = process.env.CURSOR_ROUTE_RELAXED;
    process.env.CURSOR_ROUTE_RELAXED = "1";
    try {
      const r = runHealth();
      const ds = r.checks.find((c) => c.name === "worker:deepseek");
      expect(ds?.ok).toBe(false);
      expect(r.ok).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.CURSOR_ROUTE_RELAXED;
      else process.env.CURSOR_ROUTE_RELAXED = prev;
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
});
