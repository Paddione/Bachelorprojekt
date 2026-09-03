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
#
# [T900061] Der Lock-Test faellt selbst unter 2: unter Git Bash auf Windows ist
# er nicht durchfuehrbar (flock scheitert am fd-Redirect, und /tmp zeigt dort
# ohnehin nicht auf die Lock-Datei der Factory unter WSL). Frueher lief dieser
# Fehler in denselben Zweig wie "Lock gehalten" und meldete auf jedem
# Windows-Host dauerhaft einen laufenden Tick. Ein nicht durchfuehrbarer Test
# ist kein Befund — er wird als solcher ausgewiesen. Ein echter Befund
# (fremder main-checkout-Claim) behaelt Vorrang und liefert weiterhin 1.

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

# [T012414] Pfad ueberschreibbar (wie scripts/repo-hygiene-cron.sh); der Default
# bleibt der geteilte Pfad, an dem die Absprache mit der Factory haengt.
FACTORY_TICK_LOCK="${FACTORY_TICK_LOCK:-/tmp/factory-tick.lock}"

# Ist der fd-Redirect-Lock-Test in DIESER Shell ueberhaupt durchfuehrbar?
# [T900061] Unter Git Bash auf Windows ist er es nicht: `flock -n 9` bricht mit
# "Bad file descriptor" ab. Der alte Test fing diesen Fehler nicht vom Fall
# "Lock gehalten" ab (beides landete im `|| return 0`-Zweig) und meldete auf
# jedem Windows-Host dauerhaft einen laufenden Tick. Die Sonde trennt beides.
flock_usable() {
  command -v flock >/dev/null 2>&1 || return 1
  local probe
  probe="$(mktemp 2>/dev/null)" || return 1
  local rc=1
  # Frische Datei, von niemandem gehalten: gelingt flock hier nicht, liegt es
  # an der Shell/Plattform und nicht am Lock-Zustand.
  if (flock -n 9) 9<>"$probe" 2>/dev/null; then rc=0; fi
  rm -f "$probe"
  return "$rc"
}

# 0 = Tick laeuft, 1 = kein Tick, 2 = nicht pruefbar.
# `9<>` statt `9>`: der alte Redirect legte die Lock-Datei an bzw. kuerzte sie
# auf 0 Byte — der blosse Vorcheck schrieb damit an fremdem Lock-Zustand herum.
tick_state() {
  test -f "$FACTORY_TICK_LOCK" || return 1
  flock_usable || return 2
  if (flock -n 9) 9<>"$FACTORY_TICK_LOCK" 2>/dev/null; then return 1; fi
  return 0
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
unknown=0

tick_state
case "$?" in
  0)
    echo "BEFUND: Factory-Tick laeuft ($FACTORY_TICK_LOCK gehalten)."
    echo "  Worktrees und Branches mutieren waehrend der Messung. Sektion ueberspringen"
    echo "  oder die Pruefung unmittelbar vor jedem Remove wiederholen."
    rc=1
    ;;
  1)
    echo "ok: kein laufender Factory-Tick."
    ;;
  *)
    echo "NICHT PRUEFBAR: der Factory-Tick laesst sich in dieser Shell nicht messen." >&2
    echo "  'flock -n 9' scheitert hier an der Plattform (Git Bash unter Windows:" >&2
    echo "  'Bad file descriptor'), nicht am Lock-Zustand. Ob ein Tick laeuft, ist" >&2
    echo "  damit unbekannt — es wird KEIN Tick behauptet und keiner ausgeschlossen." >&2
    echo "  Hinzu kommt: Git Bash bildet /tmp auf ein eigenes Verzeichnis ab, dies" >&2
    echo "  ist also ohnehin nicht die Lock-Datei, die die Factory unter WSL haelt." >&2
    echo "  Konsequenz fuers Runbook: die --porcelain-Pruefung unmittelbar vor jedem" >&2
    echo "  Remove wiederholen, statt sich auf diesen Vorcheck zu verlassen." >&2
    unknown=1
    ;;
esac

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

# Ein echter Befund (fremder Claim) ist handlungsleitender als ein nicht
# durchfuehrbarer Teiltest und behaelt darum Vorrang vor rc 2.
if [ "$rc" -ne 0 ]; then
  exit "$rc"
fi
if [ "$unknown" -eq 1 ]; then
  exit 2
fi
exit 0
