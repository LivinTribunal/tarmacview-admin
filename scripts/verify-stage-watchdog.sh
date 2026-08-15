#!/usr/bin/env bash
# hand-runnable check on the stage-watchdog classifier.
#
# a live repo exercises almost none of this: a healthy pipeline produces only the
# "skip" paths, and the states that matter are the ones nobody can stage on
# demand - a job that died in `Set up job`, a dispatch that never became a run, a
# run cancelled while queued. this drives fixtures through
# harnext-stage-watchdog.sh in dry-run mode and asserts the verdicts.
#
# the false-positive direction is what it guards hardest: parking a healthy issue
# stops a working pipeline and needs a human to restart it.
#
# usage: scripts/verify-stage-watchdog.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ago() { python3 -c "import datetime,sys; print((datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=float(sys.argv[1]))).strftime('%Y-%m-%dT%H:%M:%SZ'))" "$1"; }

# each fixture is a candidate as collect() emits it, so the classifier under test
# is exactly the one that runs in production.
cat > "$TMP/candidates.json" <<EOF
[
  { "number": 201, "stages": ["plan"], "holds": [], "stage": "plan",
    "labeled_at": "$(ago 120)", "live_mine": 1, "live_unattributable": 0,
    "last_conclusion": null },

  { "number": 202, "stages": ["plan"], "holds": [], "stage": "plan",
    "labeled_at": "$(ago 5)", "live_mine": 0, "live_unattributable": 0,
    "last_conclusion": null },

  { "number": 203, "stages": ["plan"], "holds": [], "stage": "plan",
    "labeled_at": "$(ago 120)", "live_mine": 0, "live_unattributable": 0,
    "last_conclusion": null },

  { "number": 204, "stages": ["implement"], "holds": [], "stage": "implement",
    "labeled_at": "$(ago 120)", "live_mine": 0, "live_unattributable": 0,
    "last_conclusion": "failure" },

  { "number": 205, "stages": ["review"], "holds": [], "stage": "review",
    "labeled_at": "$(ago 300)", "live_mine": 0, "live_unattributable": 0,
    "last_conclusion": "cancelled" },

  { "number": 206, "stages": ["verify"], "holds": ["harnext:needs-judgment"], "stage": "verify",
    "labeled_at": "$(ago 300)", "live_mine": 0, "live_unattributable": 0,
    "last_conclusion": "failure" },

  { "number": 207, "stages": ["plan"], "holds": ["harnext:awaiting-approval"], "stage": "plan",
    "labeled_at": "$(ago 300)", "live_mine": 0, "live_unattributable": 0,
    "last_conclusion": null },

  { "number": 208, "stages": ["plan", "implement"], "holds": [], "stage": null,
    "labeled_at": null, "live_mine": 0, "live_unattributable": 0,
    "last_conclusion": null },

  { "number": 209, "stages": ["implement"], "holds": [], "stage": "implement",
    "labeled_at": "$(ago 120)", "live_mine": 0, "live_unattributable": 2,
    "last_conclusion": null },

  { "number": 210, "stages": ["plan"], "holds": [], "stage": "plan",
    "labeled_at": null, "live_mine": 0, "live_unattributable": 0,
    "last_conclusion": null },

  { "number": 211, "stages": ["plan"], "holds": [], "stage": "plan",
    "labeled_at": "$(ago 120)", "live_mine": 0, "live_unattributable": 0,
    "last_conclusion": "success" },

  { "number": 212, "stages": ["verify"], "holds": [], "stage": "verify",
    "labeled_at": "$(ago 120)", "live_mine": 0, "live_unattributable": 0,
    "last_conclusion": "startup_failure" },

  { "number": 213, "stages": ["verify"], "holds": [], "stage": "verify",
    "labeled_at": "$(ago 300)", "live_mine": 0, "live_unattributable": 0,
    "last_conclusion": null, "stage_disabled": true }
]
EOF

out="$(REPO=owner/repo CANDIDATES_JSON_FILE="$TMP/candidates.json" DRY_RUN=1 \
  bash "$HERE/harnext-stage-watchdog.sh" 2>&1)"

echo "$out"
echo

fails=0
expect_park() { if printf '%s' "$out" | grep -q "^#$1 .*STALLED"; then echo "ok   #$1 parked ($2)"; else echo "FAIL #$1 should be parked ($2)"; fails=$((fails+1)); fi; }
expect_safe() { if printf '%s' "$out" | grep -q "^#$1 .*STALLED"; then echo "FAIL #$1 must never be parked ($2)"; fails=$((fails+1)); else echo "ok   #$1 left alone ($2)"; fi; }
expect_warn() { if printf '%s' "$out" | grep -q "warning::#$1"; then echo "ok   #$1 warned ($2)"; else echo "FAIL #$1 should warn ($2)"; fails=$((fails+1)); fi; }

# the parks - every one of these is a stage label with nothing behind it
expect_park 203 "no run ever created, dispatch dropped"
expect_park 204 "last run failed without parking itself"
expect_park 205 "last run cancelled - the timeout/interruption shape"
expect_park 212 "last run died in startup_failure"

# the ones that must survive: each is a healthy or human-held state, and parking
# any of them would stop a working pipeline
expect_safe 201 "a run for it is still live"
expect_safe 202 "labelled 5m ago, inside the grace window"
expect_safe 206 "already parked on needs-judgment"
expect_safe 207 "held on awaiting-approval, no job expected"
expect_safe 208 "two stage labels - cannot tell which is live"
expect_safe 209 "unattributable live runs at that stage"
expect_safe 210 "no labelled event, so age is unknown"
expect_safe 211 "its run succeeded - hand-off defect, not a stall"
expect_safe 213 "the stage workflow is disabled - no run is coming by design"

# a stall that is reported without saying which stage or why is the silence this
# whole watchdog exists to break
expect_warn 208 "reports the double-label defect"
expect_warn 210 "refuses to park on an unknown age, out loud"
expect_warn 211 "reports the incomplete hand-off"

if ! printf '%s' "$out" | grep -q "203 (plan): STALLED - no plan run was ever created"; then
  echo "FAIL park reason does not name the stage and the cause"
  fails=$((fails+1))
else
  echo "ok   park reason names the stage and the cause"
fi

echo
if [ "$fails" -ne 0 ]; then
  echo "$fails check(s) failed"
  exit 1
fi
echo "all checks passed"
