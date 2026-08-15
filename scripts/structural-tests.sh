#!/usr/bin/env bash
# ============================================================================
# Structural Tests — repository invariants
#
# The counterpart to check-conventions.sh. That script is diff-scoped and asks
# "is this change well-formed"; this one is whole-tree and asks "is the repo
# still internally consistent".
#
# While the repo is documentation-only the invariants are about the spec:
# every numbered document is reachable, numbering is contiguous, the index and
# the README agree, and the harness contract stays parseable. Architectural
# boundary checks join them here once application code lands, driven by
# architecturalBoundaries in harness.config.json.
#
# Exit 0: all invariants hold.  Exit 1: one or more violations.
# ============================================================================
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" || exit 1

SPECS="docs/specs"
INDEX="$SPECS/00-index.md"
VIOLATIONS=0

red() { printf '\033[31m%s\033[0m\n' "$*"; }
grn() { printf '\033[32m%s\033[0m\n' "$*"; }
fail() { red "FAIL  $*"; VIOLATIONS=$((VIOLATIONS + 1)); }

echo "========================================="
echo "  Structural Tests"
echo "========================================="
echo

# ---------------------------------------------------------------------------
# 1. every numbered spec doc is reachable from the index and the README
# ---------------------------------------------------------------------------
echo "-- spec documents are reachable"
shopt -s nullglob
for f in "$SPECS"/[0-9][0-9]-*.md; do
  base="$(basename "$f")"
  [[ "$base" == "00-index.md" ]] && continue

  grep -q "$base" "$INDEX" 2>/dev/null \
    || fail "$base is not listed in $INDEX"
  grep -q "$base" README.md 2>/dev/null \
    || fail "$base is not listed in the README documentation table"
done

# ---------------------------------------------------------------------------
# 2. spec numbering is contiguous - a gap means a doc was deleted or misnamed
# ---------------------------------------------------------------------------
echo "-- spec numbering is contiguous"
nums=()
for f in "$SPECS"/[0-9][0-9]-*.md; do
  nums+=("$(basename "$f" | cut -c1-2)")
done
if [[ ${#nums[@]} -gt 0 ]]; then
  mapfile -t sorted < <(printf '%s\n' "${nums[@]}" | sort -u)
  expected=0
  for n in "${sorted[@]}"; do
    got=$((10#$n))
    if [[ $got -ne $expected ]]; then
      fail "spec numbering jumps from $(printf '%02d' $expected) to $n"
      expected=$got
    fi
    expected=$((expected + 1))
  done
fi

# ---------------------------------------------------------------------------
# 3. every spec doc states its confidence vocabulary
#
# a claim about the predecessor is Observed or Inferred. a spec file carrying
# neither has probably had an inference quietly promoted to fact. the index and
# the glossary make no such claims, so they are exempt.
# ---------------------------------------------------------------------------
echo "-- spec claims carry confidence marking"
for f in "$SPECS"/[0-9][0-9]-*.md; do
  base="$(basename "$f")"
  case "$base" in 00-index.md | 10-glossary-sk-en.md) continue ;; esac
  grep -qEi '\b(observed|inferred|observable|verified)\b' "$f" \
    || fail "$base carries no confidence marking"
done

# ---------------------------------------------------------------------------
# 4. load-bearing files exist and parse
# ---------------------------------------------------------------------------
echo "-- load-bearing files parse"
for f in harness.config.json .harnext/contract.json; do
  if [[ ! -f "$f" ]]; then
    fail "$f is missing"
  elif ! python3 -c "import json,sys; json.load(open('$f'))" 2>/dev/null; then
    fail "$f is not valid json"
  fi
done

for f in CONTEXT.md CLAUDE.md README.md; do
  [[ -f "$f" ]] || fail "$f is missing"
done

# ---------------------------------------------------------------------------
# 5. every check script is executable - a non-executable gate silently no-ops
# ---------------------------------------------------------------------------
echo "-- check scripts are executable"
for f in scripts/*.sh .harnext/scripts/*.sh; do
  [[ -f "$f" ]] || continue
  [[ -x "$f" ]] || fail "$f is not executable"
done

# ---------------------------------------------------------------------------
# 6. architectural boundaries (dormant until application code lands)
# ---------------------------------------------------------------------------
echo "-- architectural boundaries"
if python3 -c "
import json,sys
b = json.load(open('harness.config.json')).get('architecturalBoundaries') or {}
sys.exit(0 if b else 1)
" 2>/dev/null; then
  echo "   (boundaries declared - enforcement lands with the application code)"
else
  echo "   (none declared yet - skipped)"
fi

echo
if [[ $VIOLATIONS -ne 0 ]]; then
  red "structural-tests: $VIOLATIONS violation(s)"
  exit 1
fi
grn "structural-tests: all invariants hold"
