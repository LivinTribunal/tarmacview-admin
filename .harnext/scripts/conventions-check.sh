#!/usr/bin/env bash
set -euo pipefail

# conventions-check: diff-scoped repo hygiene gate.
#
# delegates to scripts/check-conventions.sh — the mechanically-decidable half of
# review (personal data, AI attribution, dead relative links, protected files,
# confidence marking on spec claims). scoped to the diff against merge-base with
# main, so pre-existing violations never block a PR that merely sits next to them.

if [[ ! -x scripts/check-conventions.sh ]]; then
  echo "conventions-check: scripts/check-conventions.sh missing or not executable" >&2
  exit 1
fi

bash scripts/check-conventions.sh
