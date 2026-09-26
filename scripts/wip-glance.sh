#!/usr/bin/env bash
# wip-glance.sh — WIP auf einen Blick (read-only). [T900481]
#
# Sammelt den Arbeitsstand des Repos an EINER Stelle:
#   1. Worktrees (Branch, Dirty-Dateien, Alter des letzten Commits)
#   2. Agent-Locks (live/stale laut scripts/agent-lock.sh)
#   3. Lokale Branches ohne Upstream-Merge und ohne offenen PR
#   4. Offene Pull Requests (gh, optional)
#   5. Stashes
#
# Aendert NICHTS. Kein Lock, kein Branch, kein Working Tree wird angefasst.
# Aufruf: bash scripts/wip-glance.sh [--json] [--quiet] [--stale-hours N] [--repo PATH]

set -euo pipefail

STALE_HOURS=24
JSON=0
QUIET=0
REPO=""

while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=1 ;;
    --quiet) QUIET=1 ;;
    --stale-hours) STALE_HOURS="${2-}"; shift ;;
    --repo) REPO="${2-}"; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unbekanntes Argument: $1" >&2; exit 2 ;;
  esac
  shift
done

case "$STALE_HOURS" in ''|*[!0-9]*) echo "--stale-hours braucht eine Zahl" >&2; exit 2 ;; esac

if [ -z "$REPO" ]; then
  REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi
cd "$REPO"
NOW="$(date +%s)"

# ---------------------------------------------------------------- Locks
# Liveness ist die SSOT von agent-lock.sh (STATE-Spalte, Spalte 5). Wir lesen
# die Lock-JSONs direkt (Identifying-Fields) und uebernehmen nur den STATE.
LOCK_DIR=""
if [ -n "${AGENT_LOCK_DIR:-}" ]; then
  LOCK_DIR="$AGENT_LOCK_DIR"
else
  LOCK_DIR="$(git rev-parse --git-common-dir 2>/dev/null)/agent-locks"
  [ -d "$LOCK_DIR" ] || LOCK_DIR="/tmp/agent-locks"
fi
LOCK_TABLE=""
if [ -d "$LOCK_DIR" ]; then
  LOCK_TABLE="$(bash "$REPO/scripts/agent-lock.sh" list 2>/dev/null || true)"
fi

lock_state() { # $1 = lock file basename -> live|stale|unknown
  local name="$1" line
  # Positionsunabhaengig: der STATE ist immer exakt 'live' oder 'stale'.
  # Eine feste Spalte waere falsch — leere Felder (z. B. label) fallen in awk zusammen.
  line="$(printf '%s\n' "$LOCK_TABLE" | awk -v n="$name" '$NF==n {for (i=1; i<=NF; i++) if ($i=="live" || $i=="stale") {print $i; exit}}')"
  case "$line" in
    live) echo live ;;
    stale) echo stale ;;
    *) echo unknown ;;
  esac
}

jfield() { # $1=file $2=key  (jq 1.7 kann .[$k] nicht — deshalb getpath)
  [ -f "$1" ] || { echo ""; return; }
  jq -r --arg k "$2" 'getpath([$k]) // "" | tostring' "$1" 2>/dev/null || echo ""
}

