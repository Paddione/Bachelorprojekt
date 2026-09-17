---
title: "Design: llm-proxy-readiness-prio0"
ticket_id: T900212
domains: [llm, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: llm-proxy-readiness-prio0

## Goals

- `/health` meldet `ready:true`, wenn ein Backend der Primaerstufe (priority 0 oder 1) gesund ist.
- Der Schutz gegen "nur Cloud-Fallback lebt" bleibt erhalten.

## Non-Goals

- Umnummerierung der Backend-Registry.
- Readiness pro Rolle (chat/embed/rerank).

## Decisions

1. **Primaerstufe = `priority <= 1`.** Vom Nutzer gewaehlt gegen die Alternative
   "kleinste Prioritaet lokaler Backends". Begruendung: kleinste Aenderung, der
   Cloud-Fallback (priority 2) bleibt ausserhalb, und ein abgeschaltetes
   Chat-Backend faellt nicht still auf ein Embed-Backend (priority 10) zurueck.
2. **exclusiveGroup-Semantik bleibt** (`primary.some`), nur der Filter aendert sich.
3. **Negative Prioritaeten** zaehlen ebenfalls zur Primaerstufe. Die Registry
   vergibt keine, eine Sonderbehandlung waere spekulativ.

## Risks

- Ein kuenftiges Backend mit priority 0 oder 1, das Cloud ist, wuerde als primaer
  gelten. Das war mit priority 1 bereits so und ist eine Registry-Entscheidung.
