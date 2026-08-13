# Changelog

## 0.1.7 — 2026-08-12

- Fix: `CURSOR_ROUTE_DS_MODEL` / `ANTHROPIC_MODEL` now apply on the `start` product path (live default)
- Fix: Anthropic escape hatch (`CURSOR_ROUTE_ALLOW_ANTHROPIC=1`) no longer passes DeepSeek `--model` ids
- Fix: preserve `deepseek-v4-pro[1m]` (no silent SKU strip)
- `--model` validated only for `claude-ds`; ignored for grok/openrouter (including invalid values)
- `jobs` / `status` text output show `model` when set
- Tests cover env default via `startJob`, deepseek slot, Anthropic hatch, health OR-gate

## 0.1.6 — 2026-08-12

- Mid lane defaults to DeepSeek **Flash** (`deepseek-v4-flash`)
- `cursor-route start --model flash|pro` (aliases / full ids accepted)
- `claude-ds` adapter passes `-Model`; stock `claude` → DeepSeek gets `--model`
- Reserved `deepseek` worker slot (unreleased official harness; mid stays on `claude-ds`)
- Docs: Grok **auth** (`grok login`) ≠ usage/quota out → use `--model pro`
- `route-orch` skill Flash/Pro table; living brief in `docs/briefs/WORKING.md`

## 0.1.5

- OpenRouter free easy lane (`--lane easy` / `--worker openrouter`)

## 0.1.4

- Compiled `dist/` happy path, integration tests, `CURSOR_ROUTE_MAX_JOBS`

## Earlier

See git tags `v0.1.1`–`v0.1.3` for security/hardening and first npm ship notes.
