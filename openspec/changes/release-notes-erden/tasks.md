---
title: "release-notes erden — Implementation Plan"
ticket_id: T002403
domains: [scripts]
status: active
parent_feature: T002397
---

# release-notes erden

_Ticket: T002403_

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | release-notes-kontext | impl | `scripts/vda/release-notes.sh` | — |
| p2 | tests | test | `tests/spec/release-notes-erden.bats` | p1 |

### p1 — release-notes-kontext

1. PR-Titel parsen: `[T00XXXX]` → Ticket-ID extrahieren
2. Ticket-Daten (Typ, Areas, Beschreibung) per ticket-mcp laden
3. Als `[TICKET_CONTEXT]`-Block in Prompt schreiben
4. Fallback: Ticket-Abfrage schlägt fehl → Kontext leer, Skript läuft trotzdem

### p2 — tests

1. Test: Prompt enthält Ticket-Daten für PR mit `[T00XXX]`-Tag
2. Test: PR ohne Tag → kein Kontext, kein Fehler
3. Test: DB-Fehler → Kontext leer, Skript läuft weiter

**Files:** `scripts/vda/release-notes.sh`, `tests/spec/release-notes-erden.bats`
