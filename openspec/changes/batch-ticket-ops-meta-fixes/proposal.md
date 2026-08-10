# batch-ticket-ops-meta-fixes — Proposal

## Zweck

Batch-Gruppe aus 4 Tickets (ticket-ops/ticket-mcp-Meta). Ein gemeinsamer Branch
und Plan decken alle Kinder ab.

## Kinder

- T003174: Triage-Query überschreitet mcp-postgres-Token-Limit bei ~96 Tickets
- T003176: Wellenbildung: areas-Konfliktheuristik erkennt generierte Artefakte nicht
- T002937: stage_plan(hold:true) setzt readiness nicht wie CLI-Fallback
- T003134: Mishap-Buffer kennt keinen Rücknahmepfad (resolve/withdraw)

## Nicht im Scope

- Mishap-Dedupe (T002844 — eigene Richtung)
- Freshness-Generat selbst (T003133/T003136/T003105 — eigene Tickets)
- Batch-Wellenbildung anderer Bereiche (T003490/T003540)
