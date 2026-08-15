#!/usr/bin/env bash
# parks issues whose stage label no longer has a job behind it.
#
# why this exists: every stage workflow parks itself on harnext:needs-judgment
# from a step guarded by `if: failure() || cancelled()`. that closes the case
# where the agent step dies. it cannot close the case where the job dies before
# its first step runs - if `Set up job` fails, no step in the job executes,
# including the park step. the issue keeps its stage label, nothing is
# dispatched, and nothing signals a human.
#
# observed during a github actions degraded_performance window: a harnext plan
# run for one issue recorded `Set up job=failure` as its only step and stalled,
# while a sibling issue dispatched three minutes later ran fine. there is
# nothing to retry from - the failure is in the runner's own bootstrap, ahead of
# any `run:` or `uses:` the workflow controls.
#
# so this reconciles labels against reality from the outside instead of relying
# on the dying job to report. for every open issue/PR carrying a stage label:
# is there a live run for that stage? if not, and the last run for it did not
# succeed, park it. that also subsumes a dispatch that silently never created a
# run (`gh workflow run` returning non-2xx) and a run cancelled while queued.
#
# runs on ubuntu-latest, so it stays up when the self-hosted fleet is asleep.
#
# false positives are the expensive direction: a wrongly parked issue stops a
# healthy pipeline and needs a human to restart it, while a missed stall is
# picked up by the next tick 30 minutes later. two guards bias it that way -
# a grace window after the label lands, and the unattributable-run rule below.
#
# env required:
#   REPO     - github repo (owner/name)
#   GH_TOKEN - token for `gh`
# env optional:
#   GRACE_MINUTES        - leave a freshly labelled issue alone this long, so a
#                          dispatch still on its way to becoming a run is never
#                          mistaken for a dropped one (default 20)
#   DRY_RUN              - '1' reports verdicts and mutates nothing
#   CANDIDATES_JSON_FILE - classify this file instead of collecting from the
#                          api. the seam scripts/verify-stage-watchdog.sh drives
#                          fixtures through, so the verdicts are testable
#                          without a repo full of stalled issues.

set -uo pipefail

: "${REPO:?REPO required}"

GRACE_MINUTES="${GRACE_MINUTES:-20}"
DRY_RUN="${DRY_RUN:-0}"
CANDIDATES_JSON_FILE="${CANDIDATES_JSON_FILE:-}"

# the stages that own a workflow, and so must have a run behind them. the other
# harnext labels are deliberately absent: harnext:start is the human gate the
# tagger consumes, awaiting-approval and needs-judgment and ready-to-merge are
# resting states with no job by design, and review-iter-<n> is a counter.
STAGES="triage plan implement review verify"

# labels that mean "already parked, or waiting on a human" - an issue holding
# one of these is not stalled, whatever its stage label says.
HOLD_LABELS="harnext:needs-judgment harnext:awaiting-approval harnext:ready-to-merge"

gh_retry() {
  for _ in 1 2 3; do "$@" && return 0; sleep 3; done
  echo "::warning::gh failed 3x: $*" >&2
  return 1
}

# ---------------------------------------------------------------- collection

