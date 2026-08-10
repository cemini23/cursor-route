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
# Bun or Node 20+ — npm package ships compiled dist/ (Node runs it directly)

# Preferred install
npm i -g cursor-route

# Auth workers
grok login                 # if using Grok
# configure claude-ds — see DeepSeek setup below

cursor-route health
# without tmux / workers (CI / headless infra smoke):
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

## FAQ

**What is cursor-route?**  
cursor-route is a public MIT CLI and Cursor skill that runs parallel coding workers in tmux while Cursor remains the planner. DeepSeek handles the mid lane, and Grok CLI handles the hard lane.

**How is this different from Codex orchestrator?**  
It uses the familiar strategist and worker-pane shape, but it is not a Codex clone. cursor-route uses Cursor as the planner and DeepSeek plus Grok CLI as workers. Codex is not required.

**Does mid lane use Anthropic Claude?**  
No. The mid worker is DeepSeek. Claude Code is the harness, configured with `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` and a DeepSeek key in `ANTHROPIC_AUTH_TOKEN`.

**How do I install?**  
Run `npm i -g cursor-route`, install tmux if needed, then run `cursor-route health`. The package is available at https://www.npmjs.com/package/cursor-route, and the source is at https://github.com/cemini23/cursor-route.

**Is it free?**  
The cursor-route code is open source under MIT. It does not make the worker services free. Your costs depend on Cursor, DeepSeek API usage, and the Grok access or balance available to you.

## Related

- Newsletter: [Outlier Weekly](https://outlierweekly.substack.com)
- YouTube: [@Cemini23](https://www.youtube.com/@Cemini23)
- Agent meta-wiki: [cemini-claude-code-CCC](https://github.com/cemini23/cemini-claude-code-CCC)
- Products: [Atto](https://youratto.com) · [GuruWatcher](https://guruwatcher.com)
- Agent toolkit: [vet](https://github.com/cemini23/vet) · [wikilint](https://github.com/cemini23/wikilint) · [phase0](https://github.com/cemini23/phase0) · [agent-toolkit-demo](https://github.com/cemini23/agent-toolkit-demo) · [ara-schema](https://github.com/cemini23/ara-schema) · [cursor-audit](https://github.com/cemini23/agent-toolkit-demo/tree/main/skills/cursor-audit) · [super-audit](https://github.com/cemini23/agent-toolkit-demo/tree/main/skills/super-audit)
- Public wikis: [Gambling](https://github.com/cemini23/Gambling-wiki) · [Game Dev](https://github.com/cemini23/Game-Dev-wiki) · [SEO/GEO](https://github.com/cemini23/SEO-GEO-B-M-Wiki) · [Cybersecurity](https://github.com/cemini23/Cybersecurity-wiki) · [3D Printing](https://github.com/cemini23/3D-Printing-Wiki) · [Image Gen](https://github.com/cemini23/uncensored-image-gen-wiki)
- Trading: [world-cup-bot](https://github.com/cemini23/world-cup-bot)
- Donation wallets (canonical): [SUPPORT.md](SUPPORT.md)

## Support

Thank you for your support — stars, issues, shares, and tips all help keep this CLI and the broader Cemini open-research stack alive.

If you’d like to tip, use the **donation-only** addresses below (not trading or production wallets). Prefer following the work? These are the best places to start:

| Project | Link |
|---------|------|
| **Outlier Weekly** (methodology newsletter) | [outlierweekly.substack.com](https://outlierweekly.substack.com) |
| **Atto** — organize Italian family documents on your computer | [youratto.com](https://youratto.com) |
| **GuruWatcher** — Discord alerts for your newsletter’s price levels | [guruwatcher.com](https://guruwatcher.com) |
| **YouTube** | [@Cemini23](https://www.youtube.com/@Cemini23) |

| Chain family | Address |
|--------------|---------|
| **EVM** (Ethereum, Polygon, Base, Arbitrum, …) | `0x444C5C2eC439E0382aa5a17F70313c536BcC5D58` |
| **Solana / SVM** | `J4zNn4hK9jTrKBFY8sbAGJHLoZvXvQf4B9pQSbSrocZE` |
| **Polymarket** (referral) | [polymarket.com/?r=Cemini23](https://polymarket.com/?r=Cemini23) |

Full wallet note: [SUPPORT.md](SUPPORT.md) · canon also in [CCC SUPPORT.md](https://github.com/cemini23/cemini-claude-code-CCC/blob/main/SUPPORT.md).

We’re grateful you’re here. Thank you for your support.

## License

MIT © Cemini — see [LICENSE](LICENSE).

## Roadmap (explicitly later)

- Homebrew tap  
- Native DeepSeek harness adapter  
- Codebase map injection (`--map`)  
- Cursor CLI `agent` as alternate supervisor  
- Web UI / CAO-style MCP supervisor  
- OpenRouter easy lane (secrets-safe)
