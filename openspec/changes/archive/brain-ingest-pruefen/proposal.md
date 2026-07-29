---
title: "brain-ingest-transform: prüfen ob Erdung Nutzen bringt"
domains: [scripts, docs]
ticket_id: T002404
status: active
parent_feature: T002397
---

# brain-ingest-transform erden?

**Ticket:** T002404

## Aufgabe

**Dies ist eine Prüfung, keine Umsetzung.** `scripts/brain-ingest-transform.sh`
schreibt Repo-Dokumente fürs Brain-Wiki um. Die Frage: entstehen im Wiki
inkonsistente Querverweise/Dubletten, die durch Kenntnis bereits ingestierter
Seiten vermeidbar wären?

## Methode

1. Bestands-Wiki-Seiten analysieren (Liste aus Brain-Repo)
2. Prüfen: gibt es echte Inkonsistenzen?
3. Falls ja → Stufe 1: Liste vorhandener Seiten als Prompt-Kontext
4. Falls nein → Ticket als `obsolete` schließen

## Ergebnis

Ein Ticket-Kommentar mit dem Prüf-Ergebnis, kein Code.
