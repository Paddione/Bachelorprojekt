#!/usr/bin/env bats
# tests/spec/mcp-skill-integration/psql-fallback-ticket-ssot.bats
# SSOT: openspec/specs/mcp-skill-integration.md (Delta: mcp-tool-guide-psql-ticket-ssot)
#
# Prüfmodus: grep/Source — Querschnittstest einer Dokumentationskonvention
# (`.claude/skills/references/mcp-tool-guide.md` §mcp-postgres), deren Ergebnis
# sich ausschließlich im Quelltext manifestiert (CLAUDE.md T002448-M4-Ausnahme).
#
# Fix T006285: Der dokumentierte psql()-Helper adressiert die eingefrorene
# fleet-Kopie statt der lokalen Ticket-SSOT (k3d-mentolder-dev).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  guide="$REPO/.claude/skills/references/mcp-tool-guide.md"
}

@test "psql()-Helper zeigt auf k3d-mentolder-dev und nicht auf fleet [T006285]" {
  # Helper-Block isolieren: vom Pod-Lookup bis zur psql()-Definition.
  # Der Anker 'kubectl get pod -n workspace' ist im Guide eindeutig (1 Treffer).
  helper_block=$(awk '/kubectl get pod -n workspace/,/^[[:space:]]*psql\(\) \{ kubectl exec/' "$guide")

  # Positiv-Anker (T002356-M1): der Block adressiert die lokale Ticket-SSOT
  run grep -qF -- '--context k3d-mentolder-dev' <<<"$helper_block"
  [ "$status" -eq 0 ]

  # Negativ-Aussage: kein fleet-Exec im Helper-Block
  run grep -qF -- '--context fleet' <<<"$helper_block"
  [ "$status" -ne 0 ]
}

@test "mcp-postgres-Abschnitt dokumentiert die lokale Ticket-DB [T006285]" {
  section=$(awk '/^## `mcp-postgres`/,/^## `mcp-kubernetes`/' "$guide")

  # Positiv-Anker: das lokale Routing (Ticket-SSOT auf k3d-mentolder-dev)
  # ist im Abschnitt explizit dokumentiert, nicht nur im Helper-Block
  run grep -qF -- 'k3d-mentolder-dev' <<<"$section"
  [ "$status" -eq 0 ]
}