collect() {
  # stage labels live on issues and on PRs (review and verify run against a PR),
  # and `gh issue list` excludes PRs, so both lists are needed.
  local issues prs items
  issues="$(gh issue list --repo "$REPO" --state open --limit 200 \
    --json number,labels,updatedAt)" || return 1
  prs="$(gh pr list --repo "$REPO" --state open --limit 200 \
    --json number,labels,updatedAt)" || return 1
  items="$(jq -s 'add' <<<"$issues"$'\n'"$prs")" || return 1

  # a stage whose workflow is disabled at the actions level has no run behind it
  # by design, and `gh workflow run` against it never creates one. left unread,
  # that is indistinguishable from a dropped dispatch - disabling verify parked
  # every open PR on needs-judgment with a comment blaming the dispatch.
  local wf_states
  wf_states="$(gh api "repos/$REPO/actions/workflows?per_page=100" \
    --jq '[.workflows[] | {key: (.path | sub("^.*/"; "") | sub("\\.ya?ml$"; "")),
                           value: .state}] | from_entries' 2>/dev/null || echo '{}')"

  # one runs query per stage rather than per issue - the run list is the same
  # for every candidate at that stage.
  local runs_by_stage='{}' stage runs
  for stage in $STAGES; do
    runs="$(gh run list --repo "$REPO" --workflow "harnext-$stage.yml" --limit 60 \
      --json status,conclusion,createdAt,displayTitle 2>/dev/null || echo '[]')"
    runs_by_stage="$(jq --arg s "$stage" --argjson r "$runs" \
      '.[$s] = $r' <<<"$runs_by_stage")"
  done

  local candidates
  candidates="$(jq -n \
    --argjson items "$items" \
    --argjson runs "$runs_by_stage" \
    --argjson wf "$wf_states" \
    --arg stages "$STAGES" \
    --arg holds "$HOLD_LABELS" '
    ($stages | split(" ")) as $stage_names
    | ($holds  | split(" ")) as $hold_names
    | [ $items[]
        | (.labels | map(.name)) as $labels
        | { number,
            stages: [ $stage_names[] | select(. as $s | $labels | index("harnext:" + $s)) ],
            holds:  [ $hold_names[]  | select(. as $h | $labels | index($h)) ] }
        | select(.stages != []) ]
    | map(
        . as $c
        | (if ($c.stages | length) == 1 then $c.stages[0] else null end) as $stage
        | ($runs[$stage] // []) as $stage_runs
        | ("harnext " + ($stage // "") + " #" + ($c.number | tostring)) as $mine
        # a run is live if it has not concluded. github reports these as queued,
        # in_progress, waiting, requested or pending depending on where in the
        # lifecycle it sits.
        | ([ $stage_runs[] | select(.status != "completed") ]) as $live
        | $c + {
            stage: $stage,
            stage_disabled:
              (($wf["harnext-" + ($stage // "")] // "") | startswith("disabled")),
            live_mine: [ $live[] | select(.displayTitle == $mine) ] | length,
            # a live run whose title does not carry an issue number cannot be
            # attributed - it predates the run-name change, or github rendered
            # a fallback title. it may well BE this issue, so it protects every
            # candidate at that stage from being parked. a live run attributed
            # to a different issue protects nothing.
            live_unattributable:
              [ $live[]
                | select(.displayTitle | test("^harnext [a-z]+ #[0-9]+$") | not) ] | length,
            last_conclusion:
              ( [ $stage_runs[] | select(.displayTitle == $mine and .status == "completed") ]
                | sort_by(.createdAt) | last | .conclusion ) }
      )' <<<"$items")" || return 1

  # the moment the stage label landed, which is what the grace window measures
  # against. `updatedAt` is no use - any comment moves it - so this reads the
  # label event out of the timeline, one call per candidate. a candidate whose
  # lookup fails keeps a null and classify refuses to park on an unknown age.
  local stamps
  stamps="$(
    jq -r '.[] | "\(.number)\t\(.stage // "")"' <<<"$candidates" \
    | while IFS=$'\t' read -r num stage; do
        [ -n "$stage" ] || continue
        printf '%s\t%s\n' "$num" "$(gh api "repos/$REPO/issues/$num/timeline" --paginate \
          --jq "[.[] | select(.event == \"labeled\" and .label.name == \"harnext:$stage\")] | last | .created_at" \
          2>/dev/null || true)"
      done \
    | jq -R -s 'split("\n") | map(select(length > 0) | split("\t"))
                | map({key: .[0],
                       value: (if (.[1] // "") | (. == "" or . == "null") then null else .[1] end)})
                | from_entries'
  )"

  jq --argjson stamps "$stamps" \
    'map(. + {labeled_at: ($stamps[(.number | tostring)] // null)})' <<<"$candidates"
}

# ---------------------------------------------------------------- classification

classify() {
  jq -r --argjson grace "$GRACE_MINUTES" '
    .[]
    | . as $c
    # more than one stage label means a hand-off left both in place. that is a
    # real defect, but the fix is not a park: one of the two stages is probably
    # live. say it out loud and leave the labels alone.
    | if ($c.stages | length) != 1 then
        "\($c.number)\t-\twarn\tcarries \($c.stages | length) stage labels (\($c.stages | join(", "))) - cannot tell which is live"
      # an operator turned the stage off. no run is coming, and that is the
      # intent - parking on it would fire on every issue that ever reaches the
      # stage. the hand-off into it is what has to learn this, not the watchdog.
      elif ($c.stage_disabled // false) then
        "\($c.number)\t\($c.stage)\tskip\tharnext-\($c.stage).yml is disabled - the stage is off by choice"
      elif ($c.holds | length) > 0 then
        "\($c.number)\t\($c.stage)\tskip\tholding \($c.holds | join(", "))"
      elif ($c.labeled_at == null) then
        "\($c.number)\t\($c.stage)\twarn\tno labelled event found - not parking on an unknown age"
      elif (((now - ($c.labeled_at | fromdateiso8601)) / 60) <= $grace) then
        "\($c.number)\t\($c.stage)\tskip\tlabelled \((((now - ($c.labeled_at | fromdateiso8601)) / 60) | floor))m ago, inside the \($grace)m grace window"
      elif ($c.live_mine > 0) then
        "\($c.number)\t\($c.stage)\tskip\ta \($c.stage) run for it is still live"
      elif ($c.live_unattributable > 0) then
        "\($c.number)\t\($c.stage)\tskip\t\($c.live_unattributable) live \($c.stage) run(s) with no attributable title - assuming one is this issue"
      elif ($c.last_conclusion == null) then
        "\($c.number)\t\($c.stage)\tpark\tno \($c.stage) run was ever created - the dispatch was dropped"
      elif ($c.last_conclusion == "success") then
        "\($c.number)\t\($c.stage)\twarn\tits \($c.stage) run succeeded yet the label is still here - the hand-off did not complete"
      else
        "\($c.number)\t\($c.stage)\tpark\tits last \($c.stage) run ended \($c.last_conclusion) without parking itself"
      end'
}

# ---------------------------------------------------------------- park

park() {
  local num="$1" stage="$2" reason="$3"

  # park label first, and the stage-label delete is GATED on it landing - the
  # same ordering the stage workflows use. an unguarded delete after an add that
  # exhausted its retries leaves no harnext label at all, which is invisible; a
  # stale stage label at least still reads as sitting at that stage.
  gh label create harnext:needs-judgment --repo "$REPO" --color b60205 \
    --description "harnext stage needs human judgment" 2>/dev/null || true

  if gh_retry gh api -X POST "repos/$REPO/issues/$num/labels" \
    -f "labels[]=harnext:needs-judgment" >/dev/null; then
    gh_retry gh api -X DELETE "repos/$REPO/issues/$num/labels/harnext:$stage" >/dev/null || true
  else
    echo "::warning::issue #$num: harnext:needs-judgment never landed - leaving harnext:$stage in place"
    return 1
  fi

  # the comment is half the fix. the whole failure mode is that nothing tells a
  # human, so a silent relabel would only move the silence.
  gh issue comment "$num" --repo "$REPO" --body \
"Parked by the harnext stage watchdog: **$reason**.

The \`harnext:$stage\` stage label was on this issue with no job behind it. A stage
normally parks itself when it fails, but a job that dies before its first step runs
never reaches its own park step - so nothing reported this and the issue would have
sat at \`$stage\` indefinitely.

To restart it, remove \`harnext:needs-judgment\`, re-add \`harnext:$stage\`, and dispatch
the stage:

\`\`\`
gh workflow run harnext-$stage.yml --field issue_number=$num
\`\`\`

If it parks again for the same reason, the problem is upstream of the stage agent." \
    >/dev/null || echo "::warning::issue #$num: parked but the explanatory comment failed to post"
}

# ---------------------------------------------------------------- main

if [ -n "$CANDIDATES_JSON_FILE" ]; then
  candidates="$(cat "$CANDIDATES_JSON_FILE")"
else
  : "${GH_TOKEN:?GH_TOKEN required}"
  candidates="$(collect)"
fi

# never exit non-zero on a bad collection: a red watchdog run is one more thing
# that needs watching, and reporting a clean sweep on missing data would repeat
# the exact silence this exists to break.
if [ -z "$candidates" ] || [ "$candidates" = "[]" ]; then
  if [ -z "$candidates" ]; then
    echo "::warning::could not collect stage-labelled issues - skipping this tick"
  else
    echo "no issues carry a harnext stage label"
  fi
  exit 0
fi

verdicts="$(printf '%s' "$candidates" | classify)"
if [ -z "$verdicts" ]; then
  echo "no stage-labelled issues to reconcile"
  exit 0
fi

parked=0
while IFS=$'\t' read -r num stage verdict reason; do
  [ -n "$num" ] || continue
  case "$verdict" in
    skip)
      echo "#$num ($stage): ok - $reason"
      ;;
    warn)
      echo "::warning::#$num ($stage): $reason"
      ;;
    park)
      echo "#$num ($stage): STALLED - $reason"
      if [ "$DRY_RUN" = "1" ]; then
        echo "  dry run - not parking"
        continue
      fi
      park "$num" "$stage" "$reason" && parked=$((parked + 1))
      ;;
  esac
done <<< "$verdicts"

echo
echo "parked $parked issue(s)"
