# Demo fixture log (no secrets)

Simulated capture output for README / tweet assets — replace with a real GIF once tmux is available.

```
$ cursor-route --version
0.1.6

$ cursor-route health
cursor-route v0.1.6
health: OK
  ✓ tmux
  ✓ runtime          bun ok
  ✓ script(1)
  ✓ worker:grok
  ✓ worker:claude-ds
  ✓ worker:openrouter
  ✗ worker:deepseek  unreleased — mid lane uses claude-ds
  ✓ jobs_dir         ~/.local/share/cursor-route/jobs

$ cursor-route start --lane mid "Add a failing test then make it pass"
started a1b2c3d4 (claude-ds/flash)
session: cursor-route-a1b2c3d4
attach:  tmux attach -t cursor-route-a1b2c3d4

$ cursor-route jobs --json
[{ "id": "a1b2c3d4", "status": "running", "worker": "claude-ds", "model": "flash", ... }]
```

Verified locally (2026-08-10): headless `claude-ds` smoke returned `CURSOR_ROUTE_SMOKE_OK`.
Grok smoke hit 402 (Build usage balance exhausted) — auth/PATH wiring works; top up Grok Build for live demos.
Use `--model pro` when Grok **usage** is out (not the same as a missing `grok login`).

Current commands: `health`, `start`, `jobs`, `status`, `capture`, `send`, `attach`, `kill`, `sessions`, `clean`.
Headless demos (no tmux) use `--no-tmux` and `capture`/`status` instead of `attach`/`send`.