# JSON-Array der Locks
locks_json() {
  local f name state
  printf '['
  local first=1
  if [ -d "$LOCK_DIR" ]; then
    for f in "$LOCK_DIR"/*.json; do
      [ -e "$f" ] || continue
      name="$(basename "$f" .json)"
      state="$(lock_state "$name")"
      [ $first -eq 1 ] || printf ','
      first=0
      jq -c -n --arg scope "$(jfield "$f" scope)" --arg id "$(jfield "$f" id)" \
        --arg state "$state" --arg label "$(jfield "$f" label)" \
        --arg worktree "$(jfield "$f" worktree)" --arg ticket "$(jfield "$f" ticket)" \
        '{scope:$scope,id:$id,state:$state,label:$label,worktree:$worktree,ticket:$ticket}'
    done
  fi
  printf ']'
}

live_lock_for() { # $1 = worktree path, $2 = branch -> true wenn live Lock darauf zeigt
  local f name wt br
  if [ -d "$LOCK_DIR" ]; then
    for f in "$LOCK_DIR"/*.json; do
      [ -e "$f" ] || continue
      name="$(basename "$f" .json)"
      [ "$(lock_state "$name")" = live ] || continue
      wt="$(jfield "$f" worktree)"
      br="$(jfield "$f" id)"
      if [ -n "$1" ] && [ "$wt" = "$1" ]; then return 0; fi
      if [ -n "$2" ] && { [ "$br" = "$2" ] || [ "$(jfield "$f" branch)" = "$2" ]; }; then return 0; fi
    done
  fi
  return 1
}

# ---------------------------------------------------------------- Worktrees
wt_json() {
  local path head branch attached locked prunable
  local modified deleted untracked dirty last age state
  printf '['
  local first=1
  while read -r line; do
    case "$line" in
      worktree\ *) path="${line#worktree }"; head=""; branch=""; attached=0; locked=0; prunable=0
        ;;
      HEAD\ *) head="${line#HEAD }" ;;
      branch\ *) branch="${line#branch }"; branch="${branch#refs/heads/}"; attached=1 ;;
      detached) attached=0 ;;
      locked*) locked=1 ;;
      prunable*) prunable=1 ;;
      "") # Trennzeile -> Datensatz abschliessen
        if [ -n "$path" ]; then
          modified=0; deleted=0; untracked=0
          if [ -d "$path" ]; then
            while read -r st; do
              case "$st" in
                '??'*) untracked=$((untracked + 1)) ;;
                'D '*|*' D'*) deleted=$((deleted + 1)) ;;
                *) modified=$((modified + 1)) ;;
              esac
            done < <(git -C "$path" status --porcelain 2>/dev/null || true)
          fi
          dirty=$((modified + deleted + untracked))
          last="$(git -C "$path" log -1 --format=%ct 2>/dev/null || echo "$NOW")"
          age=$(( (NOW - last) / 3600 ))
          if [ "$attached" -eq 1 ] && live_lock_for "$path" "$branch"; then
            state=live
          elif [ "$dirty" -gt 0 ] && [ "$age" -ge "$STALE_HOURS" ]; then
            state=abandoned
          elif [ "$dirty" -gt 0 ]; then
            state=unlocked-dirty
          else
            state=idle
          fi
          [ $first -eq 1 ] || printf ','
          first=0
          jq -c -n --arg path "$path" --arg branch "$branch" --arg head "${head:0:9}" \
            --arg state "$state" --argjson modified "$modified" --argjson deleted "$deleted" \
            --argjson untracked "$untracked" --argjson locked "$locked" \
            --argjson prunable "$prunable" --argjson age_hours "$age" \
            '{path:$path,branch:$branch,head:$head,state:$state,modified:$modified,deleted:$deleted,untracked:$untracked,locked:$locked,prunable:$prunable,age_hours:$age_hours}'
        fi
        path="" ;;
    esac
    # Die abschliessende Leerzeile erzwingt den Flush auch dann, wenn der
    # Porcelain-Output keinen eigenen Trenner mitbringt (sonst ginge der
    # letzte Datensatz verloren).
  done < <({ git worktree list --porcelain 2>/dev/null || true; printf '\n'; })
  printf ']'
}

# ---------------------------------------------------------------- Branches
branches_json() {
  local br ahead age merged pr
  printf '['
  local first=1
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    while read -r br; do
      [ -n "$br" ] || continue
      [ "$br" = main ] && continue
      age=$(( (NOW - $(git log -1 --format=%ct "origin/$br" 2>/dev/null || echo "$NOW")) / 86400 ))
      unmerged=0
      git merge-base --is-ancestor "refs/heads/$br" origin/main 2>/dev/null || unmerged=1
      [ $first -eq 1 ] || printf ','
      first=0
      jq -c -n --arg branch "$br" --argjson age_days "$age" --argjson unmerged "$unmerged" \
        '{branch:$branch,age_days:$age_days,unmerged:$unmerged}'
    done < <(git for-each-ref --format='%(refname:short)' refs/heads/ | sort)
  fi
  printf ']'
}

prs_json() {
  command -v gh >/dev/null 2>&1 || { echo '[]'; return; }
  gh pr list --state open --limit 30 \
    --json number,title,headRefName,isDraft,updatedAt 2>/dev/null \
    | jq -c '[.[] | {number, title, branch:.headRefName, draft:.isDraft, updated:.updatedAt}]' 2>/dev/null \
    || echo '[]'
}

stashes_json() {
  git stash list --format='%gd|%ci|%s' 2>/dev/null \
    | awk -F'|' '{printf "%s%s{index:\"%s\",date:\"%s\",subject:\"%s\"}", (NR>1?",":""), "", $1, $2, $3}'
  :
}

# ---------------------------------------------------------------- Ausgabe
WT_JSON="$(wt_json)"
LOCKS_JSON="$(locks_json)"
PRS_JSON="$(prs_json)"
BRANCHES_JSON="$(branches_json)"
STASHES_RAW="$(git stash list --format='%gd|%ci' 2>/dev/null || true)"
STASH_COUNT="$(printf '%s\n' "$STASHES_RAW" | grep -c . || true)"
STASHES_JSON="$(printf '%s\n' "$STASHES_RAW" | awk -F'|' '
  BEGIN { printf "[" }
  NF   { n++; if (n>1) printf ","; printf "{\"index\":\"%s\",\"date\":\"%s\"}", $1, $2 }
  END   { printf "]" }')"
[ -n "$STASHES_JSON" ] || STASHES_JSON='[]'


if [ "$JSON" -eq 1 ]; then
  jq -n --arg repo "$REPO" --argjson stale_hours "$STALE_HOURS" \
    --argjson worktrees "$WT_JSON" --argjson locks "$LOCKS_JSON" \
    --argjson prs "$PRS_JSON" --argjson branches "$BRANCHES_JSON" \
    --argjson stashes "$STASHES_JSON" \
    '{repo:$repo,stale_hours:$stale_hours,worktrees:$worktrees,locks:$locks,prs:$prs,branches:$branches,stashes:($stashes|length),stash_list:$stashes}'
  exit 0
fi

if [ "$QUIET" -eq 1 ]; then
  printf 'abandoned=%s dirty=%s live_locks=%s open_prs=%s stashes=%s\n' \
    "$(printf '%s' "$WT_JSON" | jq '[.[]|select(.state=="abandoned")]|length')" \
    "$(printf '%s' "$WT_JSON" | jq '[.[]|select(.modified+.deleted+.untracked>0)]|length')" \
    "$(printf '%s' "$LOCKS_JSON" | jq '[.[]|select(.state=="live")]|length')" \
    "$(printf '%s' "$PRS_JSON" | jq 'length')" \
    "$STASH_COUNT"
  exit 0
fi

echo "WIP-Glance — $REPO (stale ab ${STALE_HOURS}h)"
echo
printf '%-8s %-38s %-14s %6s %6s %6s %8s\n' STATE WORKTREE BRANCH MOD DEL UNTR AGE_H
printf '%s' "$WT_JSON" | jq -r '.[] | [ .state,
  (.path | sub(".*/"; "")), (.branch // "-"), (.modified|tostring), (.deleted|tostring),
  (.untracked|tostring), (.age_hours|tostring) ] | @tsv' \
  | while IFS=$'\t' read -r st path br mod del untr age; do
      printf '%-8s %-38s %-14s %6s %6s %6s %8s\n' "$st" "$path" "$br" "$mod" "$del" "$untr" "$age"
    done
echo
echo "Locks:"
printf '%s' "$LOCKS_JSON" | jq -r 'if length==0 then "  (keine)" else (.[] | "  \(.state)  \(.scope):\(.id)  \(.label)") end'
echo
echo "Offene PRs:"
printf '%s' "$PRS_JSON" | jq -r 'if length==0 then "  (keine)" else (.[] | "  #\(.number) \(if .draft then "[draft] " else "" end)\(.branch) — \(.title)") end'
echo
echo "Lokale Branches:"
printf '%s' "$BRANCHES_JSON" | jq -r 'if length==0 then "  (keine)" else (.[] | "  \(.branch)  (letzter Commit vor \(.age_days)d)") end'
echo
echo "Stashes: $STASH_COUNT"
echo
echo "Nächster Schritt: bash scripts/wip-finish.sh --dry-run   (räumt Nichts ohne --apply)"
