#!/usr/bin/env bats
# T002908 — `scripts/openspec.sh propose --help` gibt Hilfe aus statt in den
# Ticket-Guard zu laufen.
#
# Hintergrund: `propose --help` nimmt `--help` als <slug> an, durchlaeuft die
# Optionsschleife ohne Treffer und schlaegt am Guard in cmd_propose auf
# (`[[ -n "$ticket" ]] || die "propose requires --ticket <ext-id>"`). Wer die
# Optionen nachschlagen will, bekommt eine Fehlermeldung ueber eine ANDERE
# Option. Dasselbe Problem wurde in scripts/worktree-create.sh unter T002783
# behoben: `--help` wird dort VOR allen Guards behandelt und beendet mit 0.
# Die bestehende Requirement "Unbekannter Verb wird mit Fehler und Usage
# abgewiesen" (openspec/specs/openspec-workflow.md) deckt nur den Verb-Fall ab,
# nicht die Hilfe einer Unteroption.
#
# Pruefmodus (T002448-M4): command output verification. Jeder Test FUEHRT
# openspec.sh aus und prueft $status, $output und den Zustand des
# Dateisystems danach; keiner greppt Quelltext.
#
# Semantik statt Darstellung (T002716): geprueft wird, DASS eine Usage-Zeile
# und die Optionsnamen erscheinen und der Lauf mit 0 endet — nicht der
# Wortlaut oder das Layout der Hilfe. Substring-Proben ohne Zeilenanker.
#
# Eigenbezug: die Tests laufen ausschliesslich gegen ein temporaeres
# OPENSPEC_ROOT und mit TICKET_OFFLINE=1 — es entsteht nie ein Change unter
# openspec/changes/ des Repos.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  ROOT="$BATS_TEST_TMPDIR/openspec"
  mkdir -p "$ROOT/specs" "$ROOT/changes"
}

_propose() {
  run env OPENSPEC_ROOT="$ROOT" TICKET_OFFLINE=1 \
    bash "$REPO_ROOT/scripts/openspec.sh" propose "$@"
}

# ── Kern: --help ist Hilfe, kein Guard-Fehler ────────────────────────────────

@test "T002908: propose --help endet mit 0 und gibt eine Usage-Zeile aus" {
  _propose --help
  [ "$status" -eq 0 ]
  # Positiv-Anker (T002356-M1): die Ausgabe MUSS eine Usage-Zeile tragen.
  # Ohne diese Zusicherung waere die Negativ-Aussage im naechsten Block
  # auch dann gruen, wenn `--help` einfach gar nichts ausgaebe.
  [ -n "$output" ]
  grep -qi 'usage' <<<"$output"
  # Und sie darf NICHT der Ticket-Guard sein.
  ! grep -qF 'requires --ticket' <<<"$output"
  ! grep -qF 'ERROR:' <<<"$output"
}

@test "T002908: propose --help listet die Optionen von propose auf" {
  _propose --help
  [ "$status" -eq 0 ]
  # Semantische Probe: die drei real existierenden Optionen von cmd_propose
  # tauchen als Namen auf. Formatfrei (grep -qF, keine Zeilenanker) — Layout
  # und Formulierung der Hilfe sind nicht festgeschrieben.
  grep -qF -- '--ticket' <<<"$output"
  grep -qF -- '--target-spec' <<<"$output"
  grep -qF -- '--resume' <<<"$output"
}

@test "T002908: propose --help legt kein Change-Verzeichnis an" {
  _propose --help
  [ "$status" -eq 0 ]
  # Positiv-Anker: das Change-Wurzelverzeichnis existiert ueberhaupt, die
  # folgende Leer-Zusicherung ist also nicht vakuos.
  [ -d "$ROOT/changes" ]
  run bash -c "find '$ROOT/changes' -mindepth 1 | wc -l"
  [ "$output" -eq 0 ]
  [ ! -e "$ROOT/changes/--help" ]
}

# ── Regression: die Guards bleiben fuer echte Aufrufe scharf ─────────────────

@test "T002908: propose ohne --ticket bricht weiterhin mit dem Ticket-Guard ab" {
  _propose realer-slug
  [ "$status" -ne 0 ]
  grep -qF 'requires --ticket' <<<"$output"
  [ ! -d "$ROOT/changes/realer-slug" ]
}

@test "T002908: propose ohne Argumente bricht weiterhin mit dem Slug-Guard ab" {
  # Ohne jedes Argument — `propose --ticket X` erreicht den Slug-Guard nicht,
  # weil `--ticket` dort bereits als <slug> konsumiert wird und der Folgewert
  # als unbekannte Option auflaeuft. Das ist bestehendes Verhalten und nicht
  # Gegenstand dieses Fixes; geprueft wird der erreichbare Slug-Guard.
  _propose
  [ "$status" -ne 0 ]
  grep -qF 'requires <slug>' <<<"$output"
}

@test "T002908: eine unbekannte propose-Option wird weiterhin abgewiesen" {
  _propose slug --frobnicate
  [ "$status" -ne 0 ]
  grep -qF 'Unknown propose option' <<<"$output"
}
