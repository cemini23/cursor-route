#!/usr/bin/env bash
# generate-hero-demo.sh — regenerate docs/fixtures/hero-demo.log
#
# Dry-run only: no live Grok, no worker spawned, no secrets. Jobs dir is
# sandboxed (trap-cleaned). Output is path-scrubbed + id-normalized so the
# committed fixture is machine-agnostic and regenerates stably.
#
# Prerequisites: Bun or Node 20+; runnable ./bin/cursor-route
# (git clone: bun install; npm global install ships dist/).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN="$ROOT/bin/cursor-route"
OUT="$ROOT/docs/fixtures/hero-demo.log"

if [[ ! -f "$BIN" ]]; then
  echo "missing $BIN — run from a cursor-route checkout (need bun/node 20+)" >&2
  exit 1
fi

# Neutralize inherited overrides that would leak private paths into the log.
unset CURSOR_ROUTE_CLAUDE_DS_BIN CURSOR_ROUTE_GROK_BIN CURSOR_ROUTE_DSH_BIN \
  CURSOR_ROUTE_ALLOW_ANTHROPIC \
  CURSOR_ROUTE_ALLOW_STOCK_CLAUDE CURSOR_ROUTE_ANTHROPIC_BASE_URL CURSOR_ROUTE_DS_MODEL \
  CURSOR_ROUTE_OPENROUTER_MODEL OPENROUTER_API_KEY OPENROUTER_BASE_URL \
  ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY ANTHROPIC_MODEL \
  DEEPSEEK_API_KEY XAI_API_KEY 2>/dev/null || true

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export CURSOR_ROUTE_JOBS_DIR="$TMP/.demo-jobs"
# Pin dsh to a missing path so worker:deepseek renders identically on machines
# that do have a real dsh installed (the adapter shows the install hint, no path).
export CURSOR_ROUTE_DSH_BIN="$TMP/no-such-dsh"

RAW="$TMP/hero-demo.raw"
NORM="$TMP/hero-demo.norm"

{
  echo "\$ cursor-route --version"
  "$BIN" --version
  echo

  echo "\$ CURSOR_ROUTE_RELAXED=1 cursor-route health"
  CURSOR_ROUTE_RELAXED=1 "$BIN" health
  echo

  echo "\$ cursor-route start --lane mid --model flash --dry-run \"Add a unit test for shellQuote\""
  "$BIN" start --lane mid --model flash --dry-run "Add a unit test for shellQuote"
  echo

  echo "\$ cursor-route start --lane easy --dry-run \"Rewrite this FAQ answer in 3 sentences\""
  "$BIN" start --lane easy --dry-run "Rewrite this FAQ answer in 3 sentences"
  echo

  echo "\$ cursor-route start --lane hard --dry-run \"Refactor auth module; run tests; report verify evidence\""
  "$BIN" start --lane hard --dry-run "Refactor auth module; run tests; report verify evidence"
  echo

  echo "\$ cursor-route start --lane mid --dry-run --json \"Add a failing test then make it pass\""
  "$BIN" start --lane mid --dry-run --json "Add a failing test then make it pass"
  echo

  echo "\$ cursor-route jobs --json"
  "$BIN" jobs --json
} > "$RAW"

jobs_display="$HOME/.local/share/cursor-route/jobs"
{
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//$TMP\/.demo-jobs/$jobs_display}"
    line="${line//$ROOT/~/Projects/cursor-route}"
    line="${line//$HOME/~}"
    line="$(printf '%s' "$line" | sed -E \
      -e 's#/Users/[^/\"'\'' ]+#~#g' \
      -e 's#/home/[^/\"'\'' ]+#~#g' \
      -e 's#/opt/cemini[^\"'\'' ]*#~#g' \
      -e 's#/var/folders/[^\"'\'' ]+#/tmp#g')"
    printf '%s\n' "$line"
  done
} < "$RAW" > "$NORM"

python3 - "$NORM" "$OUT" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding="utf-8").read()
seq = ["a1b2c3d4", "b2c3d4e5", "c3d4e5f6", "d4e5f6a7"]
seen: dict[str, str] = {}

def take(jid: str) -> str:
    if jid not in seen:
        seen[jid] = seq[len(seen)] if len(seen) < len(seq) else f"{len(seen):08x}"
    return seen[jid]

out = []
for line in text.splitlines(True):
    def sub(m: re.Match[str]) -> str:
        return m.group(1) + take(m.group(2)) + m.group(3)

    line = re.sub(r"(dry-run job )([0-9a-f]{8})(\b)", sub, line)
    line = re.sub(r'("id": ")([0-9a-f]{8})(")', sub, line)
    line = re.sub(r"(jobs/)([0-9a-f]{8})(\.prompt)", sub, line)
    line = re.sub(r"(headless-|cursor-route-)([0-9a-f]{8})(\b)", sub, line)
    line = re.sub(r'("createdAt": ")[^"]+(")', r"\g<1>2026-08-13T00:00:00.000Z\2", line)
    out.append(line)
open(dst, "w", encoding="utf-8").write("".join(out))
PY

echo "wrote $OUT"
