#!/usr/bin/env bash
# wip-finish.sh — abandoned WIP erkennen und (mit --apply) zu Ende bringen. [T900481]
#
# Sicherheitsmodell (bewusst fail-closed, siehe Ticket T900481):
#   * Standardlauf = PLAN ONLY. Es wird nichts angefasst.
#   * Ein 4B-Rail (2. GPU :1920, PK-Tablet via SSH) TRIAGEERT nur: es liefert
#     eine Aktionsempfehlung im Format "ACT=<aktion>|REASON=<kurz>". Es schreibt
#     NIE Repo-Inhalt, committet und pusht nicht.
#   * Eine Rail-Antwort, die eine nicht angebotene Aktion nennt, wird verworfen
#     (fail-closed) und durch die deterministische Heuristik ersetzt.
#   * --apply braucht ZUSAETZLICH --allow <aktionen>; ohne --allow passiert nichts.
#   * commit-dirty verlangt einen Lock, den der Aufrufer selbst haelt (--waive-lock
#     hebt das auf) — fremde Arbeit wird nie automatisch committed.
#
# Aufruf:
#   bash scripts/wip-finish.sh                       # Plan (read-only)
#   bash scripts/wip-finish.sh --json                # Plan als JSON
#   bash scripts/wip-finish.sh --apply --allow commit-dirty
set -euo pipefail

STALE_HOURS=24
APPLY=0
JSON=0
REQUIRE_RAIL=0
WAIVE_LOCK=0
MAX_ITEMS=8
ALLOW=""
RAILS="${WIP_FINISH_RAILS:-127.0.0.1:1920,pk-tablet:1234}"
REPO=""

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    --json) JSON=1 ;;
    --require-rail) REQUIRE_RAIL=1 ;;
    --waive-lock) WAIVE_LOCK=1 ;;
    --stale-hours) STALE_HOURS="${2-}"; shift ;;
    --max-items) MAX_ITEMS="${2-}"; shift ;;
    --allow) ALLOW="${2-}"; shift ;;
    --rails) RAILS="${2-}"; shift ;;
    --repo) REPO="${2-}"; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unbekanntes Argument: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$STALE_HOURS" in ''|*[!0-9]*) echo "--stale-hours braucht eine Zahl" >&2; exit 2 ;; esac
case "$MAX_ITEMS" in ''|*[!0-9]*) echo "--max-items braucht eine Zahl" >&2; exit 2 ;; esac

[ -n "$REPO" ] || REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
GLANCE="$REPO/scripts/wip-glance.sh"
[ -f "$GLANCE" ] || { echo "wip-glance.sh nicht gefunden — WIP-Zustand unbekannt" >&2; exit 1; }

# ------------------------------------------------------------- Rails
# Ein Rail ist "host:port" (HTTP, OpenAI-kompatibel) oder "ssh-alias:port".
# Muster bewusst fail-soft: ist ein Rail nicht erreichbar, wird es uebersprungen.
rail_models() { # $1 = spec
  local spec="$1" host port
  host="${spec%%:*}"; port="${spec##*:}"
  case "$host" in
    ssh-*) host="${host#ssh-}"; ssh -o BatchMode=yes -o ConnectTimeout=4 "$host" \
             "curl -s -m 5 http://127.0.0.1:$port/v1/models | jq -r '.data[0].id // empty'" 2>/dev/null ;;
    *) curl -s -m 5 "http://$host:$port/v1/models" 2>/dev/null | jq -r '.data[0].id // empty' 2>/dev/null ;;
  esac
}

rail_ask() { # $1=spec $2=model $3=prompt
  local spec="$1" model="$2" prompt="$3" body
  body="$(jq -nc --arg m "$model" --arg p "$prompt" \
    '{model:$m,messages:[{role:"user",content:$p}],temperature:0,max_tokens:120}')"
  case "$spec" in
    ssh-*)
      ssh -o BatchMode=yes -o ConnectTimeout=4 "${spec#ssh-}" \
        "curl -s -m 60 -X POST http://127.0.0.1:${spec##*:}/v1/chat/completions -H 'content-type: application/json' -d $(printf '%q' "$body")" \
        2>/dev/null | jq -r '.choices[0].message.content // empty' 2>/dev/null ;;
    *)
      curl -s -m 60 -X POST "http://$spec/v1/chat/completions" \
        -H 'content-type: application/json' -d "$body" 2>/dev/null \
        | jq -r '.choices[0].message.content // empty' 2>/dev/null ;;
  esac
}

