# Cursor audit — cursor-route v0.1.0→0.1.1

**Mode:** `code-debug` · **Roles → models:** code-implementation→`gpt-5.6-sol-medium`, adversarial→`cursor-grok-4.5-high-fast`, third-lens→`kimi-k3-max`

Auditors: [Sol](fad461d6-9be9-421e-b42e-081cd7888a56) · [Grok](79e70632-1de7-456e-871b-cdb66b7b72f1) · [Kimi](9a0b224f-eacf-4a2f-969c-6854db1d6876)

## Consensus (≥2 auditors agree)

| Finding | Fix shipped in `20b1580` |
|---------|--------------------------|
| Phantom `completed` when tmux/session absent | `refreshStatus` never invents success; headless uses PID |
| Headless `kill` ineffective | Store PID + process-group terminate with poll |
| macOS `script` breaks `cd && …` | Always `sh -c` under script on Darwin/Linux |
| Completion hooks hardcode `bun` | `markCompleteInvoker()` → bun or pinned `tsx@4.19.4` |
| Stock `claude` silent fallback | Hard-fail unless `CURSOR_ROUTE_ALLOW_STOCK_CLAUDE=1` |
| Secret deny false-positives / send bypass | Material-only regex; applied to `start` + `send` |
| Jobs in clone dir | Default `~/.local/share/cursor-route/jobs` |
| Skill steals federation `/route` | Triggers → `/route-orch` / spawn workers |
| Missing DeepSeek README setup | Added setup section + honesty |

## Unique (single auditor — still investigated)

- [Sol] Job ID path traversal → `assertJobId` + path resolve check
- [Sol] Fast-worker race before `running` write → persist `running` before launch
- [Grok] Grok `--sandbox` default → deferred (document; break-glass later)
- [Kimi] No hero.gif yet → still open (`docs/DEMO_GIF.md`); headless fixture exists
- [Kimi] `bun run typecheck` red → fixed with `@types/bun`
- [Kimi] No CI → `.github/workflows/ci.yml` added

## Conflicts

| Topic | Sol | Grok | Kimi | Resolution |
|-------|-----|------|------|------------|
| Overall verdict | FAIL | FAIL | WARN | **SHIP-WITH-FIXES** after `20b1580`; GIF/tmux still open |
| Skill `/route` collision | — | critical | — | Renamed triggers; document non-overlap |

## Recommended fix order (done)

1. Status integrity + PID kill
2. macOS script wrap + runtime invoker
3. claude-ds hard-fail + secrets
4. Docs/skill/CI/XDG jobs

## Remaining before viral tweet

1. `brew install tmux` (needs sudo once) → real attach/send GIF
2. Top up Grok Build balance for hard-lane demos
3. `npm publish` after tag (optional)

## Verdict rollup

| Model | Verdict |
|-------|---------|
| GPTSOL | FAIL (pre-fix) |
| Cursor Grok | FAIL (pre-fix) |
| Kimi 3 | WARN (pre-fix) |

**Overall:** SHIP-WITH-FIXES — critical consensus addressed in v0.1.1 (`20b1580`). Re-audit after first real tmux demo recording.
