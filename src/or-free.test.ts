import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assertOpenRouterModel,
  isOrFreeModel,
  openRouterModel,
  OPENROUTER_FALLBACK_MODEL,
  orFreeBoost,
  pickOrFreeModel,
  rankOrFreeModels,
  type OrModel,
} from "./or-free.ts";
import { openRouterAdapter } from "./adapters/openrouter.ts";

const CATALOG: OrModel[] = [
  { id: "acme/generic:free", name: "Generic Free", context_length: 8_000 },
  { id: "qwen/qwen-coder:free", name: "Qwen Coder", context_length: 128_000 },
  { id: "acme/whisper:free", name: "Whisper" },
  {
    id: "anthropic/claude-sonnet",
    name: "Sonnet",
    pricing: { prompt: 3, completion: 15 },
  },
  {
    id: "acme/zero-price",
    name: "Zero Price Text",
    context_length: 4_000,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    id: "acme/image-only",
    name: "Image Only",
    architecture: { modality: "image->image" },
    pricing: { prompt: 0, completion: 0 },
  },
];

describe("openrouter free catalog", () => {
  test("tags :free or zero price as free; skips paid, whisper, image-only", () => {
    expect(isOrFreeModel({ id: "qwen/qwen-coder:free" })).toBe(true);
    expect(
      isOrFreeModel({
        id: "acme/zero-price",
        pricing: { prompt: 0, completion: 0 },
      }),
    ).toBe(true);
    expect(
      isOrFreeModel({
        id: "anthropic/claude-sonnet",
        pricing: { prompt: 3, completion: 15 },
      }),
    ).toBe(false);
    expect(isOrFreeModel({ id: "acme/whisper:free" })).toBe(false);
    expect(
      isOrFreeModel({
        id: "acme/image-only",
        architecture: { modality: "image->image" },
        pricing: { prompt: 0, completion: 0 },
      }),
    ).toBe(false);
  });

  test("boost: coder/qwen outranks generic free; no hardcoded winner id", () => {
    expect(orFreeBoost("qwen/qwen-coder:free")).toBe(20);
    expect(orFreeBoost("acme/generic:free")).toBe(10);
    expect(orFreeBoost("meta-llama/llama-3.3-70b-instruct:free")).toBe(20);
  });

  test("rank prefers a :free coder with larger context over a generic :free", () => {
    const ranked = rankOrFreeModels(CATALOG);
    expect(ranked[0]?.id).toBe("qwen/qwen-coder:free");
    expect(ranked.map((r) => r.id)).not.toContain("acme/whisper:free");
    expect(ranked.map((r) => r.id)).not.toContain("anthropic/claude-sonnet");
    expect(ranked.map((r) => r.id)).not.toContain("acme/image-only");
  });

  test("same boost: larger context_length wins, then id ascending", () => {
    const ranked = rankOrFreeModels([
      { id: "qwen/small-coder:free", context_length: 8_000 },
      { id: "qwen/big-coder:free", context_length: 128_000 },
    ]);
    expect(ranked[0]?.id).toBe("qwen/big-coder:free");
    expect(ranked[1]?.id).toBe("qwen/small-coder:free");
  });

  test("pickOrFreeModel uses the ranked catalog winner", () => {
    expect(pickOrFreeModel({ catalog: CATALOG })).toBe("qwen/qwen-coder:free");
  });

  test("offline / empty catalog falls back to the OpenRouter router", () => {
    expect(pickOrFreeModel({ catalog: [] })).toBe(OPENROUTER_FALLBACK_MODEL);
    expect(OPENROUTER_FALLBACK_MODEL).toBe("openrouter/free");
  });

  test("assertOpenRouterModel accepts provider/model and :free", () => {
    expect(assertOpenRouterModel("qwen/qwen-coder:free")).toBe("qwen/qwen-coder:free");
    expect(assertOpenRouterModel("openrouter/free")).toBe("openrouter/free");
    expect(() => assertOpenRouterModel("not-a-model")).toThrow(/provider\/model/);
  });
});