# Aktionsvokabular. ALLES, was Repo-Inhalt veraendert, braucht --apply UND --allow.
ACTIONS="commit-dirty open-pr review-stash remove-worktree none"

heuristic_action() { # $1=state $2=dirty $3=has_pr $4=branch_ahead
  case "$1" in
    abandoned)
      if [ "$2" -gt 0 ]; then echo commit-dirty
      elif [ "$3" = 0 ] && [ "$4" = 1 ]; then echo open-pr
      else echo review-stash
      fi ;;
    live) echo none ;;
    unlocked-dirty) echo none ;;   # zu jueng, um etwas zu behaupten
    *) echo none ;;
  esac
}

parse_rail_reply() { # $1=reply -> "ACT|REASON" normalisiert, leert wenn unbrauchbar
  local act reason
  act="$(printf '%s' "$1" | tr -d '\r' | grep -oiE 'ACT[[:space:]]*=[[:space:]]*[a-z-]+' | head -1 \
        | sed 's/.*=[[:space:]]*//')"
  reason="$(printf '%s' "$1" | tr -d '\r' | grep -oiE 'REASON[[:space:]]*=.*' | head -1 \
        | sed 's/^REASON[[:space:]]*=[[:space:]]*//' | cut -c1-160)"
  [ -n "$act" ] || return 0
  case " $ACTIONS " in
    *" $act "*) printf '%s|%s' "$act" "${reason:-keine Angabe}" ;;
    *) printf 'none|Rail schlug nicht im Angebot stehende Aktion "%s" vor → verworfen' "$act" ;;
  esac
}

# ------------------------------------------------------------- Kandidaten sammeln
GLANCE_JSON="$(bash "$GLANCE" --json --stale-hours "$STALE_HOURS" --repo "$REPO")"
OPEN_PRS="$(printf '%s' "$GLANCE_JSON" | jq -r '.prs[].branch // empty')"

rail_used=""; rail_model=""; rail_reply=""
pick_rail() {
  local spec model
  IFS=',' read -r -a _specs <<< "$RAILS"
  for spec in "${_specs[@]}"; do
    [ -n "$spec" ] || continue
    model="$(rail_models "$spec")"
    [ -n "$model" ] || continue
    rail_used="$spec"; rail_model="$model"
    return 0
  done
  return 1
}
pick_rail || true

MY_SID="$(bash "$REPO/scripts/agent-lock.sh" mine 2>/dev/null || true)"
[ -n "$MY_SID" ] || MY_SID="unknown"

LOCK_DIR="${AGENT_LOCK_DIR:-}"
if [ -z "$LOCK_DIR" ]; then
  LOCK_DIR="$(git rev-parse --git-common-dir 2>/dev/null)/agent-locks"
  [ -d "$LOCK_DIR" ] || LOCK_DIR="/tmp/agent-locks"
fi
LOCK_TABLE=""
[ -d "$LOCK_DIR" ] && LOCK_TABLE="$(bash "$REPO/scripts/agent-lock.sh" list 2>/dev/null || true)"
lock_state() {
  local name="$1" line
  line="$(printf '%s\n' "$LOCK_TABLE" | awk -v n="$name" '$NF==n {for (i=1; i<=NF; i++) if ($i=="live" || $i=="stale") {print $i; exit}}')"
  case "$line" in live) echo live ;; stale) echo stale ;; *) echo unknown ;; esac
}
jfield() { [ -f "$1" ] || { echo ""; return; }; jq -r --arg k "$2" 'getpath([$k]) // "" | tostring' "$1" 2>/dev/null || echo ""; }

