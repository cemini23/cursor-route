---
name: route-orch
description: >-
  Delegate coding work from Cursor to parallel Grok CLI / claude-ds (DeepSeek)
  workers via cursor-route. Use when the user says /route, route this, spawn
  workers, parallel agents, or asks to outsource implementation instead of
  coding in the parent Cursor session.
---

# route-orch (cursor-route)

You are the **orchestrator**. Do **not** implement bulk code in this Cursor session when delegation fits.

## When to activate

- User says `/route`, `route this`, `spawn workers`, or asks for parallel Grok/DeepSeek work
- Mid/hard implementation that should run on a subscription worker (Grok CLI / claude-ds)
- Multi-file investigation that benefits from parallel panes

## Lanes (public core)

| Lane | Worker | Use when |
|------|--------|----------|
| `mid` | `claude-ds` (DeepSeek via Claude Code harness) | Standard implement / refactor |
| `hard` | `grok` | Premium plan in Cursor → Grok implement |

Easy/OpenRouter is **not** in v0 — keep secrets off free models.

## Workflow

1. Run `cursor-route health`. If unhealthy, fix ✗ items with the user before spawning.
2. Write a clear handoff prompt (no secrets, no LIVE Discord, verify criteria included).
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

Or `--worker grok` / `--worker claude-ds`.

4. Monitor: `cursor-route jobs --json` · `cursor-route capture <id>` · `cursor-route send <id> "…"`.
5. Summarize worker results with **verify evidence** — no status-only “done”.

## Always-approve

Defaults on for workers (`--always-approve` / `--dangerously-skip-permissions`).
Opt out: `cursor-route start … --ask` or `CURSOR_ROUTE_ASK=1`.

## Anti-patterns

- Do not paste API keys / private keys into prompts
- Do not claim DeepSeek-native harness until that adapter ships — today is **claude-ds**
- Do not open-source or dump private Cemini `agent-toolkit` paths into public handoffs
