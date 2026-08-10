# Contributing

## Dev

```bash
bun install
bun test
./bin/cursor-route health
CURSOR_ROUTE_RELAXED=1 ./bin/cursor-route health   # without tmux
./bin/cursor-route start --dry-run --worker grok "ping"
```

## Rules

- No secrets in prompts, fixtures, or commits
- Do not vendor private `agent-toolkit` paths
- Prefer adapters over rewriting the job core
- Always-approve defaults stay documented + opt-out (`--ask` / `CURSOR_ROUTE_ASK=1`)

## Release checklist

1. `bun test`
2. `cursor-route health` (tmux + ≥1 worker)
3. One real `start` smoke (grok or claude-ds)
4. `npm pack --dry-run` — no secrets, no `node_modules`
5. Tag `v0.x.y` then `npm publish --access public` (maintainers)
