#!/usr/bin/env bats
# tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats
# SSOT: openspec/specs/llm-pipeline.md (fix-knowledge-ingest-zero-items-T002605)
# Stellt sicher, dass die Knowledge-Ingest-CronJobs aus dem lebenden
# Ticket-Store lesen (tickets.tickets / tickets.ticket_links) statt aus
# leeren Legacy-Tabellen, den Zero-Item-Guard tragen und der Markdown-
# CronJob suspendiert ist.
#
# PRUEFMODUS: Output-Verifikation (T002448-M4). Die Assertions laufen gegen
# den gerenderten Kustomize-Build von k3d/ — das Artefakt, das Flux
# tatsaechlich anwendet — nicht per grep gegen den Manifest-Quelltext.

REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"

setup_file() {
  export RENDERED="${BATS_FILE_TMPDIR}/rendered-knowledge-live-sources.yaml"
  kubectl kustomize "${REPO}/k3d" --load-restrictor=LoadRestrictionsNone > "$RENDERED" 2>&1
}

@test "ingest-bug-tickets.mjs (ConfigMap) liest tickets.tickets, nicht bugs.bug_tickets" {
  run grep -A 45 "ingest-bug-tickets.mjs" "$RENDERED"
  [ "$status" -eq 0 ] || { echo "ConfigMap-Block nicht gefunden"; false; }
  [[ "$output" == *"FROM tickets.tickets"* ]] || { echo "kein tickets.tickets-SELECT: $output"; false; }
  [[ "$output" != *"FROM bugs.bug_tickets"* ]] || { echo "Legacy-SELECT noch vorhanden: $output"; false; }
}

@test "ingest-prs.mjs (ConfigMap) liest tickets.ticket_links, nicht bachelorprojekt.features" {
  run grep -A 45 "ingest-prs.mjs" "$RENDERED"
  [ "$status" -eq 0 ] || { echo "ConfigMap-Block nicht gefunden"; false; }
  [[ "$output" == *"FROM tickets.ticket_links"* ]] || { echo "kein ticket_links-Join: $output"; false; }
  [[ "$output" != *"bachelorprojekt.features"* ]] || { echo "Legacy-Tabelle noch referenziert"; false; }
}

@test "Zero-Item-Guard vorhanden (stille-gruene Fehlerklasse)" {
  run grep -A 45 "ingest-bug-tickets.mjs" "$RENDERED"
  [ "$status" -eq 0 ]
  [[ "$output" == *"live store"* ]] || { echo "Guard-Meldung fehlt: $output"; false; }
}

@test "knowledge-ingest-markdown CronJob ist suspendiert" {
  # awk: ab der Markdown-CronJob-Zeile bis zum naechsten apiVersion-Ressourcen-
  # trenner (Kustomize-Ausgabe ist alphabetisch sortiert — suspend: true liegt
  # mehrere Dutzend Zeilen nach dem Namen, ein festes -A-Fenster waere bruchig).
  run awk '/name: knowledge-ingest-markdown/{f=1} f{print} f&&/^apiVersion:/{exit}' "$RENDERED"
  [ "$status" -eq 0 ]
  [[ "$output" == *"suspend: true"* ]] || { echo "kein suspend: true am Markdown-CronJob"; false; }
}

@test "Lokale Kopie ingest-bug-tickets.mjs liest ebenfalls tickets.tickets" {
  run grep -A 20 "FROM tickets.tickets" "${REPO}/scripts/knowledge/ingest-bug-tickets.mjs"
  [ "$status" -eq 0 ] || { echo "lokale Kopie liest nicht tickets.tickets"; false; }
}

@test "Lokale Kopie ingest-prs.mjs liest ebenfalls tickets.ticket_links" {
  run grep -A 20 "FROM tickets.ticket_links" "${REPO}/scripts/knowledge/ingest-prs.mjs"
  [ "$status" -eq 0 ] || { echo "lokale Kopie liest nicht ticket_links"; false; }
}
