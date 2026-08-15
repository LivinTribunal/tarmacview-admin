#!/usr/bin/env bash
set -euo pipefail

# harness-smoke: minimal integration check that the repo's load-bearing files exist
# and parse. no application code exists yet, so the "load-bearing paths" are the
# spec index and the harness contract — if either goes missing or malforms, every
# downstream gate becomes meaningless.

FAIL=0

# 1. spec index resolvable
if [[ ! -f docs/specs/00-index.md ]]; then
  echo "harness-smoke: docs/specs/00-index.md missing" >&2
  FAIL=1
fi

# 2. harness config parses
if [[ ! -f harness.config.json ]]; then
  echo "harness-smoke: harness.config.json missing" >&2
  FAIL=1
elif command -v jq >/dev/null 2>&1; then
  jq -e . harness.config.json >/dev/null || { echo "harness-smoke: harness.config.json is not valid json" >&2; FAIL=1; }
else
  python3 -c 'import json,sys; json.load(open("harness.config.json"))' \
    || { echo "harness-smoke: harness.config.json is not valid json" >&2; FAIL=1; }
fi

# 3. risk contract parses
if [[ -f .harnext/contract.json ]]; then
  if command -v jq >/dev/null 2>&1; then
    jq -e . .harnext/contract.json >/dev/null || { echo "harness-smoke: .harnext/contract.json is not valid json" >&2; FAIL=1; }
  else
    python3 -c 'import json,sys; json.load(open(".harnext/contract.json"))' \
      || { echo "harness-smoke: .harnext/contract.json is not valid json" >&2; FAIL=1; }
  fi
fi

# 4. lint script is present and executable
if [[ ! -x scripts/check-conventions.sh ]]; then
  echo "harness-smoke: scripts/check-conventions.sh missing or not executable" >&2
  FAIL=1
fi

if [[ $FAIL -ne 0 ]]; then
  exit 1
fi

echo "harness-smoke: ok"
