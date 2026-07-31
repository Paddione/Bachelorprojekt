---
title: "scout-llm-fallback erden — Kontext für den Ratemodus"
domains: [scripts, factory]
ticket_id: T002400
status: active
---

# scout-llm-fallback erden

**Ticket:** T002400

## Problem

`scripts/factory/scout-llm-fallback.sh` springt genau dann ein, wenn die deterministische
Scout-Analyse nichts gefunden hat — also im schwierigsten Fall. Ausgerechnet dort arbeitet
es heute ohne Kontext: das LLM bekommt einen leeren Prompt und muss Ticket-Titel und
-Beschreibung allein interpretieren.

## Lösung

**Stufe 1 (Boden):** Relevante OpenSpec-Specs und ähnliche Tickets vor dem LLM-Aufruf
holen und als Kontextblock in den Prompt schreiben. `find_similar` aus `scout.sh` ist im
selben Verzeichnis bereits vorhanden und kann wiederverwendet werden.

**Stufe 2 (Decke, optional):** Eine optionale Tool-Runde über llama.cpps `GET /tools` /
`POST /tools` (Dateisuche, Spec-Lookup). Fällt die Tool-Treue aus, degradiert das System
auf Stufe 1 statt auf Raten.

## Nicht im Scope

- Allgemeine Agent-Schleife im llm-proxy (T002397)
- Erdung der anderen 6 Proxy-Konsumenten (eigene Tickets: T002401-T002404)
