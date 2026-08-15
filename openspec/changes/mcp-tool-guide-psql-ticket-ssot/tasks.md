---
title: "mcp-tool-guide-psql-ticket-ssot — Implementation Plan"
ticket_id: T006285
domains: [docs, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-tool-guide-psql-ticket-ssot — Implementation Plan

_Ticket: T006285_

## File Structure

- `.claude/skills/references/mcp-tool-guide.md` (ändern) — §mcp-postgres psql()-Helper und Routing-Doku
- `tests/spec/mcp-skill-integration/psql-fallback-ticket-ssot.bats` (neu) — RED-Guard, liegt bereits im Branch

## Kontext

Der dokumentierte `psql()`-Helper in `.claude/skills/references/mcp-tool-guide.md` §mcp-postgres
adressiert die **fleet**-Postgres-Kopie (`--context fleet`). Die Ticket-SSOT liegt auf
**k3d-mentolder-dev**; die fleet-Kopie ist historisch eingefroren (ADR-006 E3, T002785-4).
Beleg (2026-08-15, read-only): lokale k3d-DB 2757 Tickets inkl. T006285/T005676/T005898/T005591;
fleet-Kopie 2091 Tickets ohne diese IDs. `mcp__mcp-postgres__query` (Port 13001) zeigt ebenfalls
auf die lokale DB — auch der Freeze-Hinweis-Text beschreibt eine überholte Realität.
`scripts/ticket.sh` Zeile 42 routet korrekt: `CTX="${TICKET_CTX:-k3d-mentolder-dev}"`, beide
Brands in derselben lokalen DB.

## Task 1 — RED: der Guard liegt vor und ist rot

Der Test `tests/spec/mcp-skill-integration/psql-fallback-ticket-ssot.bats` ist bereits im Branch
und schlägt auf diesem Stand fehl (beide @test-Blöcke). Rot-Zustand nachweisen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-skill-integration/psql-fallback-ticket-ssot.bats
# expected: FAIL (2 not ok — Helper zeigt auf fleet, lokaler Kontext fehlt)
```

## Task 2 — GREEN: §mcp-postgres in mcp-tool-guide.md korrigieren

In `.claude/skills/references/mcp-tool-guide.md` §mcp-postgres:

1. **psql()-Helper auf die lokale Ticket-SSOT umstellen** — im Block von
   `PGPOD=$(kubectl get pod -n workspace …` bis `psql() { … }` beide `--context fleet` durch
   `--context k3d-mentolder-dev` ersetzen (`-n workspace` beibehalten). Blockstruktur nicht
   umbauen — der Guard ankert auf `kubectl get pod -n workspace` und
   `psql() { kubectl exec`.
2. **Freeze-Hinweis „Eingefrorene fleet-Kopie, nicht die lokale SSOT [T002785-4]" präzisieren**:
   Port 13001 wird nicht mehr per fleet-Forward bedient (empirisch: der mcp-postgres-Server
   liefert die lokalen 2757 Tickets). Der Abschnitt muss explizit sagen: die Ticket-DB liegt auf
   k3d-mentolder-dev (beide Brands in derselben lokalen Datenbank, vgl. `scripts/ticket.sh`
   `CTX="${TICKET_CTX:-k3d-mentolder-dev}"`); die fleet-Kopie ist eingefroren; fleet-basierte
   Writes gelten nur für prod-Business-Daten (`public.*`, `bachelorprojekt.*`, `mentolder.*`)
   hinter dem Prod-Write-Guard.
3. **Timeout-Hinweis [T002261] scopen**: Die großzügigen Timeouts (WireGuard, Exit 143) gelten
   für fleet-basierte Writes gegen prod-Daten; die WireGuard-Begründung entfällt für die lokale
   k3d-DB.

Ergebnis-Anker: `k3d-mentolder-dev` kommt im §mcp-postgres-Abschnitt (zwischen
`## \`mcp-postgres\`` und `## \`mcp-kubernetes\``) vor; im Helper-Block steht kein
`--context fleet` mehr.

## Task 3 — GREEN: Guard läuft durch

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-skill-integration/psql-fallback-ticket-ssot.bats
# expected: PASS (2 ok)
```

## Task 4 — Abschluss-Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
