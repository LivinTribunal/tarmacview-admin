#!/usr/bin/env bash
set -euo pipefail

# ci-pipeline: the repo's default check suite.
#
# docs-only repo for now (no app code, no test suite, no build). the lint gate is
# scripts/check-conventions.sh — it enforces the personal-data, AI-attribution,
# protected-file and spec-marker rules from CLAUDE.md. once application code lands,
# extend this script with the stack's test/typecheck/build commands.

if [[ ! -x scripts/check-conventions.sh ]]; then
  echo "ci-pipeline: scripts/check-conventions.sh missing or not executable" >&2
  exit 1
fi

bash scripts/check-conventions.sh
