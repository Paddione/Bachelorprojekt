#!/usr/bin/env bats
# tests/spec/mcp-skill-integration/psql-fallback-ticket-ssot.bats
# SSOT: openspec/specs/mcp-skill-integration.md (Delta: mcp-tool-guide-psql-ticket-ssot)
#
# Prüfmodus: grep/Source — Querschnittstest einer Dokumentationskonvention
# (`.claude/skills/references/mcp-tool-guide.md` §mcp-postgres), deren Ergebnis
# sich ausschließlich im Quelltext manifestiert (CLAUDE.md T002448-M4-Ausnahme).
#
# Fix T006285: Der dokumentierte psql()-Helper adressiert die lokale Dev-DB
# (workspace-dev auf Fleet) statt der eingefrorenen fleet-Kopie.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  guide="$REPO/.claude/skills/references/mcp-tool-guide.md"
}

@test "psql()-Helper zeigt auf workspace-dev und nicht auf fleet [T006285]" {
  # Helper-Block isolieren: vom Pod-Lookup bis zur psql()-Definition.
  # Der Anker 'kubectl get pod -n workspace' ist im Guide eindeutig (1 Treffer).
  helper_block=$(awk '/kubectl get pod -n workspace/,/^[[:space:]]*psql\(\) \{ kubectl exec/' "$guide")

  # Positiv-Anker (T002356-M1): der Block adressiert die lokale Ticket-SSOT
  run grep -qF -- '--context workspace-dev' <<<"$helper_block"
  [ "$status" -eq 0 ]

  # Negativ-Aussage: kein fleet-Exec im Helper-Block
  run grep -qF -- '--context fleet' <<<"$helper_block"
  [ "$status" -ne 0 ]
}

@test "mcp-postgres-Abschnitt dokumentiert die lokale Ticket-DB [T006285]" {
  section=$(awk '/^## `mcp-postgres`/,/^## `mcp-kubernetes`/' "$guide")

  # Positiv-Anker: das lokale Routing (Ticket-SSOT auf workspace-dev)
  # ist im Abschnitt explizit dokumentiert, nicht nur im Helper-Block
  run grep -qF -- 'workspace-dev' <<<"$section"
  [ "$status" -eq 0 ]
}
