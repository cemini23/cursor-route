---
name: route-orch
description: >-
  Delegate coding work from Cursor to parallel Grok CLI / claude-ds (DeepSeek)
  workers via cursor-route. Use when the user says /route-orch, spawn workers,
  parallel agents with cursor-route, or explicitly asks to outsource
  implementation to Grok/DeepSeek panes — not for private Cemini /route.
---

# route-orch (cursor-route)

You are the **orchestrator**. Do **not** implement bulk code in this Cursor session when delegation fits.

## When to activate

- User says `/route-orch`, `spawn workers`, or asks for parallel Grok/DeepSeek via **cursor-route**
- Mid/hard implementation that should run on a subscription worker (Grok CLI / claude-ds)
- Multi-file investigation that benefits from parallel panes

**Do not steal federation `/route`.** Private Cemini `/route` (route-task → SIP → verify → Grok/claude-ds chain) is a different skill. This public skill only drives the `cursor-route` CLI.

## Lanes (public core)

| Lane | Worker | Use when |
|------|--------|----------|
| `mid` | `claude-ds` (DeepSeek via Claude Code harness) | Standard implement / refactor |
| `hard` | `grok` | Premium plan in Cursor → Grok implement |

Easy/OpenRouter is **not** in v0 — keep secrets off free models.

## Workflow

1. Run `cursor-route health` (or `CURSOR_ROUTE_RELAXED=1` for headless). If the **target worker** is unhealthy, fix before spawning.
2. Write a clear handoff prompt with **verify criteria** (no secrets, no LIVE Discord).
3. Spawn:

```bash
cursor-route start --lane hard --dir "$PWD" "$(cat <<'EOF'
## Task
...

## Verify
- [ ] ...
EOF
)"
```

Or `--worker grok` / `--worker claude-ds`. Use `--no-tmux` only when tmux is unavailable.

4. Monitor: `cursor-route jobs --json` · `cursor-route capture <id>` · `cursor-route send <id> "…"` (tmux only).
5. Summarize worker results with **verify evidence** — no status-only “done”. If verify fails, `send` a correction or spawn a follow-up — do not invent success.

## Always-approve

Defaults on for workers. Opt out: `cursor-route start … --ask` or `CURSOR_ROUTE_ASK=1`.

## Anti-patterns

- Do not paste API keys / private keys into prompts or `send`
- Do not claim DeepSeek-native harness until that adapter ships — today is **claude-ds**
- Do not open-source or dump private Cemini `agent-toolkit` paths into public handoffs
- Do not mark done without reading `capture` / exit status
