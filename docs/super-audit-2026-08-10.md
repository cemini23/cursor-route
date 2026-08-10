# Super audit — cursor-route (2026-08-10)

**Mode:** prod-ship + security · **Auditors:** 6 · **Tier:** operator-override (Cursor GLM/Kimi/Opus + discounted OR + DeepSeek/claude-ds)

| Slot | Channel | Role | Model | Verdict |
|------|---------|------|-------|---------|
| 1 | cursor | agentic / correctness | GLM 5.2 | PASS (polish only) |
| 2 | cursor | third-lens | Kimi K3 | WARN |
| 3 | cursor | security | Opus | FAIL (cost-gate / send / secrets) |
| 4 | api | api-adversarial | openai/gpt-oss-120b | WARN |
| 5 | api | api-deep-reasoning | qwen/qwen3-32b | WARN |
| 6 | local | api-local-claude-ds | deepseek-chat | WARN |

Pack: `OSINT WORKSPACE/reports/audit/pack-cursor-route-20260810` (+ condensed for API).

## Consensus (≥3)

1. **Expand secret patterns** (`sk-proj`, `sk-ant`, `github_pat`, …) + share with log redaction — GLM/Kimi/Opus/OR/DS
2. **`send-keys -l`** — Kimi/Opus/DS (and OR noted key injection)
3. **CLI flag validation** (`--dir`/`--days`/`--limit`, `--` terminator) — GLM/Kimi/Opus
4. **`kill` must not rewrite terminal jobs** — Kimi
5. **DeepSeek routing must survive tmux** (env on command / hostname-anchored URL) — Opus (CRITICAL for stock-`claude` path); live check: inheritance depends on tmux-server age — command prefix is the reliable fix
6. **Grok launch should use resolved absolute path** — Opus
7. **Secrets scan of repo: CLEAN** (test fixtures only) — all 6

## Strong (≥4)

- No live secrets in git/npm surface
- Prior v0.1.1 phantom-completed / PID-kill fixes hold
- Prompt shell-injection via `"$(cat …)"` is safe under shellQuote

## Unique / contested

- Opus **CR-01** (tmux drops DeepSeek env): confirmed as risk for *persistent* tmux servers + stock `claude`; mitigated when `claude-ds` shim is used (common on this machine)
- Opus **CR-02** (npx tsx undeclared): documented honestly in SECURITY.md; Bun path preferred; not blocking 0.1.2
- Free-tier OR run (nemotron) was noisy / mis-flagged test fixtures — discarded in favor of gpt-oss-120b

## Patch backlog (implemented in 0.1.2)

1. Secret pattern expansion + shared `redactSecrets`
2. `tmux send-keys -l` + reject newlines in send
3. DeepSeek hostname URL check; home-only settings; env prefix on stock-claude launch
4. `killJob` terminal-state guard + merge-on-write
5. CLI `--` / string-flag / numeric validation; headless-aware attach
6. Grok absolute binary path
7. Scope `CLAUDE_DS_ASK` to claude-ds worker; orphan prompt cleanup on buildLaunch fail
8. Trim audit docs from npm `files`; CI health no longer `|| true`
9. Version bump **0.1.2**

## Overall

**REWORK → SHIP 0.1.2** after implement + Sol verify.

### Sol verify
- First pass: **FAIL** (dry-run leaked `ANTHROPIC_AUTH_TOKEN` via command prefix)
- Fix: move DeepSeek creds to `LaunchPlan.env` + tmux `-e` / spawn `env`; dry-run lists keys only + `redactSecrets`
- Second pass: **PASS** — Ship 0.1.2 YES