describe("openRouterModel live pick", () => {
  const isolate = (fn: () => void) => {
    const dir = join(tmpdir(), `cr-or-${process.pid}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    const prev = {
      model: process.env.CURSOR_ROUTE_OPENROUTER_MODEL,
      offline: process.env.CURSOR_ROUTE_OR_OFFLINE,
      json: process.env.CURSOR_ROUTE_OR_CATALOG_JSON,
      cache: process.env.CURSOR_ROUTE_OR_CACHE_PATH,
      refresh: process.env.CURSOR_ROUTE_OR_REFRESH,
    };
    delete process.env.CURSOR_ROUTE_OPENROUTER_MODEL;
    process.env.CURSOR_ROUTE_OR_CACHE_PATH = join(dir, "cache.json");
    process.env.CURSOR_ROUTE_OR_REFRESH = "1";
    try {
      fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        const envKey = {
          model: "CURSOR_ROUTE_OPENROUTER_MODEL",
          offline: "CURSOR_ROUTE_OR_OFFLINE",
          json: "CURSOR_ROUTE_OR_CATALOG_JSON",
          cache: "CURSOR_ROUTE_OR_CACHE_PATH",
          refresh: "CURSOR_ROUTE_OR_REFRESH",
        }[k]!;
        if (v === undefined) delete process.env[envKey];
        else process.env[envKey] = v;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test("free/empty + offline → openrouter/free fallback", () => {
    isolate(() => {
      process.env.CURSOR_ROUTE_OR_OFFLINE = "1";
      expect(openRouterModel()).toBe("openrouter/free");
      expect(openRouterModel("free")).toBe("openrouter/free");
    });
  });

  test("free + injected catalog → ranked coder", () => {
    isolate(() => {
      process.env.CURSOR_ROUTE_OR_CATALOG_JSON = JSON.stringify({ data: CATALOG });
      expect(openRouterModel("free")).toBe("qwen/qwen-coder:free");
    });
  });

  test("CURSOR_ROUTE_OPENROUTER_MODEL pin wins over catalog", () => {
    isolate(() => {
      process.env.CURSOR_ROUTE_OPENROUTER_MODEL = "acme/pinned:free";
      process.env.CURSOR_ROUTE_OR_CATALOG_JSON = JSON.stringify({ data: CATALOG });
      expect(openRouterModel()).toBe("acme/pinned:free");
      expect(openRouterModel("free")).toBe("acme/pinned:free");
    });
  });

  test("explicit provider/model pin is used as-is", () => {
    isolate(() => {
      process.env.CURSOR_ROUTE_OR_CATALOG_JSON = JSON.stringify({ data: CATALOG });
      expect(openRouterModel("meta-llama/llama-3.3-70b-instruct:free")).toBe(
        "meta-llama/llama-3.3-70b-instruct:free",
      );
    });
  });
});

describe("openrouter health stays offline", () => {
  test("health with key + offline does not throw; mentions live pick, not a locked third-party default", () => {
    const dir = join(tmpdir(), `cr-or-health-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const prev = {
      key: process.env.OPENROUTER_API_KEY,
      model: process.env.CURSOR_ROUTE_OPENROUTER_MODEL,
      offline: process.env.CURSOR_ROUTE_OR_OFFLINE,
      json: process.env.CURSOR_ROUTE_OR_CATALOG_JSON,
      cache: process.env.CURSOR_ROUTE_OR_CACHE_PATH,
      refresh: process.env.CURSOR_ROUTE_OR_REFRESH,
    };
    process.env.OPENROUTER_API_KEY = "sk-or-v1-local-test-value-000000000000";
    delete process.env.CURSOR_ROUTE_OPENROUTER_MODEL;
    process.env.CURSOR_ROUTE_OR_OFFLINE = "1";
    delete process.env.CURSOR_ROUTE_OR_CATALOG_JSON;
    process.env.CURSOR_ROUTE_OR_CACHE_PATH = join(dir, "missing-cache.json");
    delete process.env.CURSOR_ROUTE_OR_REFRESH;
    try {
      const h = openRouterAdapter.health();
      expect(h.ok).toBe(true);
      expect(h.detail.toLowerCase()).toMatch(/live pick/);
      expect(h.detail).not.toMatch(/qwen\//);
      expect(h.detail).not.toMatch(/defaults to openrouter\/free/);
    } finally {
      if (prev.key === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prev.key;
      if (prev.model === undefined) delete process.env.CURSOR_ROUTE_OPENROUTER_MODEL;
      else process.env.CURSOR_ROUTE_OPENROUTER_MODEL = prev.model;
      if (prev.offline === undefined) delete process.env.CURSOR_ROUTE_OR_OFFLINE;
      else process.env.CURSOR_ROUTE_OR_OFFLINE = prev.offline;
      if (prev.json === undefined) delete process.env.CURSOR_ROUTE_OR_CATALOG_JSON;
      else process.env.CURSOR_ROUTE_OR_CATALOG_JSON = prev.json;
      if (prev.cache === undefined) delete process.env.CURSOR_ROUTE_OR_CACHE_PATH;
      else process.env.CURSOR_ROUTE_OR_CACHE_PATH = prev.cache;
      if (prev.refresh === undefined) delete process.env.CURSOR_ROUTE_OR_REFRESH;
      else process.env.CURSOR_ROUTE_OR_REFRESH = prev.refresh;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
