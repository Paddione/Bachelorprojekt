# T002768: ticket_plans-Schema dokumentieren

## Problem
`mcp-tool-guide.md` warnt vor `SELECT *` auf `ticket_plans.content`, listet aber nicht alle
Spalten. Eine Join-Query gegen `p.status` scheiterte am 2026-08-09 — die Tabelle hat kein
`status`-Feld.

## Fix
Explizite Spaltenliste ergänzen: `id, ticket_id, slug, branch, pr_number, content, archived_at`.
Sowie Negativ-Hinweis: `status` existiert NICHT (das Status-Feld ist auf `tickets.tickets`).
