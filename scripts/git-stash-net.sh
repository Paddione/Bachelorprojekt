#!/usr/bin/env bash
# scripts/git-stash-net.sh — nachrichtenbasierte Stash-Auflösung. [T003070]
#
# WARUM NACH MESSAGE, NICHT NACH INDEX:
# `refs/stash` liegt im gemeinsamen Git-Verzeichnis (`git rev-parse
# --git-common-dir`) — der Stash-Stack ist über ALLE Worktrees des Repos
# geteilt, und die Indizes stash@{N} verschieben sich durch fremde
# push/pop/drop-Aktionen. Ein Eintrag, der beim Anlegen stash@{0} war, kann
# beim Popen längst stash@{2} sein. Auflösung über die Nachricht
# (git stash push -m "<ticket-id> ...") ist worktree-übergreifend eindeutig.
#
# TEIL-POP-BEFUND (T003069): `git stash pop` kann Erfolg melden, obwohl der
# Eintrag nur teilweise angewendet wurde (der post-rewrite-Hook hat ein
# gestashtes Freshness-Artefakt während des Rebase bereits neu erzeugt und
# droppt den Eintrag nicht). Deshalb zählt dieses Skript die Treffer VOR und
# NACH dem Pop: verschwindet der eigene Eintrag nicht, ist das ein BEFUND —
# kein Erfolg — und der Eintrag bleibt als Sicherungsnetz erhalten.
#
# Exit-Codes (wie git-worktree-health.sh / worktree-clean-check.sh):
#   0 = ok (Eintrag gefunden und vollständig angewendet/entfernt)
#   1 = BEFUND (Teil-Pop: Eintrag nicht verschwunden — Wiederherstellungspfad unten)
#   2 = kein Eintrag gefunden (Fail-Closed — kein stilles "nichts gefunden = Erfolg")
set -uo pipefail

usage() {
  cat >&2 <<'EOF'
usage: git-stash-net.sh <cmd> [args]

  find --by-ticket <id>        Stash-Einträge auflisten, deren Nachricht die
                               Ticket-ID trägt (case-insensitiv, tXXXXXX wird
                               auf TXXXXXX normalisiert). Ausgabe je Treffer:
                               <index> <message>. Kein Treffer → Exit 2.
  pop --by-message <pattern>   Eintrag per Nachricht-Regex auflösen und popen —
                               NIE über den Index stash@{N}. Positive
                               Verifikation danach: Eintrag weg → 0, Eintrag
                               noch da → 1 (Teil-Pop-Befund, bleibt als
                               Sicherungsnetz), kein Treffer → 2.
  drop --by-message <pattern>  Eintrag per Nachricht-Regex auflösen und entfernen —
                               NIE über den Index stash@{N}. Mehrdeutig (mehrere
                               Treffer) → 3, nichts entfernt; kein Treffer → 2.
                               Positive Verifikation danach: Eintrag weg → 0,
                               Eintrag noch da → 1 (BEFUND, bleibt erhalten).
EOF
  exit 2
}

# Normalisiert die Ticket-ID auf die Form T[0-9]{6} (t003070 → T003070).
_ticket_normalized() {
  local id="$1"
  case "$id" in
    [Tt][0-9][0-9][0-9][0-9][0-9][0-9]) printf 'T%s\n' "${id:1}" ;;
    *) printf '%s\n' "$id" ;;
  esac
}

_stash_entries() { git stash list --format='%gd|%gs' 2>/dev/null; }

# Erste Index, dessen Nachricht das Muster matcht. $1 = Regex.
_find_idx() {  # -> <stash@{N}>; 0/1
  local pattern="$1" idxv msg
  while IFS='|' read -r idxv msg; do
    if printf '%s\n' "$msg" | grep -qiE -- "$pattern"; then
      printf '%s\n' "$idxv"
      return 0
    fi
  done < <(_stash_entries)
  return 1
}

# Anzahl der Einträge, deren Nachricht das Muster matcht. $1 = Regex.
_count_matches() {  # -> <anzahl>
  local pattern="$1" idxv msg c=0
  while IFS='|' read -r idxv msg; do
    if printf '%s\n' "$msg" | grep -qiE -- "$pattern"; then c=$((c + 1)); fi
  done < <(_stash_entries)
  printf '%d\n' "$c"
}

