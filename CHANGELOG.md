# Changelog

## Unreleased

- Docs: `route-orch` skill adds **Eval & skill hygiene** — external eval contract (AutoDesign): never rewrite Verify / Success criteria mid-run to make a failing job look green (capture + exit status are the contract); skill misevolution: no auto-edit / promote skill variants from worker trajectories without operator HITL (write-time approval ≠ safe retrieval later); verify fail → prefer reconsidering the plan/definition over grinding the same tactic, with stage attribution when possible (spawn vs execute vs verify). Mid stays `claude-ds`; `--worker deepseek` remains experimental. Docs only — no version bump.

## 0.1.8 — 2026-08-14

- Experimental `--worker deepseek`: official DeepSeek Harness (`dsh`, `@deepseek-ai/dsh`) runs headless — `dsh --profile headless` with a per-job Cordis patch pinning the model. Not a mid default: `laneWorkers.mid` stays `claude-ds`.
- `--model flash|pro` (and `deepseek-v4-pro[1m]`) now applies to both `claude-ds` and `deepseek`; patch sets `agent-default-model` → `provider: deepseek-official` (never rewrites `~/.dsh/settings.yaml`, so parallel jobs don't race).
- Always-approve → `DSH_PERMISSION_MODE=danger-full-access`; `--ask` → `workspace-write`. `DEEPSEEK_API_KEY` travels via env only — never in the launch command or patch.
- Health: `worker:deepseek` ✓ only when `dsh` is on PATH (override `CURSOR_ROUTE_DSH_BIN`) **and** `DEEPSEEK_API_KEY` is set.
- Dry-run for `--worker deepseek` works without `dsh` installed (falls back to plain `dsh` in the printed command); real starts stay gated by health.
- `clean` also removes leftover `.dsh-patch.yml` files; patch path never overwrites a non-`.prompt` prompt file.

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
