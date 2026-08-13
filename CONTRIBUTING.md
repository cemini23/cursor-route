# Contributing

## Dev

```bash
bun install
bun test
bun run typecheck
./bin/cursor-route health
CURSOR_ROUTE_RELAXED=1 ./bin/cursor-route health   # without tmux
./bin/cursor-route start --dry-run --worker grok "ping"
./bin/cursor-route start --dry-run --lane mid --model flash "ping"
./bin/cursor-route start --dry-run --lane mid --model pro "ping"
```

Keep `skills/route-orch/SKILL.md` and `.cursor/skills/route-orch/SKILL.md` identical when editing the skill.

## Rules

- No secrets in prompts, fixtures, or commits
- Do not vendor private `agent-toolkit` paths
- Prefer adapters over rewriting the job core
- Always-approve defaults stay documented + opt-out (`--ask` / `CURSOR_ROUTE_ASK=1`)
- Mid default is Flash; document Pro only as harder mid / Grok **usage** stand-in (not missing `grok login`)

## Release checklist

1. Update `package.json` version + [CHANGELOG.md](./CHANGELOG.md) + [docs/briefs/WORKING.md](./docs/briefs/WORKING.md)
2. `bun test` && `bun run typecheck` && `bun run build`
3. `cursor-route health` (tmux + ≥1 worker)
4. One real `start` smoke (grok or claude-ds); dry-run both `--model flash` and `--model pro`
5. `npm pack --dry-run` — no secrets, no `node_modules`
6. Commit, tag `v0.x.y`, push
7. `npm publish --access public` with an isolated `--userconfig` Automation token (Bypass 2FA); **revoke** any chat-pasted token after
