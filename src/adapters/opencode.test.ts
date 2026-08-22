import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { opencodeAdapter } from "./opencode.ts";
import { startJob } from "../jobs.ts";
import {
  openCodeModel,
  assertOpenCodeModel,
  OPENCODE_DEFAULT_MODEL,
} from "../config.ts";

describe("openCodeModel", () => {
  test("defaults to live Zen pick (Ox Alpha fallback when offline)", () => {
    const prev = {
      model: process.env.CURSOR_ROUTE_OPENCODE_MODEL,
      offline: process.env.CURSOR_ROUTE_ZEN_OFFLINE,
      cache: process.env.CURSOR_ROUTE_ZEN_CACHE_PATH,
      json: process.env.CURSOR_ROUTE_ZEN_CATALOG_JSON,
      refresh: process.env.CURSOR_ROUTE_ZEN_REFRESH,
    };
    const cache = join(tmpdir(), `cr-oc-model-${process.pid}.json`);
    delete process.env.CURSOR_ROUTE_OPENCODE_MODEL;
    delete process.env.CURSOR_ROUTE_ZEN_CATALOG_JSON;
    process.env.CURSOR_ROUTE_ZEN_OFFLINE = "1";
    process.env.CURSOR_ROUTE_ZEN_CACHE_PATH = cache;
    process.env.CURSOR_ROUTE_ZEN_REFRESH = "1";
    try {
      expect(openCodeModel()).toBe("opencode/x-preview-f-free");
      expect(openCodeModel("")).toBe(OPENCODE_DEFAULT_MODEL);
      expect(openCodeModel("free")).toBe("opencode/x-preview-f-free");
    } finally {
      if (prev.model === undefined) delete process.env.CURSOR_ROUTE_OPENCODE_MODEL;
      else process.env.CURSOR_ROUTE_OPENCODE_MODEL = prev.model;
      if (prev.offline === undefined) delete process.env.CURSOR_ROUTE_ZEN_OFFLINE;
      else process.env.CURSOR_ROUTE_ZEN_OFFLINE = prev.offline;
      if (prev.cache === undefined) delete process.env.CURSOR_ROUTE_ZEN_CACHE_PATH;
      else process.env.CURSOR_ROUTE_ZEN_CACHE_PATH = prev.cache;
      if (prev.json === undefined) delete process.env.CURSOR_ROUTE_ZEN_CATALOG_JSON;
      else process.env.CURSOR_ROUTE_ZEN_CATALOG_JSON = prev.json;
      if (prev.refresh === undefined) delete process.env.CURSOR_ROUTE_ZEN_REFRESH;
      else process.env.CURSOR_ROUTE_ZEN_REFRESH = prev.refresh;
      rmSync(cache, { force: true });
    }
  });

  test("env override wins for empty/free", () => {
    const prev = process.env.CURSOR_ROUTE_OPENCODE_MODEL;
    process.env.CURSOR_ROUTE_OPENCODE_MODEL = "opencode/hy3-free";
    try {
      expect(openCodeModel()).toBe("opencode/hy3-free");
      expect(openCodeModel("free")).toBe("opencode/hy3-free");
    } finally {
      if (prev === undefined) delete process.env.CURSOR_ROUTE_OPENCODE_MODEL;
      else process.env.CURSOR_ROUTE_OPENCODE_MODEL = prev;
    }
  });

  test("explicit provider/model wins over env", () => {
    const prev = process.env.CURSOR_ROUTE_OPENCODE_MODEL;
    process.env.CURSOR_ROUTE_OPENCODE_MODEL = "opencode/hy3-free";
    try {
      expect(openCodeModel("opencode/mimo-v2.5-free")).toBe("opencode/mimo-v2.5-free");
    } finally {
      if (prev === undefined) delete process.env.CURSOR_ROUTE_OPENCODE_MODEL;
      else process.env.CURSOR_ROUTE_OPENCODE_MODEL = prev;
    }
  });

  test("accepts OpenRouter-style extra slash and :free", () => {
    expect(assertOpenCodeModel("openrouter/qwen/qwen3-coder:free")).toBe(
      "openrouter/qwen/qwen3-coder:free",
    );
  });

  test("rejects injection / flash|pro aliases", () => {
    expect(() => openCodeModel("flash")).toThrow(/provider\/model/);
    expect(() => openCodeModel("x\n--evil")).toThrow(/provider\/model/);
    expect(() => openCodeModel("opencode/big pickle")).toThrow(/provider\/model/);
  });
});

