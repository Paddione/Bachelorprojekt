#!/usr/bin/env bash
# scripts/repo-hygiene-precheck.sh — Vorcheck fuer repo-hygiene-Laeufe [T900016].
#
# Das Runbook (.claude/skills/references/repo-hygiene-ops.md §0/§1) prueft vor
# Aufraeumentscheidungen bisher nur, ob ein Factory-Tick laeuft. Das deckt die
# Fehlerklasse nicht ab: eine INTERAKTIVE Fremdsession mutiert das Repo ohne
# /tmp/factory-tick.lock. Am 2026-08-30 geschah das zweimal in einem Lauf —
# einmal ein `git reset` auf origin/main, einmal ein Branch-Wechsel, der einen
# Commit auf einem fremden Branch landen liess.
#
# Zwei Ergaenzungen:
#   1. Der `main-checkout`-Claim aus scripts/agent-lock.sh wird geprueft. Der
#      Scope existiert genau fuer diesen Konflikt und wurde bisher nicht
#      aufgerufen (waehrend beider Vorfaelle: null aktive Claims).
#   2. Ein Stabilitaets-Fingerabdruck. Er erkennt die Mutation am ERGEBNIS
#      statt am Verursacher — das traegt auch fuer Quellen, die hier niemand
#      aufgezaehlt hat.
#
# Verwendung:
#   bash scripts/repo-hygiene-precheck.sh              # Vorcheck, rc 0 = frei
#   fp=$(bash scripts/repo-hygiene-precheck.sh --snapshot)
#   ...Messung...
#   bash scripts/repo-hygiene-precheck.sh --verify "$fp"   # rc 1 = Drift
#
# Exit: 0 = unbedenklich, 1 = Befund (Fremdmutation moeglich/erfolgt),
#       2 = nicht pruefbar (Vorbedingung fehlt).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

# Fingerabdruck des beobachtbaren Repo-Zustands. Bewusst nur Dinge, die eine
# Fremdsession veraendert: HEAD, Branch, Worktrees, lokale Branch-Refs. NICHT
# der Arbeitsbaum-Inhalt — der aendert sich waehrend eigener Arbeit staendig.
snapshot() {
  {
    git rev-parse HEAD 2>/dev/null || echo "no-head"
    git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-branch"
    git worktree list --porcelain 2>/dev/null | grep -E '^(worktree|branch) ' | sort
    git for-each-ref --format='%(refname) %(objectname)' refs/heads 2>/dev/null | sort
  } | sha256sum | cut -d' ' -f1
}

tick_running() {
  test -f /tmp/factory-tick.lock || return 1
  (flock -n 9 2>/dev/null && return 1 || return 0) 9>/tmp/factory-tick.lock
}

case "${1:-}" in
  --snapshot)
    snapshot
    exit 0
    ;;
  --verify)
    expected="${2:-}"
    if [ -z "$expected" ]; then
      echo "repo-hygiene-precheck: --verify braucht einen Fingerabdruck" >&2
      exit 2
    fi
    actual="$(snapshot)"
    if [ "$actual" = "$expected" ]; then
      echo "repo-hygiene-precheck: Zustand stabil seit dem Snapshot."
      exit 0
    fi
    echo "repo-hygiene-precheck: DRIFT — das Repo hat sich seit dem Snapshot geaendert." >&2
    echo "  erwartet=$expected" >&2
    echo "  jetzt   =$actual" >&2
    echo "  Die Messung ist damit kein Messwert mehr. Vor der Aufraeumentscheidung" >&2
    echo "  neu messen; git reflog zeigt, was dazwischenkam." >&2
    exit 1
    ;;
  ""|--check)
    :
    ;;
  *)
    echo "Usage: repo-hygiene-precheck.sh [--check | --snapshot | --verify <fingerprint>]" >&2
    exit 2
    ;;
esac

rc=0

if tick_running; then
  echo "BEFUND: Factory-Tick laeuft (/tmp/factory-tick.lock gehalten)."
  echo "  Worktrees und Branches mutieren waehrend der Messung. Sektion ueberspringen"
  echo "  oder die Pruefung unmittelbar vor jedem Remove wiederholen."
  rc=1
else
  echo "ok: kein laufender Factory-Tick."
fi

# main-checkout-Claim. `check` gibt free|mine|<Halterdaten> aus.
if [ -x scripts/agent-lock.sh ] || [ -f scripts/agent-lock.sh ]; then
  claim="$(bash scripts/agent-lock.sh check main-checkout 2>/dev/null | head -1)"
  case "$claim" in
    free)
      echo "ok: main-checkout ist nicht beansprucht."
      echo "  Hinweis: 'bash scripts/agent-lock.sh claim main-checkout' beansprucht ihn"
      echo "  fuer diese Session — ohne Claim ist eine Fremdsession jederzeit zulaessig."
      ;;
    mine)
      echo "ok: main-checkout ist von dieser Session beansprucht."
      ;;
    "")
      echo "BEFUND: agent-lock.sh lieferte keine Antwort — Claim-Status unbekannt (fail-closed)." >&2
      rc=1
      ;;
    *)
      echo "BEFUND: main-checkout wird von einer ANDEREN Session gehalten." >&2
      echo "  $claim" >&2
      echo "  Nicht auf dem Hauptcheckout aufraeumen; mit der haltenden Session koordinieren" >&2
      echo "  oder in einem eigenen Worktree arbeiten." >&2
      rc=1
      ;;
  esac
else
  echo "uebersprungen: scripts/agent-lock.sh nicht gefunden." >&2
fi

echo
echo "Stabilitaets-Fingerabdruck: $(snapshot)"
echo "  Nach der Messung pruefen mit:"
echo "  bash scripts/repo-hygiene-precheck.sh --verify <fingerabdruck>"

exit "$rc"
