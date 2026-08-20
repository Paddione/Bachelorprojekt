#!/usr/bin/env bats
#
# SSOT: openspec/specs/ticket-system.md
# Ticket: T012972 — `ticket list --status` nimmt eine Komma-Liste
#
# PRUEFMODUS: Command-Output-Verifikation (T002448-M4). Die Tests FUEHREN
# `ticket.sh list` gegen die echte Datenbank AUS und pruefen dessen JSON-Ausgabe.
# Es wird NICHT der Quelltext von list.sh gegreppt.
#
# WARUM DIESE ZUSICHERUNG: Ein Aufrufer, der mehrere Status braucht, hat zwei
# naheliegende Formen — ein zweites --status-Flag oder eine Komma-Liste. Die
# Flag-Form ist eine STILLE Falle: die Argumentschleife in vda/ticket/list.sh
# ueberschreibt den Wert bei jedem Vorkommen, der Aufrufer bekaeme also die
# Treffer des LETZTEN Werts und keinen Fehler. Eine plausible Teilmenge ist der
# schlimmste Ausgang, weil sie wie Erfolg aussieht. Deshalb loest die
# Komma-Liste unten in der WHERE-Klausel auf, und Test 3 haelt fest, dass die
# Flag-Form NICHT die Vereinigung liefert — damit niemand sie fuer aequivalent haelt.
#
# POSITIV-ANKER (T002356-M1): Test 1 belegt, dass beide gesaeten Zeilen ueber
# einen EINZELNEN Status ueberhaupt auffindbar sind. Ohne ihn bestuenden die
# Aussagen darunter vakuos — eine Implementierung, die nichts zurueckgibt,
# wuerde eine reine "enthaelt nicht"-Pruefung ebenfalls bestehen.
#
# Die Fixtures werden ueber tests/lib/factory-test-fixtures.sh erzeugt und in
# teardown_file gepurgt.

load "../../lib/factory-test-fixtures.sh"

_skip_if_no_db() {
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1)
  [[ -n "$_pod" ]] || skip "kein erreichbarer shared-db-Pod — DB-gestuetzter Test uebersprungen"
}

setup_file() {
  export TICKET_TEST_BRAND="mentolder"
  export SEEDED_BACKLOG="$BATS_FILE_TMPDIR/seeded_backlog"
  export SEEDED_TRIAGE="$BATS_FILE_TMPDIR/seeded_triage"
  # Ausdrueckliches Opt-in wie in list-test-data-filter.bats: _ticket-core.sh zeigt
  # unter BATS sonst auf den Sentinel-Kontext, damit Tests nicht versehentlich
  # echte Tickets schreiben.
  export TICKET_TEST_DB_OK=1
}

teardown_file() {
  purge_factory_test_data "mentolder" >/dev/null 2>&1 || true
}

_repo_root() { cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd; }

# Zwei Fixtures: eine bleibt backlog, eine wird auf triage gehoben. Beide sind
# is_test_data — jede Abfrage unten fuehrt deshalb --include-test-data.
_seed_pair() {
  local root; root="$(_repo_root)"
  if [[ ! -s "$SEEDED_BACKLOG" ]]; then
    seed_test_feature "mentolder" > "$SEEDED_BACKLOG"
  fi
  if [[ ! -s "$SEEDED_TRIAGE" ]]; then
    seed_test_feature "mentolder" > "$SEEDED_TRIAGE"
    BRAND=mentolder bash "$root/scripts/ticket.sh" update-status \
      --id "$(cat "$SEEDED_TRIAGE")" --status triage >/dev/null
  fi
}

_list() {
  local root; root="$(_repo_root)"
  BRAND=mentolder bash "$root/scripts/ticket.sh" list \
    --brand mentolder --include-test-data --limit 500 "$@"
}

@test "T012972 Positiv-Anker: jede Fixture ist ueber ihren EINZELNEN Status auffindbar" {
  _skip_if_no_db
  _seed_pair
  local b t; b="$(cat "$SEEDED_BACKLOG")"; t="$(cat "$SEEDED_TRIAGE")"

  run _list --status backlog
  [ "$status" -eq 0 ]
  # Ausgabe sofort auswerten — der folgende `run` ueberschreibt $output.
  [ "$(printf '%s' "$output" | grep -c "$b")" -ge 1 ]

  run _list --status triage
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | grep -c "$t")" -ge 1 ]
}

@test "T012972: eine Komma-Liste liefert die Vereinigung beider Status" {
  _skip_if_no_db
  _seed_pair
  local b t; b="$(cat "$SEEDED_BACKLOG")"; t="$(cat "$SEEDED_TRIAGE")"

  run _list --status backlog,triage
  [ "$status" -eq 0 ]
  # Beide Zeilen stehen in DERSELBEN Antwort — das ist die Zusicherung.
  [ "$(printf '%s' "$output" | grep -c "$b")" -ge 1 ]
  [ "$(printf '%s' "$output" | grep -c "$t")" -ge 1 ]
}

@test "T012972: Leerzeichen in der Liste aendern das Ergebnis nicht" {
  _skip_if_no_db
  _seed_pair
  local b t; b="$(cat "$SEEDED_BACKLOG")"; t="$(cat "$SEEDED_TRIAGE")"

  run _list --status "backlog, triage"
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | grep -c "$b")" -ge 1 ]
  [ "$(printf '%s' "$output" | grep -c "$t")" -ge 1 ]
}

@test "T012972: zwei --status-Flags liefern NICHT die Vereinigung (die Falle)" {
  _skip_if_no_db
  _seed_pair
  local b t; b="$(cat "$SEEDED_BACKLOG")"; t="$(cat "$SEEDED_TRIAGE")"

  run _list --status backlog --status triage
  [ "$status" -eq 0 ]
  # Der LETZTE Wert gewinnt: die triage-Zeile ist da (Positiv-Anker dieser Aussage),
  # die backlog-Zeile fehlt. Festgehalten, damit die Flag-Form nicht faelschlich
  # als gleichwertige Schreibweise gilt — wer beide Status will, nimmt die Komma-Liste.
  [ "$(printf '%s' "$output" | grep -c "$t")" -ge 1 ]
  [ "$(printf '%s' "$output" | grep -c "$b")" -eq 0 ]
}