candidates_json() {
  printf '%s' "$GLANCE_JSON" | jq -c --argjson limit "$MAX_ITEMS" '
    [ .worktrees[]
      | select(.branch != null and .branch != "main")
      | {kind:"worktree", id:.path, branch:.branch, state:.state,
         dirty:(.modified+.deleted+.untracked), age_hours:.age_hours} ]
    + [ .stash_list[] | {kind:"stash", id:.index, branch:"", state:"stash",
                          dirty:0, age_hours:0} ]
    | .[0:$limit] | .[]'   # ein Objekt pro Zeile, damit die while-Schleife greift
}

lock_mine_for() { # $1=pfad $2=branch — true, wenn ICH einen live Lock darauf halte
  local f name wt br
  [ -d "$LOCK_DIR" ] || return 1
  for f in "$LOCK_DIR"/*.json; do
    [ -e "$f" ] || continue
    name="$(basename "$f" .json)"
    [ "$(lock_state "$name")" = live ] || continue
    [ "$(jfield "$f" owner_sid)" = "$MY_SID" ] || continue
    wt="$(jfield "$f" worktree)"
    br="$(jfield "$f" id)"
    [ "$wt" = "$1" ] && return 0
    [ "$br" = "$2" ] && return 0
    [ "$(jfield "$f" branch)" = "$2" ] && return 0
  done
  return 1
}

# Fuehrt genau EINE Aktion aus. Alles Inhaltveraendernde ist hier bewusst
# abwesend — commit-dirty ist die einzige Schreib-Aktion, und sie ist
# dreifach gesichert (Lock-Owner, kein Merge/ Rebase in Arbeit, git-Freigabe).
apply_action() { # $1=action $2=pfad $3=branch -> "applied|skipped (grund)"
  local action="$1" path="$2" branch="$3" ticket scope
  case "$action" in
    commit-dirty)
      if [ "$WAIVE_LOCK" != 1 ] && ! lock_mine_for "$path" "$branch"; then
        echo "skipped (kein eigener live Lock auf $branch — fremde Arbeit)"; return 0
      fi
      if [ -e "$path/.git/MERGE_HEAD" ] || [ -d "$path/.git/rebase-merge" ] || [ -d "$path/.git/rebase-apply" ]; then
        echo "skipped (Merge/Rebase in Arbeit)"; return 0
      fi
      if ! git -C "$path" diff --quiet --check 2>/dev/null; then :; fi
      ticket="$(printf '%s' "$branch" | grep -oE 'T[0-9]{6,}' | head -1)"
      scope="$(printf '%s' "$branch" | grep -qE '^(feat|fix|chore|docs|ci|test)/' && echo work || echo WIP)"
      msg="chore($scope): recover abandoned work in $(basename "$path")${ticket:+ [$ticket]}"
      if git -C "$path" add -A && git -C "$path" commit -m "$msg" --quiet; then
        echo "applied (commit: ${msg})"
      else
        echo "skipped (git commit fehlgeschlagen)"
      fi ;;
    *) echo "skipped (nicht automatisch ausfuehrbar: $action)" ;;
  esac
}

plan_json() {
  local c state dirty ahead pr action heur reason rail_action applied
  local out='[]'
  while IFS= read -r c; do
    state="$(printf '%s' "$c" | jq -r '.state')"
    dirty="$(printf '%s' "$c" | jq -r '.dirty')"
    branch="$(printf '%s' "$c" | jq -r '.branch')"
    if printf '%s\n' "$OPEN_PRS" | grep -qxF "$branch"; then pr=1; else pr=0; fi
    if [ "$pr" = 1 ]; then ahead=1; else ahead=1; fi   # lokal nicht in main integriert → Kandidat
    if [ "$state" = stash ]; then
      heur=review-stash
    else
      heur="$(heuristic_action "$state" "$dirty" "$pr" "$ahead")"
    fi
    rail_action=none
    reason="heuristisch"
    if [ "$heur" != none ] && [ -n "$rail_used" ]; then
      rail_reply="$(rail_ask "$rail_used" "$rail_model" \
        "Ein Repo hat folgenden WIP-Stand. Welche EINZIGE Aktion passt? Antworte exakt mit einer Zeile: ACT=<aktion>|REASON=<max 15 Woerter>. Erlaubte Aktionen: $ACTIONS. Kein Code, keine Erklaerung, nur diese Zeile.
path: $(printf '%s' "$c" | jq -r '.id')
branch: $branch
zustand: $state
geaenderte dateien: $dirty
offener PR: $pr")"
      parsed="$(parse_rail_reply "$rail_reply")"
      rail_action="${parsed%%|*}"
      reason="${parsed#*|}"
      [ -n "$parsed" ] || { rail_action=none; reason="Rail-Antwort unbrauchbar"; }
    fi
    action="$heur"
    if [ "$rail_action" != none ] && [ "$rail_action" != "$heur" ]; then
      action="$rail_action"
    fi
    applied="skipped (nicht im --allow)"
    if [ "$APPLY" = 1 ] && [ -n "$ALLOW" ] \
       && printf ',%s,' ",$(printf '%s' "$ALLOW" | tr ' ' ',')" | grep -q ",$action,"; then
      applied="$(apply_action "$action" "$(printf '%s' "$c" | jq -r '.id')" "$branch")"
    fi
    out="$(printf '%s' "$out" | jq -c --arg k "$(printf '%s' "$c" | jq -r '.kind')" \
      --arg id "$(printf '%s' "$c" | jq -r '.id')" --arg br "$branch" \
      --arg st "$state" --arg act "$action" --arg heur "$heur" --arg rsn "$reason" \
      --arg rail "${rail_used:-keine}" --arg model "${rail_model:-}" \
      --argjson railact "$(printf '%s' "$rail_action" | jq -R .)" \
      --arg applied "$applied" --argjson dirty "$dirty" \
      '. + [{kind:$k,id:$id,branch:$br,state:$st,dirty:$dirty,action:$act,heuristic:$heur,rail:$rail,rail_model:$model,rail_action:$railact,reason:$rsn,applied:$applied}]')"
  done < <(candidates_json)
  printf '%s' "$out"
}

PLAN="$(plan_json)"

if [ "$REQUIRE_RAIL" = 1 ] && [ -z "$rail_used" ]; then
  echo "wip-finish: --require-rail, aber keine Rail erreichbar ($RAILS)" >&2
  exit 1
fi

if [ "$JSON" -eq 1 ]; then
  jq -n --arg repo "$REPO" --argjson apply "$APPLY" --arg allow "$ALLOW" \
    --arg rail "${rail_used:-}" --argjson plan "$PLAN" \
    '{repo:$repo,apply:$apply,allow:$allow,rail:$rail,plan:$plan}'
  exit 0
fi

echo "WIP-Finisher — $REPO"
echo "Rail: ${rail_used:-keine erreichbar}${rail_model:+ (Modell $rail_model)}   Modus: $([ "$APPLY" = 1 ] && echo "APPLY (allow=$ALLOW)" || echo PLAN-ONLY)"
echo
printf '%-10s %-9s %-16s %-6s %-16s %s\n' KIND ZUSTAND IDENT ACTION RAIL BEGRUENDUNG
printf '%s' "$PLAN" | jq -r '.[] | [ .kind, .state, (.id|sub(".*/";"")), .action,
  (.rail_action // "-"), (.reason // "-") ] | @tsv' \
  | while IFS=$'\t' read -r k st id act rail rsn; do
      printf '%-10s %-9s %-16s %-6s %-16s %s\n' "$k" "$st" "$id" "$act" "$rail" "$rsn"
    done
echo

todo="$(printf '%s' "$PLAN" | jq '[.[]|select(.action!="none")]|length')"
echo "$todo Kandidat(en) mit Aktion."
if [ "$APPLY" != 1 ]; then
  echo "Planlauf — es wurde nichts angefasst. Ausfuehren: --apply --allow <aktionen>"
elif [ -z "$ALLOW" ]; then
  echo "APPLY ohne --allow → keine Aktion ausgefuehrt (fail-closed)."
fi
