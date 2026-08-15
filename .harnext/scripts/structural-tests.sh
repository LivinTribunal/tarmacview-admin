#!/usr/bin/env bash
set -euo pipefail

# structural-tests: whole-tree repo consistency gate.
#
# delegates to scripts/structural-tests.sh — every numbered spec doc reachable
# from the index and the README, contiguous numbering, load-bearing files
# present and parseable, check scripts executable. architectural boundary
# enforcement joins it when application code lands.

if [[ ! -x scripts/structural-tests.sh ]]; then
  echo "structural-tests: scripts/structural-tests.sh missing or not executable" >&2
  exit 1
fi

bash scripts/structural-tests.sh
