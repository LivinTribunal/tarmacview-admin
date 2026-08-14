#!/usr/bin/env bash
# the mechanically-decidable half of review for this repo.
#
# diff-scoped against the merge-base with main, so pre-existing violations never block a
# PR that merely sits next to them. run with --all to sweep the whole tree.
#
# HARNEXT_AGENT=1 makes protected-file edits a hard failure (agents) rather than a
# warning (humans).

set -uo pipefail

FAIL=0
WARN=0

red()  { printf '\033[31m%s\033[0m\n' "$*"; }
ylw()  { printf '\033[33m%s\033[0m\n' "$*"; }
grn()  { printf '\033[32m%s\033[0m\n' "$*"; }

fail() { red   "FAIL  $*"; FAIL=1; }
warn() { ylw   "WARN  $*"; WARN=1; }

# resolve the file set
if [[ "${1:-}" == "--all" ]]; then
  mapfile -t FILES < <(git ls-files)
  SCOPE="all tracked files"
else
  BASE="$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main 2>/dev/null || true)"
  if [[ -n "$BASE" ]]; then
    mapfile -t FILES < <(git diff --name-only --diff-filter=ACMR "$BASE"...HEAD)
    SCOPE="diff vs $(git rev-parse --short "$BASE")"
  else
    mapfile -t FILES < <(git ls-files)
    SCOPE="all tracked files (no merge-base)"
  fi
fi

# drop deleted paths
EXISTING=()
for f in "${FILES[@]:-}"; do [[ -n "$f" && -f "$f" ]] && EXISTING+=("$f"); done

echo "check-conventions: ${#EXISTING[@]} file(s) — $SCOPE"
echo

if [[ ${#EXISTING[@]} -eq 0 ]]; then
  grn "nothing to check"
  exit 0
fi

# ---------------------------------------------------------------------------
# 1. personal data
#
# the predecessor system holds real pilots' names, emails, licence numbers and org
# access tokens across several unrelated operator organisations. none of it belongs in
# this repo. see CLAUDE.md.
# ---------------------------------------------------------------------------
for f in "${EXISTING[@]}"; do
  case "$f" in scripts/check-conventions.sh) continue ;; esac

  if grep -nEi '[a-z0-9._%+-]+@(zephyruas|vsdas|ithelps)\.[a-z]{2,}' "$f" >/dev/null 2>&1; then
    fail "$f — real e-mail address from the predecessor system"
    grep -nEi '[a-z0-9._%+-]+@(zephyruas|vsdas|ithelps)\.[a-z]{2,}' "$f" | head -3 | sed 's/^/        /'
  fi

  if grep -nE '\b(SVK|LUX)-?RP-?[[:space:]]?[a-z0-9]{8,}' "$f" >/dev/null 2>&1; then
    fail "$f — looks like a real pilot licence number"
  fi

  # 32-hex organisation access token: doubles as the report URL in the predecessor
  if grep -nE '\b[0-9a-f]{32}\b' "$f" >/dev/null 2>&1; then
    fail "$f — 32-hex string, possibly an organisation access token"
    grep -nE '\b[0-9a-f]{32}\b' "$f" | head -3 | sed 's/^/        /'
  fi
done

# ---------------------------------------------------------------------------
# 2. AI attribution — forbidden in commits, PRs and code alike
# ---------------------------------------------------------------------------
for f in "${EXISTING[@]}"; do
  case "$f" in scripts/check-conventions.sh) continue ;; esac
  if grep -nEi 'co-authored-by:[[:space:]]*claude|generated with \[?claude|🤖 generated' "$f" >/dev/null 2>&1; then
    fail "$f — AI attribution"
  fi
done

if git log --format='%B' -1 2>/dev/null | grep -qEi 'co-authored-by:[[:space:]]*claude|generated with \[?claude'; then
  fail "HEAD commit message carries AI attribution"
fi

# ---------------------------------------------------------------------------
# 3. relative markdown links resolve
# ---------------------------------------------------------------------------
for f in "${EXISTING[@]}"; do
  [[ "$f" == *.md ]] || continue
  dir="$(dirname "$f")"
  while IFS= read -r target; do
    [[ -z "$target" ]] && continue
    case "$target" in http*|mailto:*|\#*) continue ;; esac
    clean="${target%%#*}"
    [[ -z "$clean" ]] && continue
    if [[ ! -e "$dir/$clean" && ! -e "$clean" ]]; then
      fail "$f — dead relative link: $target"
    fi
  done < <(grep -oE '\]\([^)]+\)' "$f" 2>/dev/null | sed 's/^](\(.*\))$/\1/')
done

# ---------------------------------------------------------------------------
# 4. protected files
# ---------------------------------------------------------------------------
# only meaningful against a diff - in a full-tree sweep every protected file is
# "present", which says nothing about whether anyone touched it.
if [[ "${1:-}" != "--all" ]]; then
  PROTECTED_RE='^(\.github/workflows/|harness\.config\.json$|LICENSE$|NOTICE$)'
  for f in "${EXISTING[@]}"; do
    if [[ "$f" =~ $PROTECTED_RE ]]; then
      if [[ "${HARNEXT_AGENT:-0}" == "1" ]]; then
        fail "$f — protected file, agents must not modify"
      else
        warn "$f — protected file (human edit, allowed)"
      fi
    fi
  done
fi

# ---------------------------------------------------------------------------
# 5. spec claims stay marked
#
# every claim about the predecessor is Observed or Inferred; a spec file that has lost
# both markers has probably had an inference silently promoted to fact.
# ---------------------------------------------------------------------------
for f in "${EXISTING[@]}"; do
  case "$f" in docs/specs/*.md) ;; *) continue ;; esac
  case "$f" in docs/specs/00-index.md|docs/specs/10-glossary-sk-en.md) continue ;; esac
  if ! grep -qEi '\b(observed|inferred|observable|verified)\b' "$f"; then
    warn "$f — no Observed/Inferred marking; check nothing was promoted to fact"
  fi
done

echo
if [[ $FAIL -ne 0 ]]; then
  red "check-conventions: FAILED"
  exit 1
fi
if [[ $WARN -ne 0 ]]; then
  ylw "check-conventions: passed with warnings"
  exit 0
fi
grn "check-conventions: clean"
