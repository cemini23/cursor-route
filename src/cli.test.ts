import { describe, expect, test } from "bun:test";
import { resolveWorker } from "./jobs.ts";
import { config } from "./config.ts";
import { shellQuote, newJobId } from "./util.ts";
import { runHealth } from "./health.ts";
import { looksLikeSecretMaterial } from "./secrets.ts";

describe("resolveWorker", () => {
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
  });
  test("default worker", () => {
    expect(resolveWorker({ prompt: "x" })).toBe(config.defaultWorker);
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
  test("blocks ghp_ material", () => {
    expect(looksLikeSecretMaterial("ghp_abcdefghijklmnopqrstuvwx")).toBe(true);
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

  test("relaxed env can pass without tmux", () => {
    const prev = process.env.CURSOR_ROUTE_RELAXED;
    process.env.CURSOR_ROUTE_RELAXED = "1";
    try {
      const r = runHealth();
      const tmux = r.checks.find((c) => c.name === "tmux");
      if (tmux && !tmux.ok) {
        expect(r.ok).toBe(true);
        expect(r.checks.some((c) => c.name === "relaxed")).toBe(true);
      }
    } finally {
      if (prev === undefined) delete process.env.CURSOR_ROUTE_RELAXED;
      else process.env.CURSOR_ROUTE_RELAXED = prev;
    }
  });
});
