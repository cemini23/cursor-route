import { describe, expect, test } from "bun:test";
import { resolveWorker } from "./jobs.ts";
import { config, resolveDsModelAlias } from "./config.ts";
import { shellQuote, newJobId } from "./util.ts";
import { runHealth } from "./health.ts";
import { looksLikeSecretMaterial, redactSecrets } from "./secrets.ts";
import { isDeepSeekRouted, isDeepSeekBaseUrl, claudeDsAdapter } from "./adapters/claude-ds.ts";
import { deepseekAdapter } from "./adapters/deepseek.ts";

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

describe("resolveDsModelAlias", () => {
  test("defaults to flash", () => {
    expect(resolveDsModelAlias()).toBe("flash");
    expect(resolveDsModelAlias("")).toBe("flash");
  });
  test("accepts aliases and full ids", () => {
    expect(resolveDsModelAlias("flash")).toBe("flash");
    expect(resolveDsModelAlias("pro")).toBe("pro");
    expect(resolveDsModelAlias("deepseek-v4-flash")).toBe("flash");
    expect(resolveDsModelAlias("deepseek-v4-pro")).toBe("pro");
    expect(resolveDsModelAlias("deepseek-v4-pro[1m]")).toBe("pro");
  });
  test("rejects unknown", () => {
    expect(() => resolveDsModelAlias("opus")).toThrow(/flash\|pro/);
  });
});

describe("claude-ds -Model", () => {
  test("shim path passes -Model deepseek-v4-flash by default", () => {
    const prev = process.env.CURSOR_ROUTE_CLAUDE_DS_BIN;
    process.env.CURSOR_ROUTE_CLAUDE_DS_BIN = "/tmp/fake-claude-ds";
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
    expect(r.checks.length).toBeGreaterThan(3);
    expect(r.checks.some((c) => c.name === "tmux")).toBe(true);
    expect(r.checks.some((c) => c.name === "cursor_cli")).toBe(true);
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
