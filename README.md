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
# Prerequisites
brew install tmux          # or build tmux into ~/.local
# Bun optional — Node 20+ works via pinned tsx

# Preferred install
npm i -g cursor-route

# Auth workers
grok login                 # if using Grok
# configure claude-ds — see DeepSeek setup below

cursor-route health
# without tmux (CI / headless):
CURSOR_ROUTE_RELAXED=1 cursor-route health
```

**From source (dev):**

```bash
git clone https://github.com/cemini23/cursor-route.git
cd cursor-route && bun install
./bin/cursor-route health
```

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

## DeepSeek setup (the cheap mid-lane — this is the point)

`cursor-route` mid lane runs **DeepSeek**, not Anthropic. Claude Code is only the terminal harness; bills go to DeepSeek when `ANTHROPIC_BASE_URL` points at them.

**Recommended (official DeepSeek → Claude Code):**

```bash
npm i -g @anthropic-ai/claude-code

export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
export ANTHROPIC_AUTH_TOKEN=YOUR_DEEPSEEK_API_KEY   # from platform.deepseek.com
export ANTHROPIC_MODEL=deepseek-v4-pro[1m]
export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash
export CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-flash

cursor-route health          # worker:claude-ds should be ✓
cursor-route start --lane mid "…"
```

Persist the same vars under `~/.claude/settings.json` → `"env": { … }` if you want them every shell.

**Also accepted:** `claude-ds` or `deepseek-claude` on PATH (Cemini shims).

**Not the default:** bare `claude` still talking to Anthropic. Health refuses that so a misconfigured install cannot silently burn frontier $ rates. Escape hatch only: `CURSOR_ROUTE_ALLOW_ANTHROPIC=1`.

No DeepSeek yet? Use `--lane hard` / `--worker grok` (X Premium).

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
