# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.x     | Yes       |

## Reporting a vulnerability

Email security reports to the maintainers via GitHub Security Advisories on this repo.
Do **not** open a public issue for credential leaks or RCE-class bugs.

## Hard rules for users and agents

1. **No secrets in prompts or job files.** Do not paste API keys, SSH private keys, Discord tokens, or `.env` contents into `cursor-route start` / `send` prompts.
2. **Always-approve is powerful.** Default headless workers skip interactive permission prompts (`--always-approve` / `--dangerously-skip-permissions`). Opt out with `--ask` / `CURSOR_ROUTE_ASK=1` when you need HITL.
3. **Install from known channels only.** Prefer `npm i -g cursor-route` or a git clone of this repo. Do not pipe unknown `curl | bash` installers as the primary path.
4. **Workers inherit your auth.** Grok CLI and Claude Code / claude-ds use *your* local login. Treat worker panes like you would treat your own shell.
5. **No LIVE Discord / trading egress demos** from this tool. Orchestration is local.

## Supply chain

- Declared runtime npm dependencies: **none**. System needs: Node ≥20 or Bun, `tmux`, and worker CLIs (Grok / claude-ds).
- On Node-only hosts (no Bun), the bin shim and completion hook may invoke **pinned** `npx --yes tsx@4.19.4` once to run TypeScript sources. Prefer Bun for offline / air-gapped use, or set PATH so `bun` is available.
- Review `package.json` before upgrading.
- Prefer pinned git tags for production installs.
