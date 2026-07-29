#!/usr/bin/env bash
# scripts/agent-collision.sh — active live edit-collision warning. [T000882]
#
# Warns when the files you are about to commit are ALSO in-flight in another
# LIVE agent session's worktree. Pure local bash — no cluster, no DB → offline-
# and CI-safe. Complements scripts/factory/conflict-check.sh (DB-based, Factory
# scheduling) and agent-lock.sh (the passive mutex), without changing either.
#
# Discovery: reads agent-lock.sh's own claim store (the JSON files it writes),
# because `agent-lock.sh list` does not expose the worktree path and agent-lock.sh
# must stay unchanged. Honours the same overrides: AGENT_LOCK_DIR, AGENT_LOCK_SID,
# AGENT_LOCK_FAKE_ALIVE.
#
# Exit: 0 = no collision (or fail-open), 1 = collision(s) found.
set -uo pipefail

_my_sid() {
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local s; s="$(ps -o sess= -p "$$" 2>/dev/null | tr -d ' ')"
  if [ -n "$s" ]; then printf '%s\n' "$s"; return; fi
  local stat rest; stat="$(cat /proc/self/stat 2>/dev/null)"; rest="${stat##*) }"
  # shellcheck disable=SC2086
  set -- $rest; printf '%s\n' "${4:-0}"
}

_sid_alive() {
  [ -n "${1:-}" ] || return 1
  if [ -n "${AGENT_LOCK_FAKE_ALIVE+x}" ]; then
    case " $AGENT_LOCK_FAKE_ALIVE " in *" $1 "*) return 0;; *) return 1;; esac
  fi
  # Spiegelt scripts/agent-lock.sh:_sid_alive [T001268]: nicht-numerische SIDs sind
  # harness-vergebene Session-IDs (CLAUDE_SESSION_ID), die `pgrep -s` nicht aufloesen
  # kann. Bei Aenderung dort HIER nachziehen — Guard: der Drift-Test in
  # tests/spec/software-factory/collision-window.bats vergleicht beide Urteile.
  case "$1" in *[!0-9]*) return 0;; esac
  pgrep -s "$1" >/dev/null 2>&1
}

_lock_dir() {
  if [ -n "${AGENT_LOCK_DIR:-}" ]; then printf '%s\n' "$AGENT_LOCK_DIR"; return; fi
  local cd; cd="$(git rev-parse --git-common-dir 2>/dev/null)" || { printf '/tmp/agent-locks\n'; return; }
  case "$cd" in /*) : ;; *) cd="$(cd "$cd" && pwd)";; esac
  printf '%s/agent-locks\n' "$cd"
}

_field() { sed -n "s/.*\"$2\": *\"\\([^\"]*\\)\".*/\\1/p" "$1" 2>/dev/null | head -1; }

# Entfernt Pfade, die .gitattributes als `linguist-generated=true` fuehrt. [T002375-p6]
# Die Muster stehen dort in der ersten Spalte; `**`-Globs werden auf ein Praefix reduziert.
_drop_generated() {
  local list="$1" ga pat
  ga="$(git rev-parse --show-toplevel 2>/dev/null)/.gitattributes"
  [ -f "$ga" ] || { printf '%s\n' "$list"; return 0; }
  while IFS= read -r pat; do
    [ -n "$pat" ] || continue
    case "$pat" in
      *'**') list="$(printf '%s\n' "$list" | grep -v -- "^${pat%'**'}" || true)" ;;
      *)     list="$(printf '%s\n' "$list" | grep -vxF -- "$pat" || true)" ;;
    esac
  done < <(awk '/linguist-generated=true/{print $1}' "$ga")
  printf '%s\n' "$list" | sed '/^$/d'
}

