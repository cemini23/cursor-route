# Cursor audit — cursor-route v0.1.0→0.1.1

**Mode:** `code-debug` · **Roles → models:** code-implementation→`gpt-5.6-sol-medium`, adversarial→`cursor-grok-4.5-high-fast`, third-lens→`kimi-k3-max`

Auditors: [Sol](fad461d6-9be9-421e-b42e-081cd7888a56) · [Grok](79e70632-1de7-456e-871b-cdb66b7b72f1) · [Kimi](9a0b224f-eacf-4a2f-969c-6854db1d6876)

## Verdict rollup (pre-fix)

| Model | Verdict |
|-------|---------|
| GPTSOL | FAIL |
| Cursor Grok | FAIL |
| Kimi 3 | WARN |

**Overall (pre-fix):** REWORK — then SHIP-WITH-FIXES after 0.1.1.

## Consensus (≥2 auditors)

1. Headless `kill` did not kill (no PID) — phantom killed
2. `refreshStatus` inferred `completed` from missing tmux — lies on `--no-tmux`
3. Completion hooks hard-coded `bun` vs Node fallback
4. macOS `script` left `cd && …` unquoted
5. Stock `claude` silent fallback for “claude-ds”
6. Secret deny false-positive on prose “API key”; `send` bypass
7. Missing DeepSeek setup docs / mid-lane dead end for public users
8. Skill `/route` collision with federation `/route`

## Unique

- [Sol] Job-id path traversal; dry-run side effects; race before `running` write
- [Grok] Always-approve + skill contract burns private SIP/verify; Grok sandbox missing
- [Kimi] No hero.gif; typecheck red; jobsDir collided with clone path; no CI

## Conflicts

| Topic | Sol | Grok | Kimi | Resolution |
|-------|-----|------|------|------------|
| Overall ship | FAIL | FAIL | WARN | Fix criticals then soft-launch; GIF still deferred |
| Skill name `/route` | — | critical rename | — | Renamed triggers to `/route-orch` |

## Fixes shipped in `20b1580` (v0.1.1)

- PID-tracked headless spawn + polled terminate on `kill`
- No phantom `completed` from session absence; exit via mark-complete / failed unknown
- `markCompleteInvoker` (bun or pinned `tsx@4.19.4`)
- macOS/Linux `script` always via `/bin/sh -c`
- Stock Claude only with `CURSOR_ROUTE_ALLOW_STOCK_CLAUDE=1`
- Material-only secret deny on `start` + `send`
- XDG jobs dir `~/.local/share/cursor-route/jobs`
- README DeepSeek setup; skill deconflict; CI workflow; `--version`; typecheck green

## Verify after fix

- 11/11 tests · `tsc --noEmit` clean
- Headless claude-ds → `CURSOR_ROUTE_SMOKE_OK2` · `exitCode: 0`
- Headless `kill` → `status: killed`
- Prose “API key” dry-run allowed; `sk-…` refused exit 3

## Still open (not tweet-blockers for soft launch)

- Real tmux attach/send GIF (`docs/DEMO_GIF.md`) — needs `brew install tmux` (sudo)
- npm publish
- Grok Build balance for live grok demos
- Optional: grok `--sandbox`, `wait` command, remove skill file duplicate via symlink
