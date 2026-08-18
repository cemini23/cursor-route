---
name: route-orch
description: >-
  Delegate coding work from Cursor to parallel Grok CLI / claude-ds (DeepSeek) /
  OpenRouter (easy lane) workers via cursor-route. Use when the user says
  /route-orch, spawn workers, parallel agents with cursor-route, or explicitly
  asks to outsource implementation to Grok/DeepSeek panes — not for private
  Cemini /route.
---

# route-orch (cursor-route)

You are the **orchestrator**. Do **not** implement bulk code in this Cursor session when delegation fits.

## When to activate

- User says `/route-orch`, `spawn workers`, or asks for parallel Grok/DeepSeek via **cursor-route**
- Mid/hard implementation that should run on a subscription worker (Grok CLI / claude-ds)
- Multi-file investigation that benefits from parallel panes

**Do not steal federation `/route`.** Private Cemini `/route` (route-task → verify → Grok/claude-ds chain) is a different skill. This public skill only drives the `cursor-route` CLI.

## Lanes (public core)

| Lane | Worker | Use when |
|------|--------|----------|
| `easy` | `openrouter` (OpenRouter free models) | Wording / drafts — non-secret prompts only |
| `mid` | `claude-ds` (DeepSeek via Claude Code harness) | Standard implement / refactor |
| `hard` | `grok` | Premium plan in Cursor → Grok implement |

Free OpenRouter models may log prompts — keep secrets off the easy lane (the CLI refuse gate still applies).

## claude-ds models

One harness. Do not install a second coding loop.

| Flag / role | Model | When |
|-------------|-------|------|
| default mid (`--model flash`) | `deepseek-v4-flash` | `--lane mid` cheap execute |
| Grok stand-in (`--model pro`) | `deepseek-v4-pro` | Grok CLI **usage/quota** out (not a missing `grok login`) |

```bash
cursor-route start --lane mid --dir "$PWD" "…"
cursor-route start --lane mid --model pro --dir "$PWD" "…"
```

If `worker:grok` is ✗ on health, that is usually **auth** (`grok login` / `XAI_API_KEY`) — not the Pro stand-in case.

## Experimental: --worker deepseek (dsh)

Official DeepSeek Harness headless as an opt-in worker — **not the mid default** (mid stays `claude-ds`).

```bash
npm i -g @deepseek-ai/dsh
export DEEPSEEK_API_KEY=...        # platform.deepseek.com
cursor-route start --worker deepseek --dir "$PWD" "…"
cursor-route start --worker deepseek --model pro --dir "$PWD" "…"   # --model applies here too
```

Health ✓ needs `dsh` on PATH and `DEEPSEEK_API_KEY` set. The adapter pins `--model` via a per-job `--patch` (never touches `~/.dsh/settings.yaml`); always-approve → `DSH_PERMISSION_MODE=danger-full-access`, `--ask` → `workspace-write`. The key never enters the command or patch.

## Workflow

1. Run `cursor-route health` (or `CURSOR_ROUTE_RELAXED=1` for headless). If the **target worker** is unhealthy, fix before spawning. If targeting **mid**, require `lane:mid` ✓ (or health JSON `lanes.mid.deepseek`) before spawn — `CURSOR_ROUTE_ALLOW_ANTHROPIC=1` is not DeepSeek proof.
2. Write a clear handoff prompt with **Success criteria** + **Verify** + **NEVER** (no secrets, no LIVE Discord).
3. Spawn:

```bash
cursor-route start --lane hard --dir "$PWD" "$(cat <<'EOF'
## Task
...

## Success criteria
- [ ] ...

## Verify
- [ ] ...

## NEVER
- ...
EOF
)"
```

Or `--worker grok` / `--worker claude-ds` / `--worker deepseek` (experimental) / `--worker openrouter` (or `--lane easy`). Use `--no-tmux` only when tmux is unavailable.

4. Monitor: `cursor-route jobs --json` · `cursor-route capture <id>` · `cursor-route send <id> "…"` (tmux only).
5. Summarize worker results with **verify evidence** — no status-only “done” (see Verify / claim closeout). If verify fails, reconsider the plan/definition (not only retry) — `send` a correction or spawn a follow-up; do not invent success.

## Verify / claim closeout

Verify criteria are an **external eval contract** (AutoDesign pattern), fixed by the parent — not a checklist the worker may rewrite:

- Workers must **not rewrite Success criteria / Verify** to claim done
- Parent closeout is an **evidence tree**: report **spawn** (job id, worker, lane, model) + **execute** (status, exit) + **verify** (`capture` excerpt / exit). A single “done” scalar is not enough.
- Parent closes a job only on **capture / exit evidence** (`cursor-route capture <id>`, job exit status)
- `cursor-route status --json` `.evidence.verify.claim` stays `"unverified"` until the parent reads capture
- **activity ≠ verification** — busy panes, many tool calls, or long transcripts do not make a claim true

## Eval & skill hygiene

- **External eval contract (AutoDesign):** do not rewrite Verify / Success criteria mid-run to make a failing job look green — capture + exit status are the contract (see Verify / claim closeout).
- **Skill misevolution:** do not auto-edit `route-orch` or promote skill variants from worker trajectories without operator HITL — write-time approval ≠ safe retrieval later.
- **On verify fail:** prefer reconsidering the plan/definition (wrong approach) over grinding the same tactic; attribute failure to stage when possible (spawn vs execute vs verify).

## Always-approve

Defaults on for workers. Opt out: `cursor-route start … --ask` or `CURSOR_ROUTE_ASK=1`. Always-approve is for **coding worktrees only** — it does not authorize LIVE Discord, trading, or irreversible SaaS.

## Anti-patterns

- Do not paste API keys / private keys into prompts or `send`
- Do not claim the official DeepSeek harness (`@deepseek-ai/dsh`) is the mid default — `--worker deepseek` is an opt-in experiment (cheap to abandon), not a product fork; mid stays **claude-ds**
- Do not fork a second mid harness
- Do not open-source or dump private cemini `agent-toolkit` paths into public handoffs
- Do not mark done without reading `capture` / exit status
- When editing this skill itself, treat changes as **skill-evolution** — do not auto-promote harmful instructions; prefer **HITL** (no unattended promote from worker trajectories)
