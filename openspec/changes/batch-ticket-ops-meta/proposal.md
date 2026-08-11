# batch-ticket-ops-meta — Proposal

## Zweck

Batch-Gruppe aus 7 Tickets (ticket-ops/ticket-mcp/agent-lock-Meta). Ein gemeinsamer
Branch und Plan decken alle Kinder ab.

## Kinder

- T002937: mcp__ticket-mcp__stage_plan(hold:true) setzt readiness nicht wie der CLI-Fallback
- T003134: Mishap-Buffer kennt keinen Rücknahmepfad — behobener Befund erscheint beim Flush als offener Punkt
- T003174: ticket-ops Step 1.1: Triage-Query überschreitet bei ~96 Tickets das mcp-postgres-Token-Limit
- T003176: ticket-ops Wellenbildung: areas-Konfliktheuristik erkennt Kollisionen über generierte Artefakte nicht
- T003229: ticket-mcp sieht eine andere CLAUDE_CODE_SESSION_ID als die Shell — agent-lock sperrt die eigene Session aus
- T003284: agent-lock heartbeat-ttl reapt den Lock während aktiver Arbeit — Worktree-Write-Guard sperrt danach den eigenen Worktree
- T003546: Leerer Task-Return bei T003180 war False-Positive — Arbeit vollständig gemergt, nur Reporting fehlte

## Nicht im Scope

- Mishap-Dedupe (T002844 — eigene Richtung)
- Freshness-Generat selbst (T003133/T003136/T003105 — eigene Tickets)
- Batch-Wellenbildung anderer Bereiche (T003490/T003540)
- SID-Besitzmodell für nebenläufige Subagenten (T003131 — eigener Sachverhalt)
- Enqueue-Demotion (T003516/T003575 — auf main bereits gefixt)
