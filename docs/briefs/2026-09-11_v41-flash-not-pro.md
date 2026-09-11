---
title: V4.1 Flash wire — Pro off rotation (0.1.15)
type: brief
repo: ~/Projects/cursor-route
created: 2026-09-11
updated: 2026-09-11
---

## Target

**cursor-route workspace** → npm `cursor-route@0.1.15`.  
Steal the 2026-09-11 federation model map: wire id `deepseek-flash` (DeepSeek V4.1 Flash, native vision). V4 Pro is **off rotation**. Legacy `pro` / `vision` / `deepseek-v4-*` aliases still work; they resolve to Flash.

**Do not** change federation `/route` or PATH `claude-ds`. Those already shipped v2.4.3.

## Summary

Public CLI still sends `deepseek-v4-flash` / `deepseek-v4-pro` / `deepseek-v4-flash-vision-exp`. DeepSeek docs (2026-09-10) say API id `deepseek-flash` is V4.1 Flash; it beats V4 Pro; `deepseek-v4-pro` routes to Flash from 2026-09-14 04:00 UTC. Ship **0.1.15** so `npm i -g cursor-route` matches that map.

## Body

### Required work (this repo)

1. `resolveDsModel` — default and all known aliases → id `deepseek-flash`. Keep CLI aliases `flash|pro|vision` so `job.model` still records the flag the operator passed.
2. Accept `deepseek-flash`, `deepseek-v4-flash`, `deepseek-v4.1-flash`, `deepseek-v4-flash-vision`, `deepseek-v4-flash-vision-exp`, `deepseek-v4-pro`, `deepseek-v4-pro[1m]`. Strip a trailing `[…]` SKU before match. Do not preserve `deepseek-v4-pro[1m]` as a launch id.
3. Tests — launch commands and dsh patches contain `deepseek-flash`. Pro/vision flags do **not** emit `deepseek-v4-pro` or `deepseek-v4-flash-vision-exp`.
4. Docs + both `route-orch` skill copies — Flash table; Pro is a legacy alias, not a rotation step.
5. Version **0.1.15**. Regen hero fixture.

### Not required

- Hero GIF (still open).
- Federation `/route` skill or agent-toolkit scripts.
- Daily-sweep arXiv papers (CCC HITL, not this CLI).

## NEVER

- No private `ROUTE_KIT`, SIP, prod paths, or hang-watchdog env in this public repo.
- No `curl | bash`. No rewrite of `~/.config/opencode/opencode.json`.
- Mid stays `claude-ds`. Do not replace PATH `claude-ds`.
