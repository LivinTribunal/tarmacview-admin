#!/usr/bin/env bash
set -euo pipefail

# risk-policy-gate: validate .harnext/contract.json is well-formed.
#
# checks the contract parses as json, that mergePolicy tiers each declare a
# non-empty requiredChecks array, and that every tier referenced in
# riskTierRules has a matching mergePolicy entry.

CONTRACT=".harnext/contract.json"

if [[ ! -f "$CONTRACT" ]]; then
  echo "risk-policy-gate: $CONTRACT missing" >&2
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  jq -e . "$CONTRACT" >/dev/null || { echo "risk-policy-gate: $CONTRACT is not valid json" >&2; exit 1; }

  # every mergePolicy tier must declare at least one requiredCheck
  while IFS= read -r tier; do
    count="$(jq --arg t "$tier" '.mergePolicy[$t].requiredChecks | length' "$CONTRACT")"
    if [[ "$count" -lt 1 ]]; then
      echo "risk-policy-gate: mergePolicy.$tier has no requiredChecks" >&2
      exit 1
    fi
  done < <(jq -r '.mergePolicy | keys[]' "$CONTRACT")

  # every risk tier in riskTierRules must have a matching mergePolicy tier
  while IFS= read -r tier; do
    if ! jq -e --arg t "$tier" '.mergePolicy | has($t)' "$CONTRACT" >/dev/null; then
      echo "risk-policy-gate: riskTierRules.$tier has no matching mergePolicy entry" >&2
      exit 1
    fi
  done < <(jq -r '.riskTierRules | keys[]' "$CONTRACT")
else
  python3 - "$CONTRACT" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    contract = json.load(f)
merge = contract.get("mergePolicy", {})
rules = contract.get("riskTierRules", {})
if not merge:
    print("risk-policy-gate: mergePolicy is empty", file=sys.stderr); sys.exit(1)
for tier, spec in merge.items():
    checks = spec.get("requiredChecks") or []
    if not checks:
        print(f"risk-policy-gate: mergePolicy.{tier} has no requiredChecks", file=sys.stderr); sys.exit(1)
for tier in rules:
    if tier not in merge:
        print(f"risk-policy-gate: riskTierRules.{tier} has no matching mergePolicy entry", file=sys.stderr); sys.exit(1)
PY
fi

echo "risk-policy-gate: contract ok"
