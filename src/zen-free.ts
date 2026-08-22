import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Live OpenCode Zen free-model pick — same idea as agent-toolkit
 * `select-openrouter-free-model.ps1`: probe the catalog, keep $0 text/coding
 * models, rank, cache ~15 min. Hardcoded ids are fallback only.
 *
 * Catalog: GET https://opencode.ai/zen/v1/models (no key). Zen ids are
 * `big-pickle` / `x-preview-f-free`; the CLI wants `opencode/<id>`.
 */

export const ZEN_MODELS_URL_DEFAULT = "https://opencode.ai/zen/v1/models";

/** Offline / fetch-fail fallback — Ox Alpha (zero-retention, currently top-tier free). */
export const OPENCODE_DEFAULT_MODEL = "opencode/x-preview-f-free";

export interface ZenModel {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: number | string; completion?: number | string };
}

export interface ZenFreePick {
  id: string;
  name: string;
  context_length: number;
  boost: number;
  picked_at: string;
  candidates: number;
  source: "ranked-free" | "fallback";
}

const EXCLUDE_RE =
  /lyria|whisper|tts|embed|embedding|image|vision-only|audio|diffusion|flux|stable-diffusion|moderation/i;
const CODING_RE =
  /coder|instruct|chat|laguna|nemotron|glm|qwen|kimi|deepseek|mimo|hy3|gpt-oss|north|gemma/i;
const OX_ALPHA_RE = /x-preview|ox-alpha|oxalpha/i;
const CONTRIBUTOR_RE = /contributor-free/i;

function zenModelsUrl(): string {
  return (process.env.CURSOR_ROUTE_ZEN_MODELS_URL || ZEN_MODELS_URL_DEFAULT).trim();
}

function cacheMinutes(): number {
  const n = Number(process.env.CURSOR_ROUTE_ZEN_CACHE_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function cachePath(): string {
  return process.env.CURSOR_ROUTE_ZEN_CACHE_PATH?.trim() ||
    join(tmpdir(), "cursor-route-zen-best-free.json");
}

export function assertOpenCodeModel(id: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._\-:]+)+$/i.test(id)) {
    throw new Error(
      `Invalid OpenCode model ${id}; expected provider/model (e.g. opencode/x-preview-f-free) or free`,
    );
  }
  return id;
}

/** Prefix a Zen catalog id (`x-preview-f-free`) for `opencode run --model`. */
export function asOpenCodeZenId(raw: string): string {
  const id = raw.trim();
  if (!id) throw new Error("empty Zen model id");
  return id.includes("/") ? assertOpenCodeModel(id) : assertOpenCodeModel(`opencode/${id}`);
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

export function isZenFreeModel(m: ZenModel): boolean {
  const id = (m.id || "").trim();
  if (!id) return false;
  if (EXCLUDE_RE.test(id) || EXCLUDE_RE.test(m.name || "")) return false;
  const prompt = num(m.pricing?.prompt);
  const completion = num(m.pricing?.completion);
  const pricedFree = prompt === 0 && completion === 0;
  const tagged =
    id.endsWith("-free") ||
    id.endsWith(":free") ||
    /(^|\/)big-pickle$/i.test(id);
  return tagged || pricedFree;
}

/** Higher boost wins. Ox Alpha first while it is in the free catalog. */
export function zenFreeBoost(id: string): number {
  const s = id.toLowerCase();
  if (OX_ALPHA_RE.test(s)) return 40;
  if (CONTRIBUTOR_RE.test(s)) return 1;
  if (CODING_RE.test(s)) return 20;
  if (s.endsWith("-free") || s.endsWith(":free")) return 10;
  if (/(^|\/)big-pickle$/.test(s)) return 5;
  return 0;
}

export function rankZenFreeModels(models: ZenModel[]): Array<{
  id: string;
  name: string;
  context_length: number;
  boost: number;
}> {
  const out: Array<{ id: string; name: string; context_length: number; boost: number }> = [];
  for (const m of models) {
    if (!isZenFreeModel(m)) continue;
    const raw = (m.id || "").trim();
    let id: string;
    try {
      id = asOpenCodeZenId(raw);
    } catch {
      continue;
    }
    const ctx = Number.isFinite(Number(m.context_length)) ? Number(m.context_length) : 0;
    out.push({
      id,
      name: (m.name || raw).trim(),
      context_length: ctx,
      boost: zenFreeBoost(id),
    });
  }
  out.sort((a, b) => {
    if (b.boost !== a.boost) return b.boost - a.boost;
    if (b.context_length !== a.context_length) return b.context_length - a.context_length;
    return a.id.localeCompare(b.id);
  });
  return out;
}

function readCache(): ZenFreePick | null {
  const p = cachePath();
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8")) as ZenFreePick;
    if (!j?.id) return null;
    const ageMs = Date.now() - Date.parse(j.picked_at);
    if (!Number.isFinite(ageMs) || ageMs < 0) return null;
    if (ageMs > cacheMinutes() * 60_000) return null;
    assertOpenCodeModel(j.id);
    return j;
  } catch {
    return null;
  }
}

