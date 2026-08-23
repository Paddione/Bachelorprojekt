#!/usr/bin/env bats
# SSOT: openspec/specs/ticket-system.md
# Ticket: T014386 — Die Lesepfade von ticket.sh unterscheiden 'kein Treffer' von
# 'falsche Frage'. Vorher lieferten beide leer mit Exit 0; ein Agent las das als
# "nein" statt als "ungueltige Anfrage".
#
# ENTWURFSREGEL, die diese Datei absichert: Die Filter-Validierung laeuft VOR dem
# Verbindungsaufbau zur Datenbank. Das ist kein Detail — CI hat keine Ticket-DB
# (`grep -c shared-db .github/workflows/ci.yml` = 0), und ein Guard hinter dem
# Verbindungsaufbau waere dort dauerhaft uebersprungen statt wirksam. Genau diese
# Maskierung ist als T014384 offen. Die Tests unten laufen deshalb OHNE DB.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  TICKET_SH="${REPO_ROOT}/scripts/ticket.sh"
}

# Der Guard fragt die CLI selbst, nicht kubectl: nur so haengt er an derselben
# Bedingung wie der getestete Code. Ein kubectl-Probe fand den Pod, waehrend
# ticket.sh ihn nicht aufloesen konnte — der Test lief dann gegen eine DB, die
# er nicht erreichte, und die Aussage war wertlos.
_skip_if_no_db() {
  local _probe
  _probe=$(bash "$TICKET_SH" list --limit 1 2>/dev/null || true)
  [[ "$_probe" == "["* ]] || skip "ticket.sh erreicht keine DB — DB-gestuetzter Test uebersprungen (CI hat keine Ticket-DB)"
}

# ── Positiv-Anker (ohne DB gueltig) ─────────────────────────────────────────
# Belegen, dass die CLI laeuft und dass ein GUELTIGER Wert die Validierung
# passiert. Ohne diese Anker waeren die Negativ-Aussagen vakuos: eine CLI, die
# an allem scheitert, wuerde sie zufaellig erfuellen — genau das ist beim
# Entwurf dieses Tests einmal passiert.

@test "Anker: ticket.sh help antwortet mit Exit 0" {
  run bash "$TICKET_SH" help
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "Anker: ein gueltiger Status passiert die Validierung" {
  run bash "$TICKET_SH" list --status done --limit 1
  # Ob danach eine DB antwortet, ist hier egal — die Validierung darf nicht
  # gemeckert haben.
  [[ "$output" != *"ungueltiger Status"* ]]
  [[ "$output" != *"Unknown --status"* ]]
}

@test "Anker: eine gueltige Komma-Liste passiert die Validierung (T012972)" {
  run bash "$TICKET_SH" list --status "done,archived" --limit 1
  [[ "$output" != *"ungueltiger Status"* ]]
  [[ "$output" != *"Unknown --status"* ]]
}

@test "Anker: Leerzeichen in der gueltigen Liste passieren die Validierung" {
  run bash "$TICKET_SH" list --status "done, archived" --limit 1
  [[ "$output" != *"ungueltiger Status"* ]]
  [[ "$output" != *"Unknown --status"* ]]
}

# ── Zusicherungen: Filter-Validierung, ohne DB wirksam ──────────────────────

@test "list --status mit unbekanntem Wert endet mit Exit 2 (Bedienfehler)" {
  run bash "$TICKET_SH" list --status bogusxyz
  [ "$status" -eq 2 ]
}

@test "list --status open endet mit Exit 2 — 'open' ist kein definierter Status" {
  # 'open' wird intuitiv erwartet und stand sogar als Beispiel im
  # Code-Kommentar von list.sh (T012972), gehoert aber nicht zum 11er-Enum.
  run bash "$TICKET_SH" list --status open
  [ "$status" -eq 2 ]
}

@test "die Fehlermeldung nennt die gueltigen Status" {
  run bash "$TICKET_SH" list --status bogusxyz
  [[ "$output" == *"triage"* ]]
  [[ "$output" == *"plan_staged"* ]]
  [[ "$output" == *"archived"* ]]
}

@test "die Fehlermeldung nennt den abgelehnten Wert" {
  run bash "$TICKET_SH" list --status bogusxyz
  [[ "$output" == *"bogusxyz"* ]]
}

@test "eine Liste mit einem ungueltigen Glied wird ganz abgelehnt" {
  run bash "$TICKET_SH" list --status "done,bogusxyz"
  [ "$status" -eq 2 ]
  [[ "$output" == *"bogusxyz"* ]]
}

@test "list --type mit unbekanntem Wert endet mit Exit 2" {
  run bash "$TICKET_SH" list --type bogusxyz
  [ "$status" -eq 2 ]
}

@test "list --attention-mode mit unbekanntem Wert endet mit Exit 2" {
  run bash "$TICKET_SH" list --attention-mode bogusxyz
  [ "$status" -eq 2 ]
}

@test "die Validierung braucht keine Datenbank" {
  # Kern der Entwurfsregel: mit unerreichbarer DB muss der Bedienfehler
  # trotzdem als Exit 2 erkannt werden — nicht als Verbindungsfehler.
  run env KUBECONFIG=/nonexistent-for-this-test bash "$TICKET_SH" list --status bogusxyz
  [ "$status" -eq 2 ]
  [[ "$output" == *"bogusxyz"* ]]
}

# ── Zusicherung: get auf ein nicht existierendes Ticket (braucht DB) ────────

@test "get --id auf ein nicht existierendes Ticket endet nicht mit Exit 0" {
  _skip_if_no_db
  run bash "$TICKET_SH" get --id T999999
  [ "$status" -ne 0 ]
  [ "$status" -ne 2 ]   # kein Bedienfehler — die Anfrage war wohlgeformt
}

@test "get --id nennt die nicht gefundene ID in der Meldung" {
  _skip_if_no_db
  run bash "$TICKET_SH" get --id T999999
  [[ "$output" == *"T999999"* ]]
}

@test "get --id auf ein existierendes Ticket bleibt Exit 0 mit JSON" {
  _skip_if_no_db
  # Positiv-Anker zur Aussage darueber: das Ticket dieses Fixes selbst.
  run bash "$TICKET_SH" get --id T014386
  [ "$status" -eq 0 ]
  [[ "$output" == *"T014386"* ]]
}
