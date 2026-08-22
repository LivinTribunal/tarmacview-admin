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

# blank out fenced code blocks and inline code spans, preserving line numbers.
# documentation *about* a rule quotes the thing the rule forbids; that is not a
# violation of it. personal data is deliberately NOT filtered this way - a real
# address is leaked whether or not it sits in a code block.
strip_code() {
  case "$1" in
    *.md) python3 -c '
import re, sys
fence = False
for line in open(sys.argv[1], encoding="utf8", errors="replace").read().split("\n"):
    if re.match(r"\s*(```|~~~)", line):
        fence = not fence
        print(); continue
    print("" if fence else re.sub(r"`[^`]*`", "", line))
' "$1" ;;
    *) cat "$1" ;;
  esac
}

# ---------------------------------------------------------------------------
# 2. AI attribution — forbidden in commits, PRs and code alike
# ---------------------------------------------------------------------------
for f in "${EXISTING[@]}"; do
  case "$f" in scripts/check-conventions.sh) continue ;; esac
  if strip_code "$f" | grep -nEi 'co-authored-by:[[:space:]]*claude|generated with \[?claude|🤖 generated' >/dev/null 2>&1; then
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
  done < <(strip_code "$f" | grep -oE '\]\([^)]+\)' 2>/dev/null | sed 's/^](\(.*\))$/\1/')
done

# ---------------------------------------------------------------------------
# 4. protected files
# ---------------------------------------------------------------------------
# only meaningful against a diff - in a full-tree sweep every protected file is
# "present", which says nothing about whether anyone touched it.
if [[ "${1:-}" != "--all" ]]; then
  # read the list from harness.config.json rather than hardcoding it. a second copy of
  # the list here drifts silently, and the failure mode is the worst kind: the config
  # says a file is protected, the gate never checks it, and everything reports green.
  PROTECTED_RE="$(python3 -c '
import json, re, sys
try:
    pats = json.load(open("harness.config.json")).get("protected_files") or []
except Exception:
    sys.exit(1)
parts = []
for p in pats:
    # glob -> regex: ** spans directories, * stays within a segment
    rx = re.escape(p).replace(r"\*\*/", "@@ANY@@").replace(r"\*\*", "@@ANY@@").replace(r"\*", "[^/]*")
    rx = rx.replace("@@ANY@@", ".*")
    parts.append(rx if rx.endswith(".*") else rx + "$")
print("^(" + "|".join(parts) + ")" if parts else "")
' 2>/dev/null)"

  if [[ -z "$PROTECTED_RE" ]]; then
    fail "could not read protected_files from harness.config.json — the protected-file gate is not running"
    PROTECTED_RE='^(\.github/workflows/|harness\.config\.json$)'
  fi

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

# ---------------------------------------------------------------------------
# 6. § section references resolve
#
# the § half of section 3. a § reference is usually what carries an Observed or Inferred
# marking's evidence, and a marking whose pointer does not resolve is worth less than no
# marking - it looks like provenance and is not.
#
# numeric §N and §§N-M point at doc 05's numbered tabs and are left alone deliberately.
# the script excludes itself, as sections 1 and 2 do. belt and braces rather than load-
# bearing: a non-markdown host's unqualified references are skipped anyway.
# ---------------------------------------------------------------------------
SECTION_FILES=()
for f in "${EXISTING[@]}"; do
  case "$f" in scripts/check-conventions.sh) continue ;; esac
  SECTION_FILES+=("$f")
done

