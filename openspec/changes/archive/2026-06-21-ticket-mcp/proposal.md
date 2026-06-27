---
ticket_id: (wird nach Erstellung eingetragen)
plan_ref: openspec/changes/ticket-mcp/tasks.md
status: archived
date: 2026-06-21
---

# Proposal: ticket-mcp — Ticket-Operationen als MCP-Tools

## Why

AI-Agenten müssen heute komplexe Shell-Kommandos kennen um Tickets zu verwalten.
Mit ticket-mcp stehen Triage, Plan-Meta, Mishap-Bündelung und Backfill als native
MCP-Tools bereit — nutzbar von Claude Code, Opencode und Gemini CLI ohne Shell-Wissen.

## What

- stdio MCP-Server (`scripts/ticket-mcp/server.js`) wrapping `scripts/ticket.sh`
- 12 Tools: list_tickets, get_ticket, export_tickets, triage_ticket, backfill_ticket_id,
  set_plan_meta, set_readiness_flag, prepare_feature, transition_status,
  add_comment, update_fields, report_mishap
- Mishap-Bundle-System: 3 Mishaps → automatisches Bundle-Ticket mit attention_mode=ai_ready
- backfill_ticket_id: repariert Tickets ohne external_id (NULL)
- Neue ticket.sh Subcommands: list, backfill-id

## Ablöst

- T000992 (ai-ticket-auto-triage): Mishap-Klassifizierung übernimmt dieses Feature
  für Mishap-Tickets → T000992 nach Merge auf archived setzen
