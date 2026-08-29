#!/usr/bin/env bun
/**
 * One-shot OpenRouter easy-lane runner — reads a prompt file and POSTs it to
 * OpenRouter's chat/completions, printing the assistant reply to stdout.
 * No runtime npm deps (Node 20+ global fetch). Invoked by the openrouter
 * adapter (dist via node, else src via bun). Never echoes OPENROUTER_API_KEY.
 */
import { readFileSync } from "node:fs";
import { openRouterModel, openRouterBaseUrl } from "./config.ts";
import { looksLikeSecretMaterial } from "./secrets.ts";

const SYSTEM_PROMPT =
  "You are a drafting/rewrite helper for cursor-route. Never invent credentials, API keys, or secrets; if asked for secret material, refuse. Provide educational, general-purpose help.";

function fail(msg: string, code: number): never {
  console.error(`cursor-route/openrouter-run: ${msg}`);
  process.exit(code);
}

function parseArgs(argv: string[]): { promptFile?: string } {
  const flags: { promptFile?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      console.log(
        "usage: cursor-route/openrouter-run --prompt-file <path>\n" +
          "env: OPENROUTER_API_KEY (required), CURSOR_ROUTE_OPENROUTER_MODEL (unset/free = live pick), OPENROUTER_BASE_URL",
      );
      process.exit(0);
    }
    if (a === "--prompt-file") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) fail("--prompt-file requires a value", 2);
      flags.promptFile = v;
      i++;
    } else if (a.startsWith("--prompt-file=")) {
      flags.promptFile = a.slice("--prompt-file=".length);
    } else {
      fail(`unknown argument: ${a}`, 2);
    }
  }
  return flags;
}

async function main(): Promise<void> {
  const { promptFile } = parseArgs(process.argv.slice(2));
  if (!promptFile) fail("--prompt-file <path> is required", 2);

  let prompt: string;
  try {
    prompt = readFileSync(promptFile, "utf8");
  } catch (e) {
    fail(`cannot read prompt file: ${(e as Error).message}`, 2);
  }
  if (!prompt.trim()) fail("prompt file is empty", 2);
  if (looksLikeSecretMaterial(prompt)) {
    fail("refusing prompt: looks like secret key material — easy lane is for non-secret drafts", 3);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) fail("OPENROUTER_API_KEY is not set", 2);

  const base = openRouterBaseUrl().replace(/\/+$/, "");
  const url = `${base}/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter etiquette: identify the app so the provider can see usage source.
        "HTTP-Referer": "https://github.com/cemini23/cursor-route",
        "X-Title": "cursor-route",
      },
      body: JSON.stringify({
        model: openRouterModel(),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (e) {
    fail(`network error calling ${url}: ${(e as Error).message}`, 1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    fail(`OpenRouter API ${res.status}: ${body.slice(0, 500)}`, 1);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content) fail("OpenRouter returned no assistant content", 1);
  process.stdout.write(content.endsWith("\n") ? content : content + "\n");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e), 1));