if [[ ${#SECTION_FILES[@]} -gt 0 ]]; then
  if SECTION_OUT="$(python3 -c '
import glob, os, re, sys

# a wrapped reference is joined before matching: the newline and any line-leading comment
# marker become spaces of equal length, so byte offsets - and the reported line - survive.
JOIN = re.compile(r"\n([ \t]*(?://+|--+|\*(?!\*))?)")
# no whitespace after the section sign. nothing in the tree writes one, and allowing it makes
# ordinary prose about the mechanism parse as a reference to a section called "section".
REF  = re.compile(r"§(?:\"(?P<quoted>[^\"\n]{1,200}?)\"|(?P<bare>[A-Za-z][A-Za-z0-9-]*))")
NAME = re.compile(r"(?:\]\((?P<link>[^)\s]+\.md)\)|`(?P<tick>[^`\s]+\.md)`|(?P<plain>[\w./-]+\.md)|\bdocs?\.?\s+(?P<num>\d{1,2}))[\s(\[]*$", re.I)
HEAD = re.compile(r"(?m)^#{1,6}[ \t]+(.+)$")
BOLD = re.compile(r"(?m)^[ \t]*(?:[-*+][ \t]+)?(?=\*\*[^*\s])")
CONT = re.compile(r"[\s,;]*(?:and|or|&|/)?\s*")
FENCE = re.compile(r"^[ \t]*(?:```|~~~)")
SPAN  = re.compile(r"`[^`\n]*`")
Q = "\""

def read(path):
    return open(path, encoding="utf8", errors="replace").read()

# fenced blocks are blanked before matching, for the reason strip_code gives: documentation
# about this rule quotes the unresolvable references the rule forbids, and that is not a
# violation of it. blanking is space-for-space so byte offsets - and the reported line -
# survive.
def mask_fences(text):
    out, fence = [], False
    for line in text.split("\n"):
        if FENCE.match(line):
            fence = not fence
            out.append(" " * len(line))
        else:
            out.append(" " * len(line) if fence else line)
    return "\n".join(out)

# the pair to it - fences out, spans in, except a span that opens the reference, because a
# § inside a span is a mention of the syntax (`§X` in prose about this rule) and not a
# citation. blanking spans wholesale as strip_code does would instead manufacture fourteen
# false failures, because the repo cites titles that *contain* a span with the § outside it
# - §"`period` is false in three different situations" and seven more. the cost is that a
# genuine citation written as `§"Data endpoint"` goes unchecked; nothing in the tree writes
# one. markdown hosts only, as with the fences: a backtick in .ts opens a template literal.
def span_mask(text):
    mask = bytearray(len(text))
    for m in SPAN.finditer(text):
        mask[m.start():m.end()] = b"\x01" * (m.end() - m.start())
    return mask

def norm(s):
    s = re.sub(r"[`*]", "", s)
    s = re.sub(r"^\d+\s*·\s*", "", s.strip())
    return re.sub(r"\s+", " ", s).strip().casefold()

# headings and bold lead-ins are both reference targets, because the repo cites both. a
# lead-in may wrap, so it is read to the end of its paragraph.
def targets(path):
    try:
        text = read(path)
    except OSError:
        return []
    out = [norm(m.group(1)) for m in HEAD.finditer(text)]
    for m in BOLD.finditer(text):
        lead = re.match(r"\*\*(.+?)\*\*", re.sub(r"\s+", " ", text[m.end():].split("\n\n")[0]))
        if lead:
            out.append(norm(lead.group(1)))
    return out

# the target is the file named immediately before the § - a link, a backticked path, a bare
# path, or "doc NN". nothing adjacent means this file, for a markdown host; in any other
# host an unqualified reference names no file and is skipped.
def named(host, before):
    m = NAME.search(before)
    if not m:
        return host if host.endswith(".md") else None
    if m.group("num"):
        hit = sorted(glob.glob("docs/specs/%02d-*.md" % int(m.group("num"))))
        return hit[0] if hit else None
    p = m.group("link") or m.group("tick") or m.group("plain")
    for c in (os.path.normpath(os.path.join(os.path.dirname(host), p)), p):
        if os.path.isfile(c):
            return c
    return None

cache = {}
for f in sys.argv[1:]:
    try:
        raw = read(f)
    except OSError:
        continue
    if "§" not in raw:
        continue
    md = f.endswith(".md")
    masked = mask_fences(raw) if md else raw
    spans = span_mask(masked) if md else bytearray(len(raw))
    joined = JOIN.sub(lambda m: " " * len(m.group(0)), masked)
    end, prev = -1, None
    for m in REF.finditer(joined):
        if spans[m.start()]:
            continue
        title = m.group("quoted") or m.group("bare")

        # a run of references shares the one file named before the first of them
        gap = joined[end:m.start()]
        if end >= 0 and len(gap) <= 12 and CONT.fullmatch(gap):
            target = prev
        else:
            target = named(f, joined[max(0, m.start() - 160):m.start()])
        end, prev = m.end(), target
        if target is None:
            continue
        if target not in cache:
            cache[target] = targets(target)

        # prefix, not exact: §"Mode 3" cites "Mode 3 - Manual entry", which is the repo style
        want = norm(title)
        where = "%s:%d" % (f, raw.count("\n", 0, m.start()) + 1)
        shown = "§" + (Q + title + Q if m.group("quoted") else title)
        if not any(t.startswith(want) for t in cache[target]):
            print("F\t%s — %s names no heading or bold lead-in in %s" % (where, shown, target))
        elif any(t.startswith(want + " in the rebuild") or t.startswith("the " + want + " in the rebuild")
                 for t in cache[target]):
            print("W\t%s — %s resolves to the Observed capture; %s also carries the decided subsection"
                  % (where, shown, target))
' "${SECTION_FILES[@]}")"; then
    while IFS=$'\t' read -r level message; do
      case "$level" in
        F) fail "$message" ;;
        W) warn "$message" ;;
      esac
    done <<< "$SECTION_OUT"
  else
    fail "the § reference resolver did not run — section references are unchecked"
  fi
fi

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
