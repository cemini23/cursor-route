# cursor-route — Cursor / agent schema

Public MIT CLI: Cursor plans; tmux workers run Grok CLI, claude-ds (DeepSeek Flash), OpenRouter easy, optional OpenCode. Open this folder as the Cursor project root.

**This is not federation `/route`.** Private Cemini `/route` lives in `~/Projects/agent-toolkit` (`route-task`). Do not replace that worker. The skill in this repo is **`/route-orch`** (`.cursor/skills/route-orch/`).

Start with `README.md`, `CHANGELOG.md`, `SECURITY.md`.

## Hard gates

- Do not swap federation `/route` or PATH `claude-ds`.
- No secrets on the OpenRouter easy lane. The refuse gate still applies.
- Always-approve is for coding worktrees only. It is not LIVE Discord or trading.
- Never `curl | sh`. Never rewrite `~/.config/opencode/opencode.json`.
- Keep this public repo free of private Cemini paths, Discord webhooks, and vault/PII.

## How to work

| Goal | Do this |
|------|---------|
| Orient | `README.md` + `docs/briefs/WORKING.md` |
| Health | `./bin/cursor-route health` (or `CURSOR_ROUTE_RELAXED=1` in CI) |
| Skill | `/route-orch` or “spawn workers” — delegates to `cursor-route` |
| Tests | `bun test` / see `package.json` |
| Private /route | Open `~/Projects/agent-toolkit` or any federation workspace |

## Writing style (ASD-STE100)

Write chat replies, explanations, summaries, commit messages, and PR descriptions in **ASD-STE100 Simplified Technical English** (adapted — not certified STE):

- Use short, direct sentences (~20 words for instructions, ~25 for descriptions).
- Use one plain word per concept; do not use synonyms or jargon.
- Use one instruction per sentence; use imperative mood for steps.
- Use active voice and simple tenses (present, past, future).
- Keep articles (the, a, an). Do not drop words to save space.
- Use one term for one thing every time.

**Do not rewrite:** source code, identifiers, file paths, CLI output, direct quotes, or literal error messages.

Wiki canon: `@osint-wiki/concepts/asd-ste100-writing-style.md`. Optional global copy: `~/.claude/CLAUDE.md`.