describe("opencode adapter", () => {
  const makeFake = (suffix: string) => {
    const dir = join(tmpdir(), `cr-oc-${process.pid}-${suffix}`);
    mkdirSync(dir, { recursive: true });
    const bin = join(dir, "opencode");
    writeFileSync(bin, "#!/bin/sh\necho fake-opencode\n");
    chmodSync(bin, 0o755);
    return { dir, bin };
  };

  const withEnv = (patch: Record<string, string | undefined>, fn: () => void) => {
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

  test("health: no binary → not ok, install hint names npm package", () => {
    withEnv(
      { CURSOR_ROUTE_OPENCODE_BIN: join(tmpdir(), `missing-oc-${process.pid}`) },
      () => {
        const h = opencodeAdapter.health();
        expect(h.ok).toBe(false);
        expect(h.detail).toMatch(/npm i -g opencode-ai/);
      },
    );
  });

  test("health: binary → ok (auth at first start)", () => {
    const { dir, bin } = makeFake("ok");
    withEnv(
      {
        CURSOR_ROUTE_OPENCODE_BIN: bin,
        CURSOR_ROUTE_ZEN_CACHE_PATH: join(dir, "missing-cache.json"),
      },
      () => {
        const h = opencodeAdapter.health();
        expect(h.ok).toBe(true);
        expect(h.binary).toBe(bin);
        expect(h.detail).toContain("live Zen pick");
        expect(h.detail).toContain("opencode/x-preview-f-free");
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildLaunch: default free model + --auto; prompt via cat", () => {
    const { dir, bin } = makeFake("launch");
    const promptFile = join(dir, "job.prompt");
    writeFileSync(promptFile, "ping");
    withEnv(
      {
        CURSOR_ROUTE_OPENCODE_BIN: bin,
        CURSOR_ROUTE_OPENCODE_MODEL: undefined,
        CURSOR_ROUTE_ASK: undefined,
        CURSOR_ROUTE_ZEN_OFFLINE: "1",
        CURSOR_ROUTE_ZEN_CACHE_PATH: join(dir, "zen-cache.json"),
        CURSOR_ROUTE_ZEN_REFRESH: "1",
        CURSOR_ROUTE_ZEN_CATALOG_JSON: undefined,
      },
      () => {
        const plan = opencodeAdapter.buildLaunch({
          promptFile,
          cwd: dir,
          alwaysApprove: true,
        });
        expect(plan.command).toContain("run");
        expect(plan.command).toContain("--auto");
        expect(plan.command).toContain("opencode/x-preview-f-free");
        expect(plan.command).toContain("$(cat");
        expect(plan.command).toContain("--dir");
        expect(plan.alwaysApprove).toBe(true);
        expect(plan.command).not.toContain("npx");
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildLaunch: alwaysApprove false (--ask) omits --auto", () => {
    const { dir, bin } = makeFake("ask");
    const promptFile = join(dir, "job.prompt");
    writeFileSync(promptFile, "ping");
    withEnv({ CURSOR_ROUTE_OPENCODE_BIN: bin }, () => {
      const plan = opencodeAdapter.buildLaunch({
        promptFile,
        cwd: dir,
        alwaysApprove: false,
        modelId: "opencode/hy3-free",
      });
      expect(plan.command).toContain("opencode/hy3-free");
      expect(plan.command).not.toContain("--auto");
      expect(plan.alwaysApprove).toBe(false);
    });
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildLaunch: CURSOR_ROUTE_ASK=1 opts out even when alwaysApprove true", () => {
    const { dir, bin } = makeFake("ask-env");
    const promptFile = join(dir, "job.prompt");
    writeFileSync(promptFile, "ping");
    withEnv(
      {
        CURSOR_ROUTE_OPENCODE_BIN: bin,
        CURSOR_ROUTE_ASK: "1",
        CURSOR_ROUTE_ZEN_OFFLINE: "1",
        CURSOR_ROUTE_ZEN_CACHE_PATH: join(dir, "zen-cache.json"),
        CURSOR_ROUTE_ZEN_REFRESH: "1",
      },
      () => {
        const plan = opencodeAdapter.buildLaunch({
          promptFile,
          cwd: dir,
          alwaysApprove: true,
        });
        expect(plan.command).not.toContain("--auto");
        expect(plan.alwaysApprove).toBe(false);
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildLaunch: missing binary falls back to plain `opencode` for dry-run", () => {
    const { dir } = makeFake("nobin");
    const promptFile = join(dir, "job.prompt");
    writeFileSync(promptFile, "ping");
    const empty = join(dir, "empty");
    mkdirSync(empty, { recursive: true });
    withEnv(
      {
        CURSOR_ROUTE_OPENCODE_BIN: undefined,
        PATH: empty,
        CURSOR_ROUTE_OPENCODE_MODEL: undefined,
        CURSOR_ROUTE_ZEN_OFFLINE: "1",
        CURSOR_ROUTE_ZEN_CACHE_PATH: join(dir, "zen-cache.json"),
        CURSOR_ROUTE_ZEN_REFRESH: "1",
      },
      () => {
        const plan = opencodeAdapter.buildLaunch({
          promptFile,
          cwd: dir,
          alwaysApprove: true,
          dryRun: true,
        });
        expect(plan.command).toContain("'opencode' run");
        expect(plan.command).toContain("--auto");
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("--worker opencode dry-run succeeds with fake binary", () => {
    const dir = join(tmpdir(), `cr-oc-start-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const bin = join(dir, "opencode");
    writeFileSync(bin, "#!/bin/sh\necho fake-opencode\n");
    chmodSync(bin, 0o755);
    const prev = {
      bin: process.env.CURSOR_ROUTE_OPENCODE_BIN,
      model: process.env.CURSOR_ROUTE_OPENCODE_MODEL,
      jobs: process.env.CURSOR_ROUTE_JOBS_DIR,
      offline: process.env.CURSOR_ROUTE_ZEN_OFFLINE,
      cache: process.env.CURSOR_ROUTE_ZEN_CACHE_PATH,
      refresh: process.env.CURSOR_ROUTE_ZEN_REFRESH,
      json: process.env.CURSOR_ROUTE_ZEN_CATALOG_JSON,
    };
    process.env.CURSOR_ROUTE_OPENCODE_BIN = bin;
    delete process.env.CURSOR_ROUTE_OPENCODE_MODEL;
    delete process.env.CURSOR_ROUTE_ZEN_CATALOG_JSON;
    process.env.CURSOR_ROUTE_JOBS_DIR = join(dir, "jobs");
    process.env.CURSOR_ROUTE_ZEN_OFFLINE = "1";
    process.env.CURSOR_ROUTE_ZEN_CACHE_PATH = join(dir, "zen-cache.json");
    process.env.CURSOR_ROUTE_ZEN_REFRESH = "1";
    try {
      const result = startJob({
        prompt: "ping",
        worker: "opencode",
        dryRun: true,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.job.worker).toBe("opencode");
      expect(result.job.model).toBe("opencode/x-preview-f-free");
      expect(result.command).toContain("run");
      expect(result.command).toContain("--auto");
      expect(result.command).toContain("$(cat");
    } finally {
      if (prev.bin === undefined) delete process.env.CURSOR_ROUTE_OPENCODE_BIN;
      else process.env.CURSOR_ROUTE_OPENCODE_BIN = prev.bin;
      if (prev.model === undefined) delete process.env.CURSOR_ROUTE_OPENCODE_MODEL;
      else process.env.CURSOR_ROUTE_OPENCODE_MODEL = prev.model;
      if (prev.jobs === undefined) delete process.env.CURSOR_ROUTE_JOBS_DIR;
      else process.env.CURSOR_ROUTE_JOBS_DIR = prev.jobs;
      if (prev.offline === undefined) delete process.env.CURSOR_ROUTE_ZEN_OFFLINE;
      else process.env.CURSOR_ROUTE_ZEN_OFFLINE = prev.offline;
      if (prev.cache === undefined) delete process.env.CURSOR_ROUTE_ZEN_CACHE_PATH;
      else process.env.CURSOR_ROUTE_ZEN_CACHE_PATH = prev.cache;
      if (prev.refresh === undefined) delete process.env.CURSOR_ROUTE_ZEN_REFRESH;
      else process.env.CURSOR_ROUTE_ZEN_REFRESH = prev.refresh;
      if (prev.json === undefined) delete process.env.CURSOR_ROUTE_ZEN_CATALOG_JSON;
      else process.env.CURSOR_ROUTE_ZEN_CATALOG_JSON = prev.json;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
