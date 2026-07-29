---
title: "brain-ingest-transform prüfen — Implementation Plan"
ticket_id: T002404
domains: [scripts, docs]
status: active
parent_feature: T002397
---

# brain-ingest-transform prüfen

_Ticket: T002404_

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | brain-ingest-pruefung | impl | — (reine Untersuchung) | — |

### p1 — brain-ingest-pruefung

**Rolle:** impl — Prüfung, ob Erdung Nutzen bringt. Kein Code, nur Analyse.

1. Bestands-Wiki-Seiten aus Paddione/brain analysieren
2. Auf inkonsistente Querverweise/Dubletten prüfen
3. Ergebnis als Ticket-Kommentar:
   - Falls ja: Stufe 1 vorschlagen (Liste vorhandener Seiten im Prompt)
   - Falls nein: Ticket auf `obsolete` setzen

**Ergebnis:** Ticket-Kommentar mit Prüfungsergebnis, kein Code-Change.
