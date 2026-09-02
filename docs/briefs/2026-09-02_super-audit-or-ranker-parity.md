---
title: Super-audit follow-up — OpenRouter ranker parity (0.1.14)
type: brief
repo: ~/Projects/cursor-route
created: 2026-09-02
updated: 2026-09-02
---

## Target

**cursor-route workspace** → npm `cursor-route@0.1.14`.  
Sibling: private **agent-toolkit** already shipped the ranker fix (`select-openrouter-free-model.ps1`). **Do not** change federation `/route` or PATH `claude-ds`.

## Summary

Super-audit Phase B + optional-next (OSINT/CCC) **does not require** cursor-route changes for wire-ledger, adopt retirement, or Dual-ID purge. **One publish-worthy gap remains:** public easy-lane OpenRouter pick still treats Nemotron 550B like Qwen/GLM/Kimi (`orFreeBoost` flat 20). Private `/route` now tier-ranks (Qwen 100, GLM/Kimi 95, Nemotron 15). Port that logic → **0.1.14**, tests, npm publish.

**Out of scope here:** agent-toolkit mid-lane SDR exit 3 when Flash gets a verify-only task without a filled `## Plan` (separate toolkit brief if you want).

## Body

### What already shipped (no cursor-route action)

| Surface | Change | Repo |
|---------|--------|------|
| Wire ledger + `--run-verify` | 8 WIRE rows, verify PASS | OSINT |
| `adopt.sh` + `adopt-waves/` | 97 wrappers retired | OSINT |
| Dual-ID inline purge | CCC phase1 + k300-k309 rules | CCC |
| Federation invariants | ≤40-line alwaysApply | `~/.cursor/rules/` |
| OpenRouter easy ranker | Qwen/GLM/Kimi > Nemotron | **agent-toolkit** |

Policy unchanged: **cursor-route = public tmux CLI + `route-orch` skill**. Federation `/route` = **agent-toolkit** `route-task.ps1`. Never swap workers.

### Required work (this repo)

#### 1. Tiered rank in `src/or-free.ts`

Replace flat `orFreeBoost()` (20 vs 10) with tier scores aligned to agent-toolkit:

| Pattern | Tier |
|---------|------|
| `qwen` | 100 |
| `z-ai/glm`, `glm` | 95 |
| `kimi`, `moonshot` | 95 |
| `deepseek`, `hy-` | 90 |
| `coder`, `instruct`, `chat`, `llama`, `gemma`, `gpt-oss`, `minimax` | 70 |
| `nemotron` | **15** |
| default | 40 |

Sort key: `tier + min(context_length, 131072)/131072 * 5` (same cap as toolkit — huge Nemotron ctx must not beat Qwen).

Reference implementation: agent-toolkit `select-openrouter-free-model.ps1` (`Get-OrFreeTierScore`). Do not vendor that script here.

Keep existing behavior:
- No Authorization on GET `/models` (public catalog).
- Do **not** cache `openrouter/free` fallback.
- `CURSOR_ROUTE_OPENROUTER_MODEL` pin still wins.
- Health stays offline-safe (no network in health).

#### 2. Tests — `src/or-free.test.ts`

Add catalog fixture with both:

- `nvidia/nemotron-3-550b:free` (large context)
- `z-ai/glm-5.2:free` or `qwen/qwen3-coder:free`

Assert ranked winner is **not** Nemotron when both are free text models.

Update any tests that assumed flat boost 20 for nemotron.

#### 3. Docs + skill sync

- `CHANGELOG.md` — 0.1.14 entry (ranker parity; no lane/worker change).
- `README.md` — one line under easy lane: prefers Qwen/GLM/Kimi coding free models over huge general free models.
- `docs/briefs/WORKING.md` — tick new checkbox; edit log line; bump npm line to 0.1.14 after publish.
- Sync `skills/route-orch/SKILL.md` ↔ `.cursor/skills/route-orch/SKILL.md` if easy-lane table mentions model pick.

Optional (docs-only, no version semantics): one sentence in README that Cemini operators use **FILE · KEEP · WIRE** on the wiki — do **not** paste federation wire-ledger paths or private SIP into this public repo.

#### 4. Publish

```bash
bun test && bun run typecheck && bun run build
# bump package.json 0.1.14
npm publish
git tag v0.1.14 && git push && git push --tags
```

Verify post-publish:

```bash
npm i -g cursor-route@0.1.14
cursor-route health
# easy lane dry-run with offline catalog inject if needed:
CURSOR_ROUTE_OR_CATALOG_JSON='{"data":[...]}' cursor-route start --lane easy --dry-run "hello"
```

### Not required in cursor-route

- `wire_ledger_check.py`, `adopt.sh`, harness_verb migration — OSINT only.
- `cemini-invariants.mdc`, Dual-ID purge — CCC / global rules only.
- Hero GIF — still open in WORKING.md; not a blocker for 0.1.14.
- Replacing or forking federation `/route` skill.

### Sibling follow-up (agent-toolkit — optional)

If you want mid-lane verify tasks to stop SDR exit 3 when Grok is out:

- Detect verify-only prompts (run commands, report PASS/FAIL) and skip Flash **plan** mode → execute directly or pre-fill handoff `## Plan` with command list.
- Handoff: toolkit SIP/handoff pattern; HITL before toolkit PR. Do not paste private handoff paths here.

### CCC wiki bump (after publish)

Add one line to CCC `wiki/entities/skills/route.md` backlog table:

- **OSINT super-audit 2026-09-02** — cursor-route 0.1.14 OpenRouter tier rank parity with agent-toolkit; `/route` worker unchanged.

## Verify

| # | Check | Pass |
|---|-------|------|
| 1 | `bun test` green including Nemotron-vs-GLM rank test | |
| 2 | `bun run typecheck && bun run build` | |
| 3 | Offline health still OK; no locked third-party id in health detail | |
| 4 | npm `0.1.14` live; `cursor-route --version` | |
| 5 | Mid lane still **claude-ds**; no `/route` worker swap | |

## NEVER

- No private `ROUTE_KIT`, prod paths, SIP templates, or hang-watchdog env in this public repo.
- No `curl | bash` install paths.
- Always-approve remains coding-worktrees only — not LIVE Discord / trading / irreversible egress.
- Do not replace PATH `claude-ds` or federation `/route`.

## Sources

- OSINT super-audit 2026-09-02 — OpenRouter ranker gap (fix #10)
- agent-toolkit `select-openrouter-free-model.ps1`
- cursor-route `docs/briefs/WORKING.md` (0.1.13 LIVE)
- CCC `wiki/entities/skills/route.md` — do-not-swap policy
