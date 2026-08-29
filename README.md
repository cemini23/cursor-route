# cursor-route

**Cursor stays the brain. Grok CLI + DeepSeek (claude-ds) + OpenRouter (easy) + OpenCode (opt-in free) are the parallel army.**

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
| **cursor-route** | **Cursor Agent** | **Grok CLI + claude-ds + OpenRouter (easy) + OpenCode (opt-in)** | Cost-aware lanes you already pay for |

If you already live in Cursor, X Premium (Grok CLI), and DeepSeek — stop paying a third coding agent just to parallelize.

## Cost table (orienting)

| Role | Typical bill | cursor-route use |
|------|----------------|------------------|
| Cursor | Premium plan | Plan / synthesize / verify (orchestrator) |
| Grok CLI | X Premium | `--lane hard` implement |
| DeepSeek via claude-ds | DeepSeek API / plan | `--lane mid` implement (**Flash** default; `--model vision` for screenshots; `--model pro` harder mid / hard backup only) |
| OpenRouter free models | OpenRouter API (free tier) | `--lane easy` live free pick at start — non-secret prompts only (see Security) |
| OpenCode (opt-in) | OpenCode Zen free models | `--worker opencode` implement on live Zen free pick (Ox Alpha while listed) |
| Codex / extra Claude | Optional | Not required for v0 |

Exact dollars vary — the point is **reuse subscriptions you already have**.

## Install (60 seconds)

**Prerequisites**

