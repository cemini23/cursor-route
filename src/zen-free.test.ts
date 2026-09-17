import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  asOpenCodeZenId,
  isZenFreeModel,
  openCodeModel,
  OPENCODE_DEFAULT_MODEL,
  pickZenFreeModel,
  rankZenFreeModels,
  zenFreeBoost,
  type ZenModel,
} from "./zen-free.ts";

const CATALOG: ZenModel[] = [
  { id: "big-pickle", name: "Big Pickle" },
  { id: "hy3-free", name: "HY3 Free" },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  { id: "muse-spark-1.2-contributor-free", name: "Muse Spark Contributor" },
  { id: "laguna-s-2.1-free", name: "Laguna" },
  { id: "x-preview-f-free", name: "Ox Alpha Free" },
  { id: "whisper-free", name: "Whisper" },
];

describe("zen free catalog", () => {
  test("tags -free / big-pickle as free; skips paid and audio", () => {
    expect(isZenFreeModel({ id: "x-preview-f-free" })).toBe(true);
    expect(isZenFreeModel({ id: "big-pickle" })).toBe(true);
    expect(isZenFreeModel({ id: "openrouter/qwen/qwen3-coder:free" })).toBe(true);
    expect(isZenFreeModel({ id: "claude-opus-4-6" })).toBe(false);
    expect(isZenFreeModel({ id: "whisper-free" })).toBe(false);
    expect(
      isZenFreeModel({
        id: "some-zero-price",
        pricing: { prompt: 0, completion: 0 },
      }),
    ).toBe(true);
  });

  test("capability tokens: ultra > preview > generic coding > flash > may-train", () => {
    expect(zenFreeBoost("opencode/nemotron-3-ultra-free")).toBe(70);
    expect(zenFreeBoost("opencode/x-preview-f-free")).toBe(52);
    expect(zenFreeBoost("opencode/laguna-s-2.1-free")).toBe(50);
    expect(zenFreeBoost("opencode/deepseek-v4-flash-free")).toBe(35);
    expect(zenFreeBoost("opencode/muse-spark-1.2-contributor-free")).toBe(25);
    expect(zenFreeBoost("opencode/hy3-free")).toBe(20);
    expect(zenFreeBoost("opencode/big-pickle")).toBe(10);
  });

  test("relative boosts: ultra > preview > flash > big-pickle", () => {
    expect(zenFreeBoost("opencode/nemotron-3-ultra-free")).toBeGreaterThan(
      zenFreeBoost("opencode/x-preview-f-free"),
    );
    expect(zenFreeBoost("opencode/x-preview-f-free")).toBeGreaterThan(
      zenFreeBoost("opencode/deepseek-v4-flash-free"),
    );
    expect(zenFreeBoost("opencode/deepseek-v4-flash-free")).toBeGreaterThan(
      zenFreeBoost("opencode/big-pickle"),
    );
  });

  test("hy3-free is may-train, not coding-family", () => {
    // else 30 + -free 10 − 20 may-train = 20. Coding-family would be 30.
    expect(zenFreeBoost("opencode/hy3-free")).toBe(20);
    expect(zenFreeBoost("opencode/hy3-free")).toBeLessThan(
      zenFreeBoost("opencode/laguna-s-2.1-free"),
    );
  });

  test("rank: paid/whisper dropped; preview may beat laguna (52 > 50)", () => {
    const ranked = rankZenFreeModels(CATALOG);
    expect(ranked[0]?.id).toBe("opencode/x-preview-f-free");
    expect(ranked.map((r) => r.id)).not.toContain("opencode/claude-opus-4-6");
    expect(ranked.map((r) => r.id)).not.toContain("opencode/whisper-free");
    expect(ranked.at(-1)?.id).toBe("opencode/big-pickle");
  });

  test("rank without preview: coding free beats big-pickle", () => {
    const ranked = rankZenFreeModels([
      { id: "big-pickle" },
      { id: "laguna-s-2.1-free" },
      { id: "muse-spark-1.2-contributor-free" },
    ]);
    expect(ranked[0]?.id).toBe("opencode/laguna-s-2.1-free");
    expect(ranked[1]?.id).toBe("opencode/muse-spark-1.2-contributor-free");
    expect(ranked[2]?.id).toBe("opencode/big-pickle");
  });

  test("hy3 + preview + big-pickle → preview", () => {
    expect(
      pickZenFreeModel({
        catalog: [{ id: "hy3-free" }, { id: "x-preview-f-free" }, { id: "big-pickle" }],
      }),
    ).toBe("opencode/x-preview-f-free");
  });

  test("hy3 + big-pickle + flash → flash coding", () => {
    expect(
      pickZenFreeModel({
        catalog: [
          { id: "hy3-free" },
          { id: "big-pickle" },
          { id: "deepseek-v4-flash-free" },
        ],
      }),
    ).toBe("opencode/deepseek-v4-flash-free");
  });

  test("flash + ultra + preview → ultra", () => {
    expect(
      pickZenFreeModel({
        catalog: [
          { id: "deepseek-v4-flash-free" },
          { id: "nemotron-3-ultra-free" },
          { id: "x-preview-f-free" },
        ],
      }),
    ).toBe("opencode/nemotron-3-ultra-free");
  });

  test("only big-pickle → big-pickle", () => {
    expect(pickZenFreeModel({ catalog: [{ id: "big-pickle" }] })).toBe(
      "opencode/big-pickle",
    );
  });

  test("asOpenCodeZenId prefixes bare Zen ids", () => {
    expect(asOpenCodeZenId("x-preview-f-free")).toBe("opencode/x-preview-f-free");
    expect(asOpenCodeZenId("opencode/big-pickle")).toBe("opencode/big-pickle");
  });

  test("pickZenFreeModel uses the ranked catalog winner", () => {
    expect(pickZenFreeModel({ catalog: CATALOG })).toBe("opencode/x-preview-f-free");
  });

  test("offline / empty / paid-only catalog falls back to Ox Alpha", () => {
    expect(pickZenFreeModel({ catalog: [] })).toBe(OPENCODE_DEFAULT_MODEL);
    expect(pickZenFreeModel({ catalog: [{ id: "claude-opus-4-6" }] })).toBe(
      OPENCODE_DEFAULT_MODEL,
    );
    expect(OPENCODE_DEFAULT_MODEL).toBe("opencode/x-preview-f-free");
  });
});

