# T002771 — Prosa-Blocker in depends_on überführen
> **Type:** fix | **Severity:** minor | **Effort:** mittel

## Tasks

1. [ ] `ticket-ops-procedures.md` Phase 1: Keyword-Scanning-Regel für Prosa-Blocker dokumentieren
2. [ ] `scripts/vda/ticket/triage.sh` oder Ticket-MCP: Keyword-Extraktion aus Beschreibung
3. [ ] Gefundene PR-Referenzen via `gh pr view` auf Merge-Status prüfen
4. [ ] `depends_on` automatisch setzen, wenn Blocker-Ticket identifiziert
5. [ ] Test: BATS-Test mit Fake-Ticket-Beschreibung die "BLOCKIERT VON: T00XXXX" enthält
