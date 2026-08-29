import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Live OpenRouter free-model pick — same shape as zen-free.ts.
 * Probe GET {OPENROUTER_BASE_URL}/models, keep $0 text models, rank, cache
 * ~15 min. Do not hardcode a third-party model id as the happy-path default.
 * `openrouter/free` is the OpenRouter **router** fallback only.
 */

export const OPENROUTER_MODELS_URL_DEFAULT = "https://openrouter.ai/api/v1/models";

/** Fetch-fail / empty-rank fallback — OpenRouter live router, not a locked model. */
export const OPENROUTER_FALLBACK_MODEL = "openrouter/free";

export interface OrModel {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: number | string; completion?: number | string };
  architecture?: { modality?: string };
}

export interface OrFreePick {
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
const BOOST_RE =
  /coder|instruct|chat|nemotron|qwen|llama|gemma|gpt-oss|kimi|glm|deepseek/i;

function orModelsUrl(): string {
  const base = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1")
    .trim()
    .replace(/\/+$/, "");
  return `${base}/models`;
}

function cacheMinutes(): number {
  const n = Number(process.env.CURSOR_ROUTE_OR_CACHE_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function cachePath(): string {
  return process.env.CURSOR_ROUTE_OR_CACHE_PATH?.trim() ||
    join(tmpdir(), "cursor-route-or-best-free.json");
}

export function assertOpenRouterModel(id: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._\-:]+)+$/i.test(id)) {
    throw new Error(
      `Invalid OpenRouter model ${id}; expected provider/model (e.g. qwen/qwen3-coder:free) or free`,
    );
  }
  return id;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

export function isOrFreeModel(m: OrModel): boolean {
  const id = (m.id || "").trim();
  if (!id) return false;
  if (EXCLUDE_RE.test(id) || EXCLUDE_RE.test(m.name || "")) return false;
  const modality = m.architecture?.modality;
  if (typeof modality === "string" && modality.trim() && !/text/i.test(modality)) {
    return false;
  }
  const prompt = num(m.pricing?.prompt);
  const completion = num(m.pricing?.completion);
  const pricedFree = prompt === 0 && completion === 0;
  const tagged = id.endsWith(":free");
  return tagged || pricedFree;
}

/** Higher boost wins. Coding/chat families beat generic free. No hardcoded id. */
export function orFreeBoost(id: string): number {
  return BOOST_RE.test(id) ? 20 : 10;
}

export function rankOrFreeModels(models: OrModel[]): Array<{
  id: string;
  name: string;
  context_length: number;
  boost: number;
}> {
  const out: Array<{ id: string; name: string; context_length: number; boost: number }> = [];
  for (const m of models) {
    if (!isOrFreeModel(m)) continue;
    const raw = (m.id || "").trim();
    let id: string;
    try {
      id = assertOpenRouterModel(raw);
    } catch {
      continue;
    }
    const ctx = Number.isFinite(Number(m.context_length)) ? Number(m.context_length) : 0;
    out.push({
      id,
      name: (m.name || raw).trim(),
      context_length: ctx,
      boost: orFreeBoost(id),
    });
  }
  out.sort((a, b) => {
    if (b.boost !== a.boost) return b.boost - a.boost;
    if (b.context_length !== a.context_length) return b.context_length - a.context_length;
    return a.id.localeCompare(b.id);
  });
  return out;
}

function readCache(): OrFreePick | null {
  const p = cachePath();
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8")) as OrFreePick;
    if (!j?.id) return null;
    const ageMs = Date.now() - Date.parse(j.picked_at);
    if (!Number.isFinite(ageMs) || ageMs < 0) return null;
    if (ageMs > cacheMinutes() * 60_000) return null;
    assertOpenRouterModel(j.id);
    return j;
  } catch {
    return null;
  }
}

function writeCache(pick: OrFreePick): void {
  try {
    writeFileSync(cachePath(), JSON.stringify(pick), { mode: 0o600 });
  } catch {
    /* cache is optional */
  }
}

function httpGetSync(url: string, timeoutMs = 4000): string | null {
  const sec = Math.max(1, Math.ceil(timeoutMs / 1000));
  // Public GET /models — no Authorization header (key would land in `ps` argv).
  const curl = spawnSync(
    "curl",
    ["-fsS", "--max-time", String(sec), "-H", "Accept: application/json", url],
    {
      encoding: "utf8",
      timeout: timeoutMs + 500,
      env: { ...process.env },
    },
  );
  if (curl.status === 0 && curl.stdout?.trim()) return curl.stdout;
  return null;
}

function parseCatalog(raw: string): OrModel[] {
  const j = JSON.parse(raw) as { data?: OrModel[] } | OrModel[];
  if (Array.isArray(j)) return j;
  if (Array.isArray(j.data)) return j.data;
  return [];
}

export function loadOrCatalog(): OrModel[] {
  const inline = process.env.CURSOR_ROUTE_OR_CATALOG_JSON?.trim();
  if (inline) return parseCatalog(inline);
  if (process.env.CURSOR_ROUTE_OR_OFFLINE === "1") return [];
  const body = httpGetSync(orModelsUrl());
  if (!body) return [];
  try {
    return parseCatalog(body);
  } catch {
    return [];
  }
}

/** Last live pick if the cache is still fresh — health-safe (no network). */
export function cachedOrFreePick(): string | null {
  try {
    return readCache()?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Best live OpenRouter free text model, or OPENROUTER_FALLBACK_MODEL if the
 * catalog is empty/offline. `CURSOR_ROUTE_OR_REFRESH=1` skips cache.
 * Tests: `CURSOR_ROUTE_OR_OFFLINE=1` or `CURSOR_ROUTE_OR_CATALOG_JSON`.
 */
export function pickOrFreeModel(opts?: { catalog?: OrModel[]; refresh?: boolean }): string {
  const refresh =
    opts?.refresh ||
    process.env.CURSOR_ROUTE_OR_REFRESH === "1";
  if (!refresh && opts?.catalog === undefined) {
    const cached = readCache();
    if (cached) return cached.id;
  }
  const models = opts?.catalog ?? loadOrCatalog();
  const ranked = rankOrFreeModels(models);
  const winner = ranked[0];
  if (!winner) {
    // Do not cache fallback — a 15-min stale fallback would masquerade as a
    // live pick in health (`now openrouter/free`). Retry the catalog next call.
    return OPENROUTER_FALLBACK_MODEL;
  }
  const pick: OrFreePick = {
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
 * Resolve OpenRouter `--model` / env to a concrete `provider/model` id.
 * Empty or `free` → CURSOR_ROUTE_OPENROUTER_MODEL pin, else live catalog pick.
 */
export function openRouterModel(raw?: string | null): string {
  const v = (raw ?? "").trim();
  if (!v || v.toLowerCase() === "free") {
    const env = (process.env.CURSOR_ROUTE_OPENROUTER_MODEL ?? "").trim();
    if (env && env.toLowerCase() !== "free") return assertOpenRouterModel(env);
    return pickOrFreeModel();
  }
  return assertOpenRouterModel(v);
}
