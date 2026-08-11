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
});

describe("openrouter adapter", () => {
  test("health fails without OPENROUTER_API_KEY", () => {
    delete process.env.OPENROUTER_API_KEY;
    const h = openRouterAdapter.health();
    expect(h.worker).toBe("openrouter");
    expect(h.ok).toBe(false);
    expect(h.detail).toContain("OPENROUTER_API_KEY");
  });

  test("health passes with a fake key (no network)", () => {
    setKey();
    const h = openRouterAdapter.health();
    expect(h.ok).toBe(true);
    expect(h.detail).toContain("openrouter/free");
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
