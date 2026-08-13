---
title: cursor-route workspace — working brief (edit in place)
repo: ~/Projects/cursor-route
npm: cursor-route@0.1.7 (LIVE on npm latest)
created: 2026-08-12
updated: 2026-08-13
---

# cursor-route — living brief

**Edit this file.** It is the working notes for this public repo (CLI + `route-orch` skill + adapters). Not the private Cemini `/route` skill (`agent-toolkit` / federation).

When a chunk is accepted: apply it to `src/`, `README.md`, and/or `skills/route-orch/SKILL.md` (keep `.cursor/skills/route-orch/SKILL.md` in sync). Then tick **Open** and add an **Edit log** line.

## What this repo is

Cursor Agent plans. Workers run in tmux via `cursor-route`:

| Lane | Worker | Intent |
|------|--------|--------|
| `easy` | OpenRouter free | Wording / drafts — non-secret prompts only |
| `mid` | claude-ds (DeepSeek behind Claude Code) | Default implement (**Flash**; `--model pro` when needed) |
| `hard` | Grok CLI | Hard implement |

Always-approve on (`--ask` / `CURSOR_ROUTE_ASK=1` to opt out). Jobs live in `~/.local/share/cursor-route/jobs`, not in this clone.

Install: `npm i -g cursor-route` → **0.1.7**. Release notes: [CHANGELOG.md](../../CHANGELOG.md).

## Open (edit / check off)

- [x] **Flash vs Pro on the CLI** — public default **Flash**; `--model pro` → `deepseek-v4-pro` (LIVE 0.1.6+)
  - [x] pass `claude-ds -Model deepseek-v4-flash|deepseek-v4-pro` from the adapter
  - [x] add `--model flash|pro` on `start`
  - [x] document Grok **auth** ≠ usage-out (`grok login`) vs quota → Pro stand-in
- [x] **Skill `route-orch`** — Flash/Pro table in `skills/` + `.cursor/skills/`
- [x] **Official DeepSeek Harness** — `deepseek` adapter slot present; mid stays on claude-ds
- [x] **0.1.7 debug fixes** — env default wired through `startJob`; Anthropic hatch omits DS ids; preserve `[1m]`
- [ ] **Hero GIF** — still outstanding; dry-run fixture ships as the substitute for now (`docs/fixtures/hero-demo.log` — see `docs/DEMO_GIF.md`)
- [x] **Do not** paste private `ROUTE_KIT`, SIP, prod paths, or hang-watchdog env into this public repo

## Repo map

| Path | Role |
|------|------|
| `src/cli.ts` | `health` / `start` / `jobs` / `capture` / `send` / `kill` |
| `src/adapters/claude-ds.ts` | Mid worker; DeepSeek URL required; `--model` → `-Model` |
| `src/adapters/deepseek.ts` | Reserved unreleased harness slot |
| `src/adapters/grok.ts` | Hard worker |
| `src/adapters/openrouter.ts` | Easy worker |
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
