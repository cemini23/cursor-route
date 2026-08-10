# Hero demo recording (GIF)

tmux is required for the viral attach/send demo. On this laptop brew needs sudo — record after:

```bash
# tmux may live at ~/.local/bin/tmux (already on PATH in this setup); otherwise:
# brew install tmux
command -v tmux
cursor-route health

# Jobs live under the XDG data dir, not a git clone:
# ~/.local/share/cursor-route/jobs  (override: CURSOR_ROUTE_JOBS_DIR)

# Terminal A — three parallel jobs
cursor-route start --lane hard --dir "$PWD" "Add README section Demo"
cursor-route start --lane mid --dir "$PWD" "Add a unit test for shellQuote"
cursor-route start --worker grok --dir "$PWD" "List open TODOs in src/"

# Terminal B — watch
cursor-route jobs --json
# Attach one pane for the GIF: tmux attach -t cursor-route-<id>
```

If you previously exported `$HOME/.cursor-route/bin`, that dir is stale — remove it:
`rm -rf ~/.cursor-route/bin` (the launcher lives in the installed package, not there).

Record with [asciinema](https://asciinema.org/) or CleanShot → export GIF → `docs/fixtures/hero.gif`.

Until then, use `docs/fixtures/claude-ds-smoke.log` as the committed proof fixture.