cmd_find() {
  local id="$1" norm idxv msg hits=0
  norm="$(_ticket_normalized "$id")"
  while IFS='|' read -r idxv msg; do
    if printf '%s\n' "$msg" | grep -qiF -- "$norm"; then
      printf '%s %s\n' "$idxv" "$msg"
      hits=$((hits + 1))
    fi
  done < <(_stash_entries)
  if [ "$hits" -eq 0 ]; then
    echo "git-stash-net: kein Stash-Eintrag mit Ticket '$norm' gefunden (Exit 2, Fail-Closed)." >&2
    return 2
  fi
  return 0
}

cmd_pop() {
  local pattern="$1" idx before after pop_status
  idx="$(_find_idx "$pattern")" || {
    echo "git-stash-net: kein Stash-Eintrag für Muster '$pattern' gefunden (Exit 2, Fail-Closed)." >&2
    return 2
  }
  before="$(_count_matches "$pattern")"
  # Pop ausführen — Ausgabe sichtbar lassen, Exit-Code getrennt von Pipes messen.
  git stash pop "$idx"
  pop_status=$?
  after="$(_count_matches "$pattern")"
  if [ "$after" -eq 0 ]; then
    echo "git-stash-net: Eintrag $idx vollständig angewendet und entfernt (positive Verifikation)." >&2
    return 0
  fi
  {
    echo "BEFUND: Stash-Eintrag $idx wurde NICHT vollständig angewendet (Teil-Pop, git-Exit $pop_status)."
    echo "  Der Eintrag bleibt als Sicherungsnetz im Stash-Stack erhalten — nichts geht verloren."
    echo "  Wiederherstellung einzelner Dateien:  git checkout \"$idx\" -- <pfad>"
    echo "  Konfliktanalyse:                      git stash show --stat \"$idx\""
    echo "  Statistik des Sicherungsnetzes:"
    git stash show --stat "$idx"
  } >&2
  return 1
}

# Message des Eintrags zu einem Index ($1 = stash@{N}) — nur zur Anzeige (D3),
# keine Auflösung: der Index kommt immer aus _find_idx.
_msg_of() {  # -> <message>; 0/1
  local idx="$1" line
  line="$(_stash_entries | grep -F -- "$idx|" | head -n 1)" || return 1
  printf '%s\n' "${line#*|}"
}

cmd_drop() {
  local pattern="$1" idx before after drop_status msg
  idx="$(_find_idx "$pattern")" || {
    echo "git-stash-net: kein Stash-Eintrag für Muster '$pattern' gefunden (Exit 2, Fail-Closed)." >&2
    return 2
  }
  before="$(_count_matches "$pattern")"
  # Eindeutigkeit VOR dem Drop — mehrdeutig heißt: nichts entfernen (D2).
  if [ "$before" -gt 1 ]; then
    {
      echo "git-stash-net: Muster '$pattern' ist mehrdeutig — $before Einträge matchten, nichts entfernt (Exit 3)."
      echo "  Treffer (je <index> <message>):"
      _stash_entries | grep -iE -- "$pattern" | tr '|' ' '
    } >&2
    return 3
  fi
  # Operatoren-Sichtbarkeit: aufgelöster Index UND Message vor dem Drop (D3).
  msg="$(_msg_of "$idx")"
  echo "git-stash-net: entferne $idx ('$msg') — aufgelöst per Message-Muster '$pattern'." >&2
  # Drop ausführen — Ausgabe sichtbar lassen, Exit-Code getrennt von Pipes messen.
  git stash drop "$idx"
  drop_status=$?
  after="$(_count_matches "$pattern")"
  if [ "$after" -eq 0 ]; then
    echo "git-stash-net: Eintrag $idx entfernt (positive Verifikation)." >&2
    return 0
  fi
  {
    echo "BEFUND: Stash-Eintrag $idx wurde NICHT entfernt (git-Exit $drop_status)."
    echo "  Der Eintrag bleibt im Stash-Stack erhalten — kein Verlust, erneuter Aufruf möglich."
  } >&2
  return 1
}

CMD="${1:-}"
case "$CMD" in
  find)
    [ "${2:-}" = "--by-ticket" ] && [ -n "${3:-}" ] || usage
    cmd_find "$3"
    ;;
  pop)
    [ "${2:-}" = "--by-message" ] && [ -n "${3:-}" ] || usage
    cmd_pop "$3"
    ;;
  drop)
    [ "${2:-}" = "--by-message" ] && [ -n "${3:-}" ] || usage
    cmd_drop "$3"
    ;;
  *) usage ;;
esac