function writeCache(pick: ZenFreePick): void {
  try {
    writeFileSync(cachePath(), JSON.stringify(pick), { mode: 0o600 });
  } catch {
    /* cache is optional */
  }
}

function httpGetSync(url: string, timeoutMs = 4000): string | null {
  const sec = Math.max(1, Math.ceil(timeoutMs / 1000));
  const curl = spawnSync(
    "curl",
    ["-fsS", "--max-time", String(sec), "-H", "Accept: application/json", url],
    { encoding: "utf8", timeout: timeoutMs + 500, env: { ...process.env } },
  );
  if (curl.status === 0 && curl.stdout?.trim()) return curl.stdout;
  return null;
}

function parseCatalog(raw: string): ZenModel[] {
  const j = JSON.parse(raw) as { data?: ZenModel[] } | ZenModel[];
  if (Array.isArray(j)) return j;
  if (Array.isArray(j.data)) return j.data;
  return [];
}

export function loadZenCatalog(): ZenModel[] {
  const inline = process.env.CURSOR_ROUTE_ZEN_CATALOG_JSON?.trim();
  if (inline) return parseCatalog(inline);
  if (process.env.CURSOR_ROUTE_ZEN_OFFLINE === "1") return [];
  const body = httpGetSync(zenModelsUrl());
  if (!body) return [];
  try {
    return parseCatalog(body);
  } catch {
    return [];
  }
}

/** Last live pick if the cache is still fresh — health-safe (no network). */
export function cachedZenFreePick(): string | null {
  try {
    return readCache()?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Best live Zen free model, or OPENCODE_DEFAULT_MODEL if the catalog is empty/offline.
 * `CURSOR_ROUTE_ZEN_REFRESH=1` skips cache. Tests: `CURSOR_ROUTE_ZEN_OFFLINE=1` or
 * `CURSOR_ROUTE_ZEN_CATALOG_JSON`.
 */
export function pickZenFreeModel(opts?: { catalog?: ZenModel[]; refresh?: boolean }): string {
  const refresh =
    opts?.refresh ||
    process.env.CURSOR_ROUTE_ZEN_REFRESH === "1";
  if (!refresh && opts?.catalog === undefined) {
    const cached = readCache();
    if (cached) return cached.id;
  }
  const models = opts?.catalog ?? loadZenCatalog();
  const ranked = rankZenFreeModels(models);
  const winner = ranked[0];
  if (!winner) {
    const fallback: ZenFreePick = {
      id: OPENCODE_DEFAULT_MODEL,
      name: "Ox Alpha Free (fallback)",
      context_length: 0,
      boost: 0,
      picked_at: new Date().toISOString(),
      candidates: 0,
      source: "fallback",
    };
    if (opts?.catalog === undefined) writeCache(fallback);
    return fallback.id;
  }
  const pick: ZenFreePick = {
    id: winner.id,
    name: winner.name,
    context_length: winner.context_length,
    boost: winner.boost,
    picked_at: new Date().toISOString(),
    candidates: ranked.length,
    source: "ranked-free",
  };
  if (opts?.catalog === undefined) writeCache(pick);
  return pick.id;
}

/**
 * Resolve OpenCode `--model` / env to a concrete `provider/model` id.
 * Empty or `free` → CURSOR_ROUTE_OPENCODE_MODEL pin, else live Zen free pick.
 */
export function openCodeModel(raw?: string | null): string {
  const v = (raw ?? "").trim();
  if (!v || v.toLowerCase() === "free") {
    const env = (process.env.CURSOR_ROUTE_OPENCODE_MODEL ?? "").trim();
    if (env && env.toLowerCase() !== "free") return assertOpenCodeModel(env);
    return pickZenFreeModel();
  }
  return assertOpenCodeModel(v);
}