| Dep | Why |
|-----|-----|
| [tmux](https://github.com/tmux/tmux) | Worker panes |
| [Bun](https://bun.sh) *(or Node 20+)* | Runs the CLI |
| [Grok CLI](https://x.ai/cli) and/or Claude Code + DeepSeek (`claude-ds`) | Workers |
| OpenRouter API key (`OPENROUTER_API_KEY`) | Easy lane (`--lane easy` / `--worker openrouter`) |
| [OpenCode](https://opencode.ai) (`opencode` on PATH) | Opt-in `--worker opencode` (free Zen models) |
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
export OPENROUTER_API_KEY=...   # if using the easy lane (see OpenRouter setup below)
# optional: npm i -g opencode-ai && opencode auth login   # --worker opencode

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

After `npm i -g cursor-route`, copy the packaged skill into a project (or user skills):

```bash
PKG="$(npm root -g)/cursor-route"
mkdir -p .cursor/skills
cp -R "$PKG/skills/route-orch" .cursor/skills/
```

From a git clone: `cp -R skills/route-orch .cursor/skills/`.

Then say **`/route-orch`** or **spawn workers** in Cursor — the skill delegates to `cursor-route` (does not replace a private in-house `/route` skill).

Working notes for this repo (edit in place): [docs/briefs/WORKING.md](./docs/briefs/WORKING.md). See [CHANGELOG.md](./CHANGELOG.md) for release notes.

## Commands

| Command | Description |
|---------|-------------|
| `health` | Gate #1 — tmux, runtime, workers; proves `lane:mid` is DeepSeek (`lanes.mid` in `--json`) |
| `start <prompt>` | Spawn worker job (`--worker` / `--lane` / `--model` / `--dir` / `--ask` / `--dry-run` / `--no-tmux`) |
| `jobs [--json]` | List jobs |
| `status <id>` | Job + sessionAlive; `--json` includes evidence tree (`spawn` / `execute` / `verify`) |
| `capture <id> [n]` | Last n pane/log lines |
| `send <id> <msg>` | Mid-task redirect (tmux send-keys) |
| `attach <id>` | Print `tmux attach` hint |
| `kill <id>` | Stop session |
| `sessions` | Managed tmux sessions |
| `clean [--days N]` | Drop old job files |

## Demo

A dry-run capture (no live workers, no secrets) is committed as a reproducible fixture:

```bash
# Needs Bun or Node 20+ and a runnable ./bin/cursor-route (clone: bun install)
docs/fixtures/generate-hero-demo.sh      # regenerate docs/fixtures/hero-demo.log
```

```text
$ cursor-route --version
0.1.13

$ CURSOR_ROUTE_RELAXED=1 cursor-route health
cursor-route v0.1.13
health: OK

$ cursor-route start --lane mid --model flash --dry-run "Add a unit test for shellQuote"
dry-run job a1b2c3d4
worker: claude-ds
model:  flash
command: cd '~/Projects/cursor-route' && '~/.local/bin/claude-ds' -PromptFile '~/.local/share/cursor-route/jobs/a1b2c3d4.prompt' -Model 'deepseek-v4-flash' --dangerously-skip-permissions

$ cursor-route jobs --json
[]
```

Full capture: [docs/fixtures/hero-demo.log](./docs/fixtures/hero-demo.log).
A real hero GIF is still pending — recording steps live in [docs/DEMO_GIF.md](./docs/DEMO_GIF.md).

## Lanes

| Lane | Worker | Intent |
|------|--------|--------|
| `easy` | `openrouter` | Wording / drafts on OpenRouter free models (non-secret prompts only — see Security) |
| `mid` | `claude-ds` | Default implement on DeepSeek (**Flash** by default) |
| `hard` | `grok` | Hard implement on Grok CLI |

Always-approve is **on** by default for **coding worktrees only**. It does not authorize LIVE Discord, trading, or irreversible SaaS. Opt out: `--ask` or `CURSOR_ROUTE_ASK=1`.

### Mid models (Flash vs Pro)

| Flag | Model id | When |
|------|----------|------|
| `--model flash` (default) | `deepseek-v4-flash` | Cheap mid execute. Prefer this when Grok **usage** is out |
| `--model vision` | `deepseek-v4-flash-vision-exp` | Screenshots / ui mocks / image prompts (or auto-pick) |
| `--model pro` | `deepseek-v4-pro` | Harder mid / **hard backup** only — not the default Grok-out stand-in |
| `--model deepseek-v4-pro[1m]` | `deepseek-v4-pro[1m]` | Large-context Pro (SKU preserved) |

```bash
cursor-route start --lane mid "…"                    # Flash
cursor-route start --lane mid --model vision "…"     # Vision Flash
cursor-route start --lane mid --model pro "…"        # Pro (harder mid / hard backup)
# Or set default without a flag:
export CURSOR_ROUTE_DS_MODEL=flash   # also honors ANTHROPIC_MODEL; --model overrides
```

If `--model` and `CURSOR_ROUTE_DS_MODEL` / `ANTHROPIC_MODEL` are unset, a prompt that looks like a screenshot/image/png/jpg/jpeg/webp/ui mock/multimodal/vision auto-picks vision Flash. Explicit `--model flash|pro|vision` always wins.

**Grok auth ≠ usage-out:** if `cursor-route health` shows `worker:grok` ✗, run `grok login` (or set `XAI_API_KEY`). That is auth, not the Pro case. When Grok **usage** is exhausted, stay on `--lane mid --model flash` (cheap default). `--model pro` is harder mid / hard backup only.

`CURSOR_ROUTE_ALLOW_ANTHROPIC=1` is an expensive escape hatch: it does **not** pass DeepSeek `--model` ids (Anthropic would reject them).

## DeepSeek setup (the cheap mid-lane — this is the point)

`cursor-route` mid lane runs **DeepSeek**, not Anthropic. Claude Code is only the terminal harness; bills go to DeepSeek when `ANTHROPIC_BASE_URL` points at them. `cursor-route health` shows `lane:mid` ✓ only when DeepSeek is proven (`claude-ds` / `deepseek-claude` shim, or stock `claude` with DeepSeek `ANTHROPIC_BASE_URL`) — `CURSOR_ROUTE_ALLOW_ANTHROPIC=1` is not proof.

**Recommended (official DeepSeek → Claude Code):**

```bash
npm i -g @anthropic-ai/claude-code

export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
export ANTHROPIC_AUTH_TOKEN=YOUR_DEEPSEEK_API_KEY   # from platform.deepseek.com
# Optional shell defaults (CLI --model overrides ANTHROPIC_MODEL for the job):
export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash
export CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-flash

cursor-route health          # worker:claude-ds should be ✓; `lane:mid` is ✓ only when DeepSeek is proven
cursor-route start --lane mid "…"                 # Flash (default; also when Grok usage is out)
cursor-route start --lane mid --model vision "…"  # screenshots / ui mocks
cursor-route start --lane mid --model pro "…"     # harder mid / hard backup only
```

Persist the same vars under `~/.claude/settings.json` → `"env": { … }` if you want them every shell.

**Also accepted:** `claude-ds` or `deepseek-claude` on PATH (Cemini shims). The adapter passes `-Model deepseek-v4-flash|deepseek-v4-pro`.

**Experimental:** `--worker deepseek` runs the official DeepSeek Harness (`dsh`, npm `@deepseek-ai/dsh`) as an opt-in worker — **mid stays on `claude-ds`**; don't default lanes here.

```bash
npm i -g @deepseek-ai/dsh
export DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY   # from platform.deepseek.com

cursor-route health                              # worker:deepseek should be ✓
cursor-route start --worker deepseek "…"         # Flash (default)
cursor-route start --worker deepseek --model pro "…"   # harder mid / hard backup only
```

The adapter launches `dsh --profile headless` with a **per-job Cordis patch** (`jobs/<id>.dsh-patch.yml`, mode 0600) that pins `--model flash|pro|vision` (`deepseek-v4-pro[1m]` preserved) — it never rewrites `~/.dsh/settings.yaml`, so parallel jobs don't race. Always-approve maps to `DSH_PERMISSION_MODE=danger-full-access`; `--ask` drops to `workspace-write`. Your `DEEPSEEK_API_KEY` travels via env only — never in the launch command or patch. Override the binary with `CURSOR_ROUTE_DSH_BIN`.

**Not the default:** bare `claude` still talking to Anthropic. Health refuses that so a misconfigured install cannot silently burn frontier $ rates. Escape hatch only: `CURSOR_ROUTE_ALLOW_ANTHROPIC=1`.

No DeepSeek yet? Use `--lane hard` / `--worker grok` (X Premium).

## OpenRouter setup (the free easy lane)

`--lane easy` / `--worker openrouter` sends wording/draft prompts to OpenRouter
and **live-picks the best free text model** at request time (`GET /models`, rank
`:free` or $0 text models). Do not hardcode a specific model id as the default.
Pin with `CURSOR_ROUTE_OPENROUTER_MODEL` or `--model provider/model`. Empty /
`free` = live pick. If the catalog fetch fails, the fallback is OpenRouter's
**router** id `openrouter/free` (a live router, not a locked model). Get a key
at [openrouter.ai/keys](https://openrouter.ai/keys).

```bash
export OPENROUTER_API_KEY=sk-or-v1-...        # from openrouter.ai/keys
# optional pin (skips the live catalog pick):
export CURSOR_ROUTE_OPENROUTER_MODEL=qwen/qwen3-coder:free
export OPENROUTER_BASE_URL=https://openrouter.ai/api/v1  # default

cursor-route health          # worker:openrouter should be ✓ (never fetches /models)
cursor-route start --lane easy "Rewrite this FAQ answer in 3 sentences"
cursor-route start --lane easy --model free "…"          # live pick
```

`health` never fetches the OpenRouter catalog (cache or fallback only), same as Zen.

**Non-secret prompts only:** free OpenRouter models may log prompts, so the easy lane is for
**wording/drafts without credentials**. The same refuse gate as every lane blocks
key-shaped material in `start` / `send`, and the runner re-checks the prompt file.

## OpenCode setup (opt-in free coding worker)

`--worker opencode` runs [OpenCode](https://opencode.ai) as a **coding agent** on
live OpenCode Zen free models (`--model free` fetches the catalog and ranks,
same idea as the OpenRouter free picker). Ox Alpha (`opencode/x-preview-f-free`)
wins while it is listed and free. This is **not** a lane default — mid stays
`claude-ds`; easy stays OpenRouter chat (no tools). Use it to burn fewer Grok /
DeepSeek tokens on implement work.

```bash
npm i -g opencode-ai          # or: brew install opencode
opencode auth login           # connect OpenCode Zen (or another provider)
# optional pin (skips the live catalog pick):
export CURSOR_ROUTE_OPENCODE_MODEL=opencode/hy3-free

cursor-route health                              # worker:opencode should be ✓
cursor-route start --worker opencode "…"         # live Zen free pick
cursor-route start --worker opencode --model free "…"
cursor-route start --worker opencode --model opencode/hy3-free "…"
```

The adapter launches `opencode run --dir <cwd> --model <id>` with the prompt via
`cat` (never interpolated). Always-approve maps to `--auto` (explicit `"deny"`
rules still apply); `--ask` omits `--auto`. It never rewrites
`~/.config/opencode/opencode.json`, so parallel jobs don't race. Override the
binary with `CURSOR_ROUTE_OPENCODE_BIN`. `--model free` caches the ranked catalog
for ~15 minutes (`CURSOR_ROUTE_ZEN_CACHE_MINUTES`).

**Non-secret prompts:** several Zen free models may log or train on prompts during
their free period (see [OpenCode Zen](https://opencode.ai/docs/zen/) privacy notes).
The same refuse gate as every lane still applies. `opencode/x-preview-f-free`
(Ox Alpha) is the zero-retention free option if you need it.

## Jobs directory

Jobs default to `~/.local/share/cursor-route/jobs` (override with `CURSOR_ROUTE_JOBS_DIR`).
This is **not** inside a git clone of this repo.

## Safety

- No secrets in prompts (CLI soft-refuses common key patterns)
- See [SECURITY.md](./SECURITY.md)
- Local orchestration only — no LIVE Discord / trading egress demos

## FAQ

**What is cursor-route?**  
cursor-route is a public MIT CLI and Cursor skill that runs parallel coding workers in tmux while Cursor remains the planner. DeepSeek handles the mid lane, Grok CLI handles the hard lane, OpenRouter free models handle the easy lane for wording/drafts, and `--worker opencode` is an opt-in coding agent on OpenCode Zen free models.

**How is this different from Codex orchestrator?**  
It uses the familiar strategist and worker-pane shape, but it is not a Codex clone. cursor-route uses Cursor as the planner and DeepSeek plus Grok CLI as workers. Codex is not required.

**Does mid lane use Anthropic Claude?**  
No. The mid worker is DeepSeek. Claude Code is the harness, configured with `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` and a DeepSeek key in `ANTHROPIC_AUTH_TOKEN`. Default model is Flash (`--model flash`) — keep Flash when Grok **usage** is out. `--model vision` is for screenshots / ui mocks. `--model pro` is harder mid / **hard backup only**, not the default Grok-out stand-in. A missing `grok login` is auth, not the Pro case.

**How do I install?**  
Run `npm i -g cursor-route`, install tmux if needed, then run `cursor-route health`. The package is available at https://www.npmjs.com/package/cursor-route, and the source is at https://github.com/cemini23/cursor-route.

**Is it free?**  
The cursor-route code is open source under MIT. It does not make the worker services free. Your costs depend on Cursor, DeepSeek API usage, and the Grok access or balance available to you. The easy lane live-picks a free OpenRouter text model at start (fallback router `openrouter/free` only if the catalog fetch fails). `--worker opencode` can run live OpenCode Zen free models (`--model free` ranks the catalog).

## Related

- Changelog: [CHANGELOG.md](./CHANGELOG.md)
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
| **X Money** (fiat, US) | Request [@Cemini23](https://x.com/Cemini23) in the X app — scan the Request QR |
| **EVM** (Ethereum, Polygon, Base, Arbitrum, …) | `0x444C5C2eC439E0382aa5a17F70313c536BcC5D58` |
| **Solana / SVM** | `J4zNn4hK9jTrKBFY8sbAGJHLoZvXvQf4B9pQSbSrocZE` |
| **Polymarket** (referral) | [polymarket.com/?r=Cemini23](https://polymarket.com/?r=Cemini23) |
| **Hyperliquid** (referral) | [app.hyperliquid.xyz/join/CEMINI23](https://app.hyperliquid.xyz/join/CEMINI23) |

Full wallet note: [SUPPORT.md](SUPPORT.md) · canon also in [CCC SUPPORT.md](https://github.com/cemini23/cemini-claude-code-CCC/blob/main/SUPPORT.md).

We’re grateful you’re here. Thank you for your support.

## License

MIT © Cemini — see [LICENSE](LICENSE).

## Roadmap (explicitly later)

- Homebrew tap
- Stabilize the DeepSeek harness adapter (experimental `--worker deepseek` since 0.1.8)
- Stabilize the OpenCode adapter (`--worker opencode` since 0.1.10)
- Codebase map injection (`--map`)
- Cursor CLI `agent` as alternate supervisor
- Web UI / CAO-style MCP supervisor
