# Demo fixture log (no secrets)

> **Current fixture:** [docs/fixtures/hero-demo.log](./fixtures/hero-demo.log) — generated, dry-run, machine-agnostic (regenerate: `docs/fixtures/generate-hero-demo.sh`). Real GIF still pending: [DEMO_GIF.md](./DEMO_GIF.md).

Simulated capture output for README / tweet assets — replace with a real GIF once tmux is available.

```
$ cursor-route --version
0.1.14

$ cursor-route health
cursor-route v0.1.14
health: OK
  ✓ tmux
  ✓ runtime          bun ok
  ✓ script(1)
  ✓ worker:grok
  ✓ worker:claude-ds
  ✓ worker:openrouter
  ✗ worker:deepseek  dsh not found — mid default remains claude-ds
  ✓ lane:mid         DeepSeek proven (claude-ds (DeepSeek shim))
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
Use `--model flash` when Grok **usage** is out (cheap default). `--model pro` is harder mid / hard backup only — not the default Grok-out stand-in. A missing `grok login` is auth, not the Pro case.

Current commands: `health`, `start`, `jobs`, `status`, `capture`, `send`, `attach`, `kill`, `sessions`, `clean`.
Headless demos (no tmux) use `--no-tmux` and `capture`/`status` instead of `attach`/`send`.
