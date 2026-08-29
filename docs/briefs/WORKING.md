---
title: cursor-route workspace — working brief (edit in place)
repo: ~/Projects/cursor-route
npm: cursor-route@0.1.13 (publishing this slice)
created: 2026-08-12
updated: 2026-08-29
---

# cursor-route — living brief

**Edit this file.** It is the working notes for this public repo (CLI + `route-orch` skill + adapters). Not the private Cemini `/route` skill (`agent-toolkit` / federation).

When a chunk is accepted: apply it to `src/`, `README.md`, and/or `skills/route-orch/SKILL.md` (keep `.cursor/skills/route-orch/SKILL.md` in sync). Then tick **Open** and add an **Edit log** line.

## What this repo is

Cursor Agent plans. Workers run in tmux via `cursor-route`:

| Lane | Worker | Intent |
|------|--------|--------|
| `easy` | OpenRouter free (live pick) | Wording / drafts — non-secret prompts only |
| `mid` | claude-ds (DeepSeek behind Claude Code) | Default implement (**Flash**; `--model vision` for screenshots; `--model pro` harder mid / hard backup only) |
| `hard` | Grok CLI | Hard implement |
| opt-in | OpenCode | `--worker opencode` coding agent; `--model free` ranks live Zen catalog (Ox Alpha first while listed) |

Always-approve on for coding worktrees (`--ask` / `CURSOR_ROUTE_ASK=1` to opt out) — not LIVE Discord/trading. Jobs live in `~/.local/share/cursor-route/jobs`, not in this clone.

Install: `npm i -g cursor-route` → **0.1.13**. Release notes: [CHANGELOG.md](../../CHANGELOG.md).

## Open (edit / check off)

- [x] **Flash vs Pro on the CLI** — public default **Flash**; `--model pro` → `deepseek-v4-pro` (LIVE 0.1.6+)
  - [x] pass `claude-ds -Model deepseek-v4-flash|deepseek-v4-pro` from the adapter
  - [x] add `--model flash|pro` on `start`
  - [x] document Grok **auth** ≠ usage-out (`grok login`); Flash-first when Grok **usage** is out; Pro = harder mid / hard backup only (0.1.12)
- [x] **Skill `route-orch`** — Flash/Pro table in `skills/` + `.cursor/skills/`
- [x] **Official DeepSeek Harness** — `deepseek` adapter slot present; `@deepseek-ai/dsh` 0.1.0-rc.6 (2026-08-13, github.com/deepseek-ai/deepseek-harness, MIT) is a developer-preview plugin kernel (web UI + `dsh --profile headless "job"`), not a Claude Code replacement; mid does not swap
- [x] **0.1.7 debug fixes** — env default wired through `startJob`; Anthropic hatch omits DS ids; preserve `[1m]`
- [x] **Experimental `--worker deepseek`** — 0.1.8: real dsh adapter (`dsh --profile headless` + per-job Cordis patch pins the model; never writes `~/.dsh/settings.yaml`). Always-approve → `DSH_PERMISSION_MODE=danger-full-access`, `--ask` → `workspace-write`; key via env only. Health ✓ needs `dsh` + `DEEPSEEK_API_KEY` (override `CURSOR_ROUTE_DSH_BIN`). Mid stays **claude-ds**.
- [x] **route-orch brief steals (2026-08-14)** — AutoDesign / misevolution / Vero habits into the public skill: **Verify / claim closeout** (external eval contract; activity ≠ verification), **Eval & skill hygiene** (mid-run Verify-rewrite ban; skill misevolution HITL — no auto-promotion of worker-trajectory variants; verify-fail → reconsider plan/definition + stage attribution spawn/execute/verify); handoff shape Success criteria + Verify + NEVER; skills synced; mid stays claude-ds.
- [x] **Health proves mid DeepSeek + evidence tree** — 0.1.9: `lane:mid` ✓ only when DeepSeek is proven (shim or DeepSeek `ANTHROPIC_BASE_URL`; Anthropic hatch is not proof); health JSON `lanes.mid`; `status --json` evidence tree (`spawn` / `execute` / `verify.claim=unverified`); skill health-before-mid + evidence-tree closeout. Mid stays **claude-ds**.
- [x] **Opt-in `--worker opencode`** — 0.1.10: `opencode run --dir` + `--model`; always-approve → `--auto`; `--ask` omits it; never rewrites `~/.config/opencode/opencode.json`. Health ✓ needs `opencode` on PATH (`CURSOR_ROUTE_OPENCODE_BIN`). Mid stays **claude-ds**; easy stays OpenRouter chat. Free Zen may log/train — non-secret prompts.
- [x] **Live Zen free pick** — 0.1.11: `--model free` ranks `GET https://opencode.ai/zen/v1/models` (Ox Alpha first while listed; ~15 min cache; Ox Alpha fallback if fetch fails). Pin with `CURSOR_ROUTE_OPENCODE_MODEL`. Health stays offline (cache/fallback only).
- [x] **Flash-first + vision + live OpenRouter pick** — 0.1.12: `--model flash` stays the cheap Grok-out default; `--model vision` + screenshot auto-pick; easy lane live-picks free OpenRouter text models (`openrouter/free` is fetch-fail fallback only). Health never fetches `/models`. `route-orch` ProgRouter + MoRe one-liners. Hero fixture regenerated to 0.1.12. No npm publish in this slice.
- [x] **Kimi 0.1.13 follow-up** — do not cache OpenRouter fallback; health labels uncached fallback; no Authorization on GET /models; env-invalid model error names the env vars; `\bimage\b` vision trigger.
- [ ] **Hero GIF** — still outstanding; dry-run fixture ships as the substitute for now (`docs/fixtures/hero-demo.log` — see `docs/DEMO_GIF.md`)
- [x] **Do not** paste private `ROUTE_KIT`, SIP, prod paths, or hang-watchdog env into this public repo

