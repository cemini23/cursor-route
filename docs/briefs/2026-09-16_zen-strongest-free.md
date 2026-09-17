---
title: Zen free pick — strongest live model (0.1.16)
type: brief
repo: ~/Projects/cursor-route
created: 2026-09-16
updated: 2026-09-16
---

## Target

**cursor-route workspace** → npm `cursor-route@0.1.16`.  
Sibling: private **agent-toolkit** already shipped the ranker (`scripts/lib/Select-ZenFreeModel.ps1` `Get-RouteZenFreeBoost`). **Do not** change federation `/route` or PATH `claude-ds`.

## Summary

`--worker opencode --model free` still ranks **Ox Alpha first** while listed (`zenFreeBoost` 40). That is a soft pin. When Ox Alpha is not free, the public pick falls to a **flash** coding id (`deepseek-v4-flash-free` on 2026-09-16) even if a stronger free id is in the catalog (`nemotron-3-ultra-free`).

Private `/route` now scores **generic name tokens** (ultra/pro/max > frontier-preview > generic > flash/lite), then coding-family, then `context_length`. No locked id. Port that logic here → **0.1.16**, tests, docs, npm publish.

**Out of scope:** OpenRouter `or-free.ts` (already tiered in 0.1.14). Mid lane. Federation `/route`.

## Body

### Why

| Surface | Today (0.1.15) | Wanted (0.1.16) |
|---------|----------------|-----------------|
| `src/zen-free.ts` `zenFreeBoost` | Ox Alpha 40, coding 20, `-free` 10, big-pickle 5, contributor 1 | Capability tokens; no named-model pin |
| Live catalog 2026-09-16 (8 free) | `opencode/deepseek-v4-flash-free` | `opencode/nemotron-3-ultra-free` |
| Offline / empty catalog | `opencode/x-preview-f-free` | **Keep** that fallback id only |

Catalog `GET https://opencode.ai/zen/v1/models` often has **no** `pricing` / `context_length`. Free = `-free` / `:free` / `big-pickle` (existing `isZenFreeModel`). Do not require price fields.

### Required work (this repo)

#### 1. Replace `zenFreeBoost()` in `src/zen-free.ts`

Port `Get-RouteZenFreeBoost` from agent-toolkit. Higher wins. **Generic tokens only** — do not hardcode a winner id.

```
power:
  ultra | opus | \bpro\b | max | plus | large     +50
  x-preview | ox-alpha | oxalpha | alpha | preview +42
  flash | lightning | lite | mini | nano | small | haiku | fin-  +15
  else                                            +30

coding family (coder|code|instruct|laguna|glm|qwen|kimi|deepseek|gpt-oss|north|gemma|nemotron|mimo|muse)
  +20
else if id ends with -free or :free
  +10

penalties:
  contributor-free                                -25
  (^|/)big-pickle$ | (^|/)hy3-free$               -20
```

Keep sort: `boost` desc, then `context_length` desc, then `id` asc.

Keep unchanged:

- Catalog URL, ~15 min cache, `CURSOR_ROUTE_ZEN_*` env.
- `CURSOR_ROUTE_OPENCODE_MODEL` pin still wins.
- Health stays offline-safe (cache hit or Ox Alpha fallback — no live fetch in health).
- Never rewrite `~/.config/opencode/opencode.json`.
- Mid stays **claude-ds**.

Reference: `~/Projects/agent-toolkit/scripts/lib/Select-ZenFreeModel.ps1`. Do not vendor the PowerShell file.

#### 2. Tests — `src/zen-free.test.ts`

Replace Ox-Alpha-always-wins cases:

| Case | Winner |
|------|--------|
| `hy3-free` + `x-preview-f-free` + `big-pickle` | `opencode/x-preview-f-free` (preview beats may-train) |
| `hy3-free` + `big-pickle` + `deepseek-v4-flash-free` | `opencode/deepseek-v4-flash-free` |
| `deepseek-v4-flash-free` + `nemotron-3-ultra-free` + `x-preview-f-free` | **`opencode/nemotron-3-ultra-free`** |
| only `big-pickle` | `opencode/big-pickle` |
| paid-only catalog | offline fallback `opencode/x-preview-f-free` |

Assert relative boosts: ultra > preview > flash > big-pickle.

Keep: paid/whisper dropped; pin env wins; empty catalog → Ox Alpha **fallback only**.

`hy3-free` used to score 20 (coding regex). After the port it is may-train (−20). Update any test that assumed hy3 ≈ Laguna.

#### 3. Docs + skill sync

- `CHANGELOG.md` — 0.1.16: Zen pick = strongest listed-free coding model; Ox Alpha is offline fallback only, not a live pin.
- `README.md` — OpenCode row / `--model free` blurb.
- `SECURITY.md` — drop “Ox Alpha currently ranks first”; say live pick ranks strongest free coding model; secrets still stay off free Zen; pin `CURSOR_ROUTE_OPENCODE_MODEL` for a frozen id.
- `skills/route-orch/SKILL.md` **and** `.cursor/skills/route-orch/SKILL.md` — same one-line rank rule.
- `src/adapters/opencode.ts` comments / health detail if they say “Ox Alpha wins while listed”.
- `docs/briefs/WORKING.md` — tick the open checkbox; edit-log line; bump npm to 0.1.16 **after** publish.

#### 4. Publish

```bash
bun test && bun run typecheck && bun run build
# bump package.json 0.1.16
npm publish
git tag v0.1.16 && git push && git push --tags
```

```bash
npm i -g cursor-route@0.1.16
cursor-route --version
cursor-route health
# optional: CURSOR_ROUTE_ZEN_REFRESH=1 + injected catalog to prove ultra wins
```

### Not required in cursor-route

- Federation `/route` skill, `route-task.ps1`, PATH `claude-ds`.
- `or-free.ts` (0.1.14 already done).
- Hero GIF (still open in WORKING.md).
- Private SIP / `ROUTE_KIT` / hang-watchdog env.

## Verify

| # | Check | Pass |
|---|-------|------|
| 1 | `bun test` green including ultra-vs-flash-vs-preview | |
| 2 | `bun run typecheck && bun run build` | |
| 3 | Offline health still OK; no locked live winner id in health | |
| 4 | Injected catalog with ultra + flash + preview → ultra | |
| 5 | Empty/offline catalog → `opencode/x-preview-f-free` fallback only | |
| 6 | npm `0.1.16` live; mid still **claude-ds** | |

## NEVER

- No private `ROUTE_KIT`, prod paths, SIP templates, or hang-watchdog env in this public repo.
- Do **not** hardcode `nemotron-3-ultra-free` (or any other live id) as the default. When it leaves the free list, the next strongest free id must win.
- No `curl | bash`.
- Always-approve remains coding-worktrees only — not LIVE Discord / trading.
- Do not replace PATH `claude-ds` or federation `/route`.

## Sources

- Private `/route` ship 2026-09-16 — agent-toolkit `Select-ZenFreeModel.ps1` + `test-route-v24-models.ps1` (`PASS=49`).
- Live Zen catalog that day (8 free): winner `opencode/nemotron-3-ultra-free` (boost 70).
- cursor-route `src/zen-free.ts` / `src/zen-free.test.ts` (0.1.15 Ox Alpha-first).
- `docs/briefs/WORKING.md` (0.1.15 LIVE).