cmd_check() {
  local mode=staged quiet=0
  while [ $# -gt 0 ]; do case "$1" in
    --staged) mode=staged;; --all) mode=all;; --branch) mode=branch;; --quiet) quiet=1;; *) ;;
  esac; shift; done

  local own; own="$(git diff --cached --name-only 2>/dev/null)"
  if [ "$mode" = "all" ]; then
    own="$(printf '%s\n%s\n' "$own" "$(git diff --name-only HEAD 2>/dev/null)")"
  fi
  if [ "$mode" = "branch" ]; then
    # [T002455] origin/main statt main: der lokale main-Ref kann hinter origin/main liegen,
    # sodass main...HEAD eine zu alte Merge-Base verwendet. Ein Peer-Worktree auf aktuellem
    # origin/main zeigt dann alle zwischenzeitlich gemergten Commits als vermeintlich eigene
    # Änderungen — Fehlalarme. Fallback auf main bei detached HEAD / fehlendem Remote.
    local base_ref="main"
    git rev-parse --verify origin/main >/dev/null 2>&1 && base_ref="origin/main"
    own="$( { git diff --name-only "${base_ref}...HEAD" 2>/dev/null; \
              git diff --name-only HEAD 2>/dev/null; \
              git diff --cached --name-only 2>/dev/null; } | sed '/^$/d' | sort -u )"
  fi
  own="$(printf '%s\n' "$own" | sed '/^$/d' | sort -u)"
  # [T002375-p6] Generierte Artefakte aus der Kollisionspruefung nehmen. Sie werden von
  # praktisch jedem Lauf angefasst — allen voran website/src/data/openspec-status.json,
  # das jeder `openspec propose` neu schreibt. In T002341-M2 kamen so sechs
  # COLLISION-Warnungen zustande, von denen nur diese eine Datei eine echte Ueberschneidung
  # war; echte Kollisionen gehen in solchem Rauschen unter.
  #
  # Quelle ist .gitattributes (`linguist-generated=true`) — die Liste wird NICHT dupliziert,
  # sonst laeuft sie auseinander. Fehlt die Datei oder greift kein Muster, bleibt alles beim
  # Alten (fail-open, wie der ganze Detektor).
  own="$(_drop_generated "$own")"
  [ -n "$own" ] || return 0

  local mysid d; mysid="$(_my_sid)"; d="$(_lock_dir)"
  [ -d "$d" ] || return 0

  local found=0 f sid pid wt peer file
  declare -A seen
  for f in "$d"/*.json; do
    [ -e "$f" ] || continue
    sid="$(_field "$f" owner_sid)"
    pid="$(_field "$f" owner_pid)"
    [ -n "$pid" ] && [ "$pid" = "$$" ] && continue
    _sid_alive "$sid" || continue
    wt="$(_field "$f" worktree)"
    [ -n "$wt" ] && [ "$wt" != "-" ] && [ -d "$wt" ] || continue
    git -C "$wt" rev-parse --git-dir >/dev/null 2>&1 || continue
    # Drei-Punkt gegen den Merge-Base: nur was DIESER Branch geaendert hat.
    # [T002455] origin/main statt main (analog own-Seite oben), Fallback auf main.
    # Schlaegt die Aufloesung fehl (detached HEAD, fehlender Branch), entfaellt
    # nur der committete Anteil — der Working-Tree-Anteil laeuft weiter (fail-open).
    local peer_base="main"
    git -C "$wt" rev-parse --verify origin/main >/dev/null 2>&1 && peer_base="origin/main"
    peer="$( { git -C "$wt" diff --name-only "${peer_base}...HEAD" 2>/dev/null; \
               git -C "$wt" diff --name-only HEAD 2>/dev/null; \
               git -C "$wt" diff --cached --name-only 2>/dev/null; } | sed '/^$/d' | sort -u )"
    peer="$(_drop_generated "$peer")"
    [ -n "$peer" ] || continue
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      # M9: Datei muss im Peer existieren — Dateisystem ODER im Git-Index
      if [ ! -f "$wt/$file" ] && ! git -C "$wt" ls-files -- "$file" >/dev/null 2>&1; then continue; fi
      # Squash-Merge: die Peer-Commits sind keine Ancestors von main, main...HEAD listet die
      # Datei weiter — aber wenn der Blob identisch ist, ist nichts mehr offen.
      # Fehlschlagende rev-parse (Datei in main nicht vorhanden) => behalten, nicht verwerfen.
      # WICHTIG: nur ueberspringen, wenn der Peer KEINE uncommitteten Aenderungen an der Datei
      # hat (sonst waere HEAD:file == main:file obwohl der Peer aktiv aendert). [T002444]
      peer_blob="$(git -C "$wt" rev-parse "HEAD:$file" 2>/dev/null || true)"
      main_blob="$(git rev-parse "main:$file" 2>/dev/null || true)"
      if [ "$peer_blob" = "$main_blob" ] && \
         ! git -C "$wt" diff --name-only HEAD -- "$file" 2>/dev/null | grep -q . && \
         ! git -C "$wt" diff --cached --name-only -- "$file" 2>/dev/null | grep -q .; then
        continue
      fi

      # M7: committed only → kein Alarm. Nur uncommitted → Alarm.
      if ! git -C "$wt" diff --name-only HEAD -- "$file" 2>/dev/null | grep -q . && \
         ! git -C "$wt" diff --cached --name-only -- "$file" 2>/dev/null | grep -q .; then
        continue
      fi
      if printf '%s\n' "$peer" | grep -qxF "$file"; then
        if [[ -z "${seen[$file]:-}" ]]; then
          seen[$file]=1
          found=1
          if [ "$quiet" -eq 0 ]; then
            printf '⚠ COLLISION: %s — auch in-flight bei %s/%s (sid %s, worktree %s)\n' \
              "$file" "$(_field "$f" tool)" "$(_field "$f" label)" "$sid" "$wt" >&2
          fi
        fi
      fi
    done <<EOF
$own
EOF
  done
  [ "$found" -eq 0 ]
}

main() {
  local cmd="${1:-}"; shift 2>/dev/null || true
  case "$cmd" in
    check) cmd_check "$@";;
    *) echo "Usage: agent-collision.sh check [--staged|--all|--branch] [--quiet]" >&2; return 2;;
  esac
}
main "$@"
