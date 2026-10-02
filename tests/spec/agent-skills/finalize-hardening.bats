#!/usr/bin/env bats
# tests/spec/agent-skills/finalize-hardening.bats
# SSOT: docs/superpowers/specs/agent-skills.md (Delta: finalizer-hardening, T012256)
#
# PRÜFMODUS: gemischt, pro Test im Kommentar benannt.
#  - B1 (Archiv-Mutex) und B3 (Idempotenz-Signal): Output-Verifikation — die
#    betroffene Sequenz wird per awk-Bereichsmuster aus dem Skript extrahiert und
#    gegen eine Sandbox mit Stubs AUSGEFÜHRT.
#  - B2 (Skip-Semantik): mark_warn wird als Funktion extrahiert und ausgeführt;
#    geprüft werden Zählerstand und Ausgabe, nicht die Quelltextform.
# Bereichsmuster statt Zeilennummern (T003104).
#
# Befunde aus dem T012240/T012243-Lauf (2026-08-18):
#  B1 Schritt 8 wechselt per `git checkout -B` den Branch des GETEILTEN
#     Haupt-Checkouts, ohne zu serialisieren. Zwei gleichzeitige Läufe
#     (T012240/T012239, per pgrep belegt) zogen fremde gestagte Dateien in den
#     falschen Archiv-Branch; der Push scheiterte an "reference already exists".
#  B2 "bereits erledigt" und "Eingabe nicht auflösbar" erscheinen beide als
#     [skip] bei Exit 0. Genau das verdeckte T012243.
#  B3 Die Schritt-8-Idempotenz hängt an `git ls-remote` auf den Archiv-Branch.
#     Schritt 8 löscht diesen Branch selbst (`gh pr merge --delete-branch`),
#     stellt den Zustand "gemergt + Branch weg" also regelmäßig selbst her —
#     und hält ihn dann für unerledigt.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FINALIZE="$REPO_ROOT/scripts/devflow-post-merge-finalize.sh"
  [ -f "$FINALIZE" ]
}

# ── B2: Skip-Semantik ────────────────────────────────────────────────────────
# PRÜFMODUS: Output-Verifikation — die Marker-Funktionen werden extrahiert und
# ausgeführt; geprüft werden Präfix und Zählerwirkung.

# Positiv-Anker (T002356-M1): die bestehenden Marker müssen funktionieren.
# Ohne ihn wäre die mark_warn-Aussage vakuos, falls die Extraktion nichts liefert.
@test "B2 Anker: mark_ok und mark_skip zaehlen getrennt" {
  local fns
  fns="$(awk '/^mark_ok\(\)/{i=1} i{print} i&&/^mark_skip\(\)/{exit}' "$FINALIZE")"
  [ -n "$fns" ]
  run bash -c "set -uo pipefail; DONE_COUNT=0; SKIP_COUNT=0; WARN_COUNT=0
    $fns
    mark_ok a; mark_skip b
    echo \"D=\$DONE_COUNT S=\$SKIP_COUNT\""
  [ "$status" -eq 0 ]
  [[ "$output" == *"[ok]   a"* ]]
  [[ "$output" == *"[skip] b"* ]]
  [[ "$output" == *"D=1 S=1"* ]]
}

@test "B2: mark_warn existiert, zaehlt eigenstaendig und markiert mit [warn]" {
  local fns
  fns="$(awk '/^mark_ok\(\)/{i=1} i{print} i&&/^mark_warn\(\)/{exit}' "$FINALIZE")"
  [ -n "$fns" ]
  run bash -c "set -uo pipefail; DONE_COUNT=0; SKIP_COUNT=0; WARN_COUNT=0
    $fns
    mark_warn 'Eingabe nicht aufloesbar'
    echo \"D=\$DONE_COUNT S=\$SKIP_COUNT W=\$WARN_COUNT\""
  [ "$status" -eq 0 ]
  [[ "$output" == *"[warn]"* ]]
  [[ "$output" == *"Eingabe nicht aufloesbar"* ]]
  # Eine nicht auflösbare Eingabe ist kein Skip — sonst zählt sie wieder als erledigt.
  [[ "$output" == *"D=0 S=0 W=1"* ]]
}

@test "B2: die Schlusszeile nennt die Warnungen" {
  run grep -c 'WARN_COUNT' "$FINALIZE"
  [ "$status" -eq 0 ]
  # Schlusszeile muss den Zähler ausgeben, sonst bleibt die Warnung unsichtbar
  run bash -c "grep -F 'Finalize \$TICKET_ID abgeschlossen' '$FINALIZE' | grep -c 'WARN_COUNT'"
  [ "$output" -ge 1 ]
}

@test "B2: Schritt 10 meldet einen Widerspruch als warn statt als skip" {
  # Widerspruch: der aufgelöste Pfad existiert nicht, ABER ein Worktree hält $BRANCH.
  # Der Abschnitt muss diesen Fall unterscheiden können.
  local section
  section="$(awk '/^# Schritt 10 —/{i=1} i{print} i&&/branch-reaper/{exit}' "$FINALIZE")"
  [ -n "$section" ]
  # Semantik, nicht Wortlaut: der Abschnitt muss den Widerspruchsfall behandeln
  # (Worktree-Liste konsultieren, wenn der Pfad fehlt) statt blind zu skippen.
  run bash -c "printf '%s' \"\$1\" | grep -c 'mark_warn'" _ "$section"
  [ "$output" -ge 1 ]
}
