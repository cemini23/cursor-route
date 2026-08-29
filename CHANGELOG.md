# Changelog

## Unreleased

_(none)_

## 0.1.13 — 2026-08-29

- OpenRouter live-pick: do **not** cache the fetch-fail fallback (`openrouter/free`) — health no longer presents a stale fallback as `now openrouter/free`. Health says `cached <id>` only for a ranked catalog hit; otherwise `no catalog cache, fetch-fail fallback openrouter/free`.
- Catalog fetch is an unauthenticated `GET /models` (no `Authorization` on curl argv).
- Invalid `CURSOR_ROUTE_DS_MODEL` / `ANTHROPIC_MODEL` names those env vars instead of saying `Invalid --model`.
- Vision auto-pick uses `\bimage\b` so "ImageMagick" stays Flash.
- Hero demo fixture regenerated to **0.1.13**.

## 0.1.12 — 2026-08-29

- **Flash-first:** `--model flash` is the cheap mid default even when Grok **usage** is out. `--model pro` is harder mid / **hard backup only**, not the default Grok-out stand-in. Grok **auth** (`grok login` / `XAI_API_KEY`) still ≠ usage-out.
- `--model vision` (and `deepseek-v4-flash-vision-exp`) on `claude-ds` / `--worker deepseek`. Mid default stays Flash. If `--model` and `CURSOR_ROUTE_DS_MODEL` / `ANTHROPIC_MODEL` are unset, screenshot/image/png/jpg/jpeg/webp/ui mock/multimodal/vision prompts auto-pick vision Flash. Explicit `--model flash|pro|vision` always wins.
- Easy lane **live OpenRouter free pick** at request time (`GET /models`, rank `:free` or $0 text models, cache ~15 min). Do not hardcode a third-party model id as the default. Pin with `CURSOR_ROUTE_OPENROUTER_MODEL` or `--model provider/model`. Empty / `free` = live pick. Fetch-fail / empty catalog falls back to the OpenRouter **router** `openrouter/free` (fallback only). Health never fetches (cache or fallback only). Tests: `CURSOR_ROUTE_OR_OFFLINE=1` or `CURSOR_ROUTE_OR_CATALOG_JSON`.
- `route-orch`: ProgRouter (step-wise re-route) + MoRe (do not auto-spawn N panes for multi-perspective). Flash-first table + live OpenRouter wording.
- Hero demo fixture regenerated (`docs/fixtures/generate-hero-demo.sh`) so `--version` / health banner are 0.1.12.
- Headless `kill`: if SIGKILL was sent, succeed even when sandboxed `ps` (EPERM) treats unreaped zombies as alive. `refreshStatus` still fail-safes to alive.

## 0.1.11 — 2026-08-21

- `--worker opencode --model free` now **ranks the live OpenCode Zen catalog** (`GET https://opencode.ai/zen/v1/models`, cached ~15 min) instead of hardcoding `opencode/big-pickle`. Ox Alpha (`opencode/x-preview-f-free`) wins while it is listed and free; coding `-free` models next; `big-pickle` last among non-contributor free. Fetch-fail fallback is Ox Alpha.
- Pin with `--model provider/model` or `CURSOR_ROUTE_OPENCODE_MODEL`. Tests/CI: `CURSOR_ROUTE_ZEN_OFFLINE=1` or `CURSOR_ROUTE_ZEN_CATALOG_JSON` (health never fetches — cache or fallback only).
- Mid stays `claude-ds`; easy stays OpenRouter chat. OpenCode is still opt-in, not a lane default.

## 0.1.10 — 2026-08-21

- Opt-in `--worker opencode`: OpenCode `run` as a coding agent that defaults to Zen free model `opencode/big-pickle` (alias `--model free`). Not a lane default — mid stays `claude-ds`, easy stays OpenRouter chat.
- Always-approve → `opencode run --auto` (still honors explicit deny rules); `--ask` / `CURSOR_ROUTE_ASK=1` omits `--auto`. Never rewrites `~/.config/opencode/opencode.json`.
- `--model provider/model` for opencode (env `CURSOR_ROUTE_OPENCODE_MODEL`); `flash|pro` still DeepSeek-only.
- Health: `worker:opencode` ✓ when `opencode` is on PATH (override `CURSOR_ROUTE_OPENCODE_BIN`). Auth is `opencode auth login` at first start (same pattern as grok).
- Dry-run works without opencode installed (falls back to plain `opencode` in the printed command); real starts stay gated by health.
- Docs / `route-orch`: OpenCode is an opt-in usage-reduction worker, not a second mid harness. Free Zen models may log/train — non-secret prompts only.

## 0.1.9 — 2026-08-18

- Health proves mid DeepSeek: dedicated `lane:mid` check is ✓ only when mid is a `claude-ds` / `deepseek-claude` shim or stock `claude` with DeepSeek `ANTHROPIC_BASE_URL`. `CURSOR_ROUTE_ALLOW_ANTHROPIC=1` is not proof. Overall `ok` still uses the existing OR-gate (any worker + `CURSOR_ROUTE_RELAXED=1`); grok-only installs stay OK with `lane:mid` ✗ plus a fix tip.
- Health JSON includes `lanes.mid.{ worker, deepseek, detail }` (`worker` is always `"claude-ds"`).
- `status --json` adds an evidence tree (`spawn` / `execute` / `verify`). `verify.claim` is always `"unverified"` — the parent must capture; status never auto-greens.
- Headless pid liveness: if `ps` is unreadable (`EPERM` / non-zero), treat the pid as **alive** (fail-safe), not dead — avoids false-completed kills on sandboxed `ps`.
- `route-orch` skill: health-before-mid, evidence-tree closeout, always-approve is coding-worktrees-only (not LIVE Discord/trading), do not fork the mid harness; `--worker deepseek` stays experimental / cheap-to-abandon.
- Docs: `route-orch` **Eval & skill hygiene** (folded from Unreleased) — external eval contract (AutoDesign): never rewrite Verify / Success criteria mid-run to make a failing job look green (capture + exit status are the contract); skill misevolution: no auto-edit / promote skill variants from worker trajectories without operator HITL (write-time approval ≠ safe retrieval later); verify fail → prefer reconsidering the plan/definition over grinding the same tactic, with stage attribution when possible (spawn vs execute vs verify). Mid stays `claude-ds`.

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