## Repo map

| Path | Role |
|------|------|
| `src/cli.ts` | `health` / `start` / `jobs` / `capture` / `send` / `kill` |
| `src/adapters/claude-ds.ts` | Mid worker; DeepSeek URL required; `--model` → `-Model` |
| `src/adapters/deepseek.ts` | Experimental dsh worker (`--worker deepseek`; mid stays claude-ds) |
| `src/adapters/grok.ts` | Hard worker |
| `src/adapters/openrouter.ts` | Easy worker |
| `src/adapters/opencode.ts` | Opt-in OpenCode worker (`--worker opencode`; mid stays claude-ds) |
| `src/zen-free.ts` | Live Zen catalog rank for `--model free` |
| `src/or-free.ts` | Live OpenRouter catalog rank for easy-lane `--model free` |
| `skills/route-orch/SKILL.md` | Cursor skill — spawn CLI, do not implement in-session |
| `CHANGELOG.md` | Release notes |
| `SECURITY.md` | Secret refuse gate |

## Edit log

| Date | Change |
|------|--------|
| 2026-08-12 | Brief created in this repo. Flash/Pro CLI + skill still open. |
| 2026-08-12 | Shipped Flash default + `--model pro`, deepseek slot, skill table → 0.1.6. |
| 2026-08-12 | npm `cursor-route@0.1.6` LIVE; CHANGELOG + README skill-install path fixed. |
| 2026-08-12 | Grok debug → 0.1.7: env DS default, Anthropic hatch, `[1m]` preserve. |
| 2026-08-13 | Hero demo dry-run fixture + docs: `docs/fixtures/generate-hero-demo.sh` → `hero-demo.log`; README Demo, DEMO_GIF.md, demo-notes pointer. Real GIF still open. |
| 2026-08-13 | GPTSOL fixes: scrub inherited env/paths, stable job ids, ignore `docs/briefs/handoffs/`, GIF checkbox wording. |
| 2026-08-14 | DeepSeek Harness eval: `@deepseek-ai/dsh` 0.1.0-rc.6 is a developer-preview plugin kernel, not a mid replacement; `--worker deepseek` stays unhealthy; mid remains claude-ds (docs-only, no version bump). |
| 2026-08-14 | Experimental `--worker deepseek` wired to official dsh (headless + per-job patch + `DSH_PERMISSION_MODE` + key-via-env); `--model` applies to claude-ds + deepseek; mid stays claude-ds → 0.1.8 LIVE. |
| 2026-08-14 | route-orch brief steals (AutoDesign / misevolution / Vero): **Verify / claim closeout** + **Eval & skill hygiene**; handoff Success criteria + Verify + NEVER; both skill copies synced; mid stays claude-ds. Docs-only, no version bump. |
| 2026-08-18 | Health `lane:mid` + `lanes.mid` prove DeepSeek; status evidence tree (`verify.claim` stays unverified); skill health-before-mid + closeout tree; mid stays claude-ds → 0.1.9 LIVE. |
| 2026-08-21 | Opt-in `--worker opencode` (Zen free `opencode/big-pickle`, `--auto`, no config rewrite); mid stays claude-ds → 0.1.10 LIVE. |
| 2026-08-21 | Live Zen free pick (Ox Alpha first while listed; OpenRouter-style catalog rank) → 0.1.11 LIVE. |
| 2026-08-29 | Flash-first docs, `--model vision` + auto-pick, live OpenRouter free pick, route-orch K318/K322, hero fixture 0.1.12. No npm publish. |
| 2026-08-29 | Kimi audit follow-up → 0.1.13: no fallback cache, health labels, unauth GET /models, env error wording. |
