import { describe, expect, test, afterEach } from "bun:test";
import { openRouterAdapter } from "./openrouter.ts";

const KEY = "sk-or-v1-local-test-value-000000000000";

function setKey(): void {
  process.env.OPENROUTER_API_KEY = KEY;
}

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.CURSOR_ROUTE_OPENROUTER_MODEL;
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.CURSOR_ROUTE_OR_OFFLINE;
  delete process.env.CURSOR_ROUTE_OR_CATALOG_JSON;
  delete process.env.CURSOR_ROUTE_OR_CACHE_PATH;
  delete process.env.CURSOR_ROUTE_OR_REFRESH;
});

describe("openrouter adapter", () => {
  test("health fails without OPENROUTER_API_KEY", () => {
    delete process.env.OPENROUTER_API_KEY;
    const h = openRouterAdapter.health();
    expect(h.worker).toBe("openrouter");
    expect(h.ok).toBe(false);
    expect(h.detail).toContain("OPENROUTER_API_KEY");
    expect(h.detail).not.toMatch(/defaults to openrouter\/free/);
  });

  test("health passes with a fake key (no network)", () => {
    setKey();
    const prev = {
      model: process.env.CURSOR_ROUTE_OPENROUTER_MODEL,
      offline: process.env.CURSOR_ROUTE_OR_OFFLINE,
      json: process.env.CURSOR_ROUTE_OR_CATALOG_JSON,
      cache: process.env.CURSOR_ROUTE_OR_CACHE_PATH,
    };
    delete process.env.CURSOR_ROUTE_OPENROUTER_MODEL;
    process.env.CURSOR_ROUTE_OR_OFFLINE = "1";
    delete process.env.CURSOR_ROUTE_OR_CATALOG_JSON;
    process.env.CURSOR_ROUTE_OR_CACHE_PATH = "/tmp/cursor-route-or-health-missing.json";
    try {
      const h = openRouterAdapter.health();
      expect(h.ok).toBe(true);
      expect(h.detail.toLowerCase()).toMatch(/live pick/);
      expect(h.detail).toMatch(/fallback/);
      expect(h.detail).not.toMatch(/now openrouter\/free/);
      expect(h.detail).not.toMatch(/defaults to openrouter\/free/);
    } finally {
      if (prev.model === undefined) delete process.env.CURSOR_ROUTE_OPENROUTER_MODEL;
      else process.env.CURSOR_ROUTE_OPENROUTER_MODEL = prev.model;
      if (prev.offline === undefined) delete process.env.CURSOR_ROUTE_OR_OFFLINE;
      else process.env.CURSOR_ROUTE_OR_OFFLINE = prev.offline;
      if (prev.json === undefined) delete process.env.CURSOR_ROUTE_OR_CATALOG_JSON;
      else process.env.CURSOR_ROUTE_OR_CATALOG_JSON = prev.json;
      if (prev.cache === undefined) delete process.env.CURSOR_ROUTE_OR_CACHE_PATH;
      else process.env.CURSOR_ROUTE_OR_CACHE_PATH = prev.cache;
    }
  });

  test("buildLaunch passes key via env and never echoes it in the command", () => {
    setKey();
    const plan = openRouterAdapter.buildLaunch({
      promptFile: "/tmp/abc123.prompt",
      cwd: "/tmp",
      alwaysApprove: true,
    });
    expect(plan.worker).toBe("openrouter");
    expect(plan.command).toContain("--prompt-file");
    expect(plan.command).not.toContain(KEY);
    expect(plan.env?.OPENROUTER_API_KEY).toBe(KEY);
    // No approval concept for a pure HTTP call.
    expect(plan.alwaysApprove).toBe(false);
  });

  test("buildLaunch without key still prints a command (dry-run friendly) and no env", () => {
    delete process.env.OPENROUTER_API_KEY;
    const plan = openRouterAdapter.buildLaunch({
      promptFile: "/tmp/abc123.prompt",
      cwd: "/tmp",
      alwaysApprove: true,
    });
    expect(plan.command).toContain("--prompt-file");
    expect(plan.env).toBeUndefined();
  });
});
