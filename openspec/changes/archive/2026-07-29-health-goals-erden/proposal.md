---
title: "health-goals-llm-fill erden: Goal-Registry als Kontext"
domains: [scripts]
ticket_id: T002402
status: active
parent_feature: T002397
---

# health-goals-llm-fill erden

**Ticket:** T002402

## Problem

`scripts/health-goals-llm-fill.sh` füllt Health-Goal-Felder per LLM ohne Kenntnis
der bereits definierten Ziele → inkonsistente Formulierungen.

## Lösung

Stufe 1: Vorhandene Goal-Definitionen (gleicher Präfix-Bereich) vor dem Aufruf laden
und als Stilvorlage + Abgrenzung mitgeben.

## Randbedingung

Kontextmenge auf Flash-Tier-Budget im llm-proxy prüfen (CTX_MARGIN in server.mjs).
