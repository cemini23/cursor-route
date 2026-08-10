# cursor-route

**Cursor stays the brain. Grok CLI + DeepSeek (claude-ds) are the parallel army.**

Lane-aware `/route` orchestration in tmux — not another multi-provider fleet, not a Codex clone.

```bash
cursor-route health
cursor-route start --lane hard "Refactor auth module; run tests; report verify evidence"
cursor-route jobs --json
cursor-route capture <jobId>
```

## Why this exists

| Product | Brain | Workers | Feel |
|---------|-------|---------|------|
| [codex-orchestrator](https://github.com/kingbootoshi/codex-orchestrator) | Claude Code | Codex | Viral tmux panes |
| [CAO](https://github.com/awslabs/cli-agent-orchestrator) | Supervisor CLI | Many (incl. Cursor CLI) | Enterprise MCP + Web UI |
| **cursor-route** | **Cursor Agent** | **Grok CLI + claude-ds** | Cost-aware lanes you already pay for |

If you already live in Cursor, X Premium (Grok CLI), and DeepSeek — stop paying a third coding agent just to parallelize.

## Cost table (orienting)

| Role | Typical bill | cursor-route use |
|------|----------------|------------------|
| Cursor | Premium plan | Plan / synthesize / verify (orchestrator) |
| Grok CLI | X Premium | `--lane hard` implement |
| DeepSeek via claude-ds | DeepSeek API / plan | `--lane mid` implement |
| Codex / extra Claude | Optional | Not required for v0 |

Exact dollars vary — the point is **reuse subscriptions you already have**.

## Install (60 seconds)

**Prerequisites**

| Dep | Why |
|-----|-----|
| [tmux](https://github.com/tmux/tmux) | Worker panes |
| [Bun](https://bun.sh) *(or Node 20+)* | Runs the CLI |
| [Grok CLI](https://x.ai/cli) and/or Claude Code + DeepSeek (`claude-ds`) | Workers |
| `script(1)` | Job logs (macOS/Linux) |

```bash
# macOS
brew install tmux
curl -fsSL https://bun.sh/install | bash   # or use Node 20+

# Install cursor-route (git — npm publish follows once tagged)
git clone https://github.com/cemini23/cursor-route.git ~/.cursor-route-src
cd ~/.cursor-route-src && bun install
mkdir -p ~/.local/bin
ln -sf ~/.cursor-route-src/bin/cursor-route ~/.local/bin/cursor-route
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
# Auth workers
grok login          # if using Grok
# configure claude-ds — see DeepSeek setup below

cursor-route health
# without tmux (CI / headless):
CURSOR_ROUTE_RELAXED=1 cursor-route health
```

Prefer **git clone** until npm is published. Bun’s own installer is optional if you already have Node.

> **Note:** `npm i -g cursor-route` will be the preferred channel after the first tagged publish. Until then use the clone path above.

### Cursor skill

Copy the skill into your project or user skills:

```bash
mkdir -p .cursor/skills
cp -R ~/.cursor-route-src/skills/route-orch .cursor/skills/
```

Then say **`/route-orch`** or **spawn workers** in Cursor — the skill delegates to `cursor-route` (does not replace private Cemini `/route`).

## Commands

| Command | Description |
|---------|-------------|
| `health` | Gate #1 — tmux, runtime, workers |
| `start <prompt>` | Spawn worker job (`--worker` / `--lane` / `--dir` / `--ask` / `--dry-run` / `--no-tmux`) |
| `jobs [--json]` | List jobs |
| `status <id>` | Job + sessionAlive |
| `capture <id> [n]` | Last n pane/log lines |
| `send <id> <msg>` | Mid-task redirect (tmux send-keys) |
| `attach <id>` | Print `tmux attach` hint |
| `kill <id>` | Stop session |
| `sessions` | Managed tmux sessions |
| `clean [--days N]` | Drop old job files |

## Lanes

| Lane | Worker | Intent |
|------|--------|--------|
| `mid` | `claude-ds` | Default implement on DeepSeek |
| `hard` | `grok` | Hard implement on Grok CLI |

Always-approve is **on** by default. Opt out: `--ask` or `CURSOR_ROUTE_ASK=1`.

## DeepSeek setup

v0 mid-lane worker is **claude-ds** (DeepSeek behind a Claude Code harness) — not a native DeepSeek CLI yet.

**Option A — Cemini / public shim on PATH**

```bash
# Prefer these binaries (health looks for them in order):
command -v claude-ds || command -v deepseek-claude
```

**Option B — stock Claude pointed at DeepSeek (explicit opt-in)**

```bash
# Configure Claude Code for your DeepSeek endpoint/model per DeepSeek docs,
# then allow the fallback:
export CURSOR_ROUTE_ALLOW_STOCK_CLAUDE=1
cursor-route health
cursor-route start --lane mid "…"
```

Without A or B, use `--lane hard` / `--worker grok` only.

## Jobs directory

Jobs default to `~/.local/share/cursor-route/jobs` (override with `CURSOR_ROUTE_JOBS_DIR`).
This is **not** inside a git clone of this repo.

## Safety

- No secrets in prompts (CLI soft-refuses common key patterns)
- See [SECURITY.md](./SECURITY.md)
- Local orchestration only — no LIVE Discord / trading egress demos

## Also from Cemini

- [Atto](https://youratto.com) — genealogy / archival agents  
- [GuruWatcher](https://guruwatcher.com) — alert workflows  
- Cemini research & trading tooling (private)

## License

MIT © Cemini

## Roadmap (explicitly later)

- npm publish + Homebrew tap  
- Native DeepSeek harness adapter  
- Codebase map injection (`--map`)  
- Cursor CLI `agent` as alternate supervisor  
- Web UI / CAO-style MCP supervisor  
- OpenRouter easy lane (secrets-safe)
