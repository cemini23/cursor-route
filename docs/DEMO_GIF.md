# Hero demo recording (GIF)

tmux is required for the viral attach/send demo. On this laptop brew needs sudo — record after:

```bash
brew install tmux
export PATH="$HOME/.cursor-route/bin:$PATH"
cursor-route health

# Terminal A — three parallel jobs
cursor-route start --lane hard --dir "$PWD" "Add README section Demo"
cursor-route start --lane mid --dir "$PWD" "Add a unit test for shellQuote"
cursor-route start --worker grok --dir "$PWD" "List open TODOs in src/"

# Terminal B — watch
cursor-route jobs --json
# Attach one pane for the GIF: tmux attach -t cursor-route-<id>
```

Record with [asciinema](https://asciinema.org/) or CleanShot → export GIF → `docs/fixtures/hero.gif`.

Until then, use `docs/fixtures/claude-ds-smoke.log` as the committed proof fixture.