describe("openCodeModel live pick", () => {
  const isolate = (fn: () => void) => {
    const dir = join(tmpdir(), `cr-zen-${process.pid}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    const prev = {
      model: process.env.CURSOR_ROUTE_OPENCODE_MODEL,
      offline: process.env.CURSOR_ROUTE_ZEN_OFFLINE,
      json: process.env.CURSOR_ROUTE_ZEN_CATALOG_JSON,
      cache: process.env.CURSOR_ROUTE_ZEN_CACHE_PATH,
      refresh: process.env.CURSOR_ROUTE_ZEN_REFRESH,
    };
    delete process.env.CURSOR_ROUTE_OPENCODE_MODEL;
    process.env.CURSOR_ROUTE_ZEN_CACHE_PATH = join(dir, "cache.json");
    process.env.CURSOR_ROUTE_ZEN_REFRESH = "1";
    try {
      fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        const envKey = {
          model: "CURSOR_ROUTE_OPENCODE_MODEL",
          offline: "CURSOR_ROUTE_ZEN_OFFLINE",
          json: "CURSOR_ROUTE_ZEN_CATALOG_JSON",
          cache: "CURSOR_ROUTE_ZEN_CACHE_PATH",
          refresh: "CURSOR_ROUTE_ZEN_REFRESH",
        }[k]!;
        if (v === undefined) delete process.env[envKey];
        else process.env[envKey] = v;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test("free/empty + offline → Ox Alpha fallback", () => {
    isolate(() => {
      process.env.CURSOR_ROUTE_ZEN_OFFLINE = "1";
      expect(openCodeModel()).toBe("opencode/x-preview-f-free");
      expect(openCodeModel("free")).toBe("opencode/x-preview-f-free");
    });
  });

  test("free + injected catalog → strongest listed-free (ultra)", () => {
    isolate(() => {
      process.env.CURSOR_ROUTE_ZEN_CATALOG_JSON = JSON.stringify({
        data: [
          { id: "deepseek-v4-flash-free" },
          { id: "nemotron-3-ultra-free" },
          { id: "x-preview-f-free" },
        ],
      });
      expect(openCodeModel("free")).toBe("opencode/nemotron-3-ultra-free");
    });
  });

  test("CURSOR_ROUTE_OPENCODE_MODEL pin wins over catalog", () => {
    isolate(() => {
      process.env.CURSOR_ROUTE_OPENCODE_MODEL = "opencode/hy3-free";
      process.env.CURSOR_ROUTE_ZEN_CATALOG_JSON = JSON.stringify({ data: CATALOG });
      expect(openCodeModel()).toBe("opencode/hy3-free");
      expect(openCodeModel("free")).toBe("opencode/hy3-free");
    });
  });
});
