import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
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

  test("boost: tier ranks Qwen/GLM/Kimi above Nemotron; generic free is default", () => {
    expect(orFreeBoost("qwen/qwen-coder:free")).toBe(100);
    expect(orFreeBoost("z-ai/glm-5.2:free")).toBe(95);
    expect(orFreeBoost("moonshotai/kimi-k2:free")).toBe(95);
    expect(orFreeBoost("acme/generic:free")).toBe(40);
    expect(orFreeBoost("meta-llama/llama-3.3-70b-instruct:free")).toBe(70);
    expect(orFreeBoost("nvidia/nemotron-3-550b:free")).toBe(15);
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

  test("all seven tier buckets", () => {
    expect(orFreeBoost("qwen/qwen3-coder:free")).toBe(100);
    expect(orFreeBoost("z-ai/glm-5.2:free")).toBe(95);
    expect(orFreeBoost("moonshotai/kimi-k2:free")).toBe(95);
    expect(orFreeBoost("deepseek/deepseek-chat:free")).toBe(90);
    expect(orFreeBoost("acme/hy-foo:free")).toBe(90);
    expect(orFreeBoost("meta-llama/llama-3.3-70b-instruct:free")).toBe(70);
    expect(orFreeBoost("google/gemma-3-12b:free")).toBe(70);
    expect(orFreeBoost("openai/gpt-oss-120b:free")).toBe(70);
    expect(orFreeBoost("minimax/minimax-m1:free")).toBe(70);
    expect(orFreeBoost("nvidia/nemotron-3-550b:free")).toBe(15);
    expect(orFreeBoost("acme/generic:free")).toBe(40);
  });

  test("equal score: higher tier wins (Qwen ctx 0 vs GLM at ctx cap)", () => {
    const ranked = rankOrFreeModels([
      { id: "qwen/qwen3-coder:free", context_length: 0 },
      { id: "z-ai/glm-5.2:free", context_length: 131_072 },
    ]);
    expect(ranked[0]?.boost).toBe(ranked[1]?.boost);
    expect(ranked[0]?.id).toBe("qwen/qwen3-coder:free");
  });

  test("equal score same tier: id ascending", () => {
    const ranked = rankOrFreeModels([
      { id: "qwen/zzz-coder:free", context_length: 8_000 },
      { id: "qwen/aaa-coder:free", context_length: 8_000 },
    ]);
    expect(ranked[0]?.id).toBe("qwen/aaa-coder:free");
    expect(ranked[1]?.id).toBe("qwen/zzz-coder:free");
  });

  test("ctx bonus caps at 131072: same-tier 131072 vs 262144 ties then id asc", () => {
    const ranked = rankOrFreeModels([
      { id: "qwen/zzz-coder:free", context_length: 262_144 },
      { id: "qwen/aaa-coder:free", context_length: 131_072 },
    ]);
    expect(ranked[0]?.boost).toBe(ranked[1]?.boost);
    expect(ranked[0]?.id).toBe("qwen/aaa-coder:free");
  });

  test("huge Nemotron free model loses to GLM/Qwen on tier rank", () => {
    const ranked = rankOrFreeModels([
      { id: "nvidia/nemotron-3-550b:free", name: "Nemotron 3 550B", context_length: 262_144 },
      { id: "z-ai/glm-5.2:free", name: "GLM 5.2", context_length: 32_768 },
      { id: "qwen/qwen3-coder:free", name: "Qwen3 Coder", context_length: 32_768 },
    ]);
    expect(ranked[0]?.id).toBe("qwen/qwen3-coder:free");
    expect(ranked[0]?.id).not.toBe("nvidia/nemotron-3-550b:free");
    expect(ranked[1]?.id).toBe("z-ai/glm-5.2:free");
    expect(ranked[2]?.id).toBe("nvidia/nemotron-3-550b:free");
    expect(ranked[0]!.boost).toBeGreaterThan(ranked[2]!.boost);
  });

  test("huge ctx alone does not beat a higher tier (ctx bonus caps at 131072)", () => {
    const ranked = rankOrFreeModels([
      { id: "nvidia/nemotron-3-550b:free", context_length: 1_048_576 },
      { id: "qwen/qwen3-coder:free", context_length: 1_000 },
    ]);
    expect(ranked[0]?.id).toBe("qwen/qwen3-coder:free");
  });

  test("pickOrFreeModel uses the ranked catalog winner", () => {
    expect(pickOrFreeModel({ catalog: CATALOG })).toBe("qwen/qwen-coder:free");
  });

  test("pickOrFreeModel winner is not a huge Nemotron when GLM/Qwen are free", () => {
    const winner = pickOrFreeModel({
      catalog: [
        { id: "nvidia/nemotron-3-550b:free", name: "Nemotron 3 550B", context_length: 262_144 },
        { id: "z-ai/glm-5.2:free", name: "GLM 5.2", context_length: 32_768 },
      ],
    });
    expect(winner).not.toBe("nvidia/nemotron-3-550b:free");
    expect(winner).toBe("z-ai/glm-5.2:free");
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

  test("offline fallback is not written to cache", () => {
    isolate(() => {
      delete process.env.CURSOR_ROUTE_OR_REFRESH;
      process.env.CURSOR_ROUTE_OR_OFFLINE = "1";
      const cache = process.env.CURSOR_ROUTE_OR_CACHE_PATH!;
      expect(openRouterModel()).toBe("openrouter/free");
      expect(existsSync(cache)).toBe(false);
    });
  });

  test("ranked pick is cached; offline second call returns the cached id", () => {
    isolate(() => {
      process.env.CURSOR_ROUTE_OR_CATALOG_JSON = JSON.stringify({ data: CATALOG });
      expect(openRouterModel("free")).toBe("qwen/qwen-coder:free");
      delete process.env.CURSOR_ROUTE_OR_REFRESH;
      process.env.CURSOR_ROUTE_OR_OFFLINE = "1";
      delete process.env.CURSOR_ROUTE_OR_CATALOG_JSON;
      expect(existsSync(process.env.CURSOR_ROUTE_OR_CACHE_PATH!)).toBe(true);
      expect(openRouterModel("free")).toBe("qwen/qwen-coder:free");
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
      expect(h.detail).toMatch(/fallback/);
      expect(h.detail).not.toMatch(/now openrouter\/free/);
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
