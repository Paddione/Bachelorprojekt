#!/usr/bin/env bats
# tests/spec/mcp-skill-integration/psql-fallback-ticket-ssot.bats
# SSOT: openspec/specs/mcp-skill-integration.md (Delta: mcp-tool-guide-psql-ticket-ssot)
#
# Prüfmodus: grep/Source — Querschnittstest einer Dokumentationskonvention
# (`.claude/skills/references/mcp-tool-guide.md` §mcp-postgres), deren Ergebnis
# sich ausschließlich im Quelltext manifestiert (CLAUDE.md T002448-M4-Ausnahme).
#
# ABGELÖST [T900013]: Bis 2026-08-30 forderte dieser Test hier das Gegenteil —
# der Helper solle auf `workspace-dev` zeigen und fleet meiden (Fix T006285,
# ADR-006-E3-Ära: tickets-Schema lokal, fleet-Kopie eingefroren). ADR-007
# (Accepted 2026-08-24, T016422) erklärt die Fleet-shared-db zur
# "tickets-DB of record"; die Erwartung ist damit umgedreht.
#
# Erschwerend war der alte Zielwert nicht bloß veraltet, sondern unbrauchbar:
# einen kubectl-Context `workspace-dev` gibt es nicht (`kubectl config
# get-contexts` kennt fleet und hetzner) — der als SSOT verlinkte Helper war so
# nicht lauffähig.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  guide="$REPO/.claude/skills/references/mcp-tool-guide.md"
}

@test "psql()-Helper zeigt auf fleet und nicht mehr auf workspace-dev [T900013]" {
  # Helper-Block isolieren: vom Pod-Lookup bis zur psql()-Definition.
  # Der Anker 'kubectl get pod -n workspace' ist im Guide eindeutig (1 Treffer).
  helper_block=$(awk '/kubectl get pod -n workspace/,/^[[:space:]]*psql\(\) \{ kubectl exec/' "$guide")

  # Positiv-Anker ZUERST (T002356-M1): der Block wurde überhaupt gefunden und
  # adressiert die Ticket-SSOT auf fleet. Ohne ihn bestünde die Negativ-Aussage
  # unten auch bei leerem Block.
  [ -n "$helper_block" ]
  run grep -qF -- '--context fleet' <<<"$helper_block"
  [ "$status" -eq 0 ]

  # Erst jetzt: der abgelöste (und nicht existierende) Context wird nicht mehr
  # als Ziel verwendet. Geprüft wird die ausführbare Zeile, nicht die Prosa —
  # der erklärende Kommentar darf den Namen weiterhin nennen.
  run grep -F -- '--context workspace-dev' <<<"$helper_block"
  [ "$status" -ne 0 ]
}

@test "mcp-postgres-Abschnitt dokumentiert fleet als Ticket-SSOT [T900013]" {
  section=$(awk '/^## `mcp-postgres`/,/^## `mcp-kubernetes`/' "$guide")

  # Positiv-Anker: der Abschnitt wurde gefunden.
  [ -n "$section" ]

  # Das fleet-Routing ist im Abschnitt explizit dokumentiert, nicht nur im
  # Helper-Block.
  run grep -qF -- 'fleet' <<<"$section"
  [ "$status" -eq 0 ]

  # Der Abschnitt benennt fleet als Datenhoheit, nicht als Kopie.
  run grep -qiE -- 'SSOT|DB of record' <<<"$section"
  [ "$status" -eq 0 ]

  # Die abgelöste OPERATIVE Behauptung darf nicht mehr dastehen — sie hat
  # Agenten in die falsche Datenbank geschickt. Geprüft wird die Überschrift
  # des damaligen Warn-Punkts, nicht das blosse Wort "eingefroren": eine
  # historische Einordnung ("bis 2026-08-30 stand hier …") darf den Begriff
  # weiterhin nennen. Ein Verbot des Worts wäre Darstellung statt Semantik
  # (tests/CLAUDE.md, T002716) und bräche an jeder Umformulierung.
  stale="$(grep -F -- 'Eingefrorene fleet-Kopie, nicht die lokale SSOT' <<<"$section" || true)"
  [ -z "$stale" ]
}
