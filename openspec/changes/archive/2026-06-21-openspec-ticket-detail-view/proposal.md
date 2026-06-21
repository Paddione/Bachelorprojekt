# Proposal: openspec-ticket-detail-view

_Ticket: T000962_

## Why

Das Admin-Ticket-Detail (`/admin/tickets/[id]`) zeigt keine Infos darüber, ob und welche
OpenSpec Change-Proposals für dieses Ticket existieren. Entwickler müssen manuell
`openspec/changes/` durchsuchen. Die Verknüpfung liegt bereits in `openspec-status.json`
vor — sie fehlt nur im UI.

## What

Neues read-only Panel `OpenSpecProposalsPanel.svelte` in der Ticket-Vollansicht.
Zeigt alle verknüpften Proposals mit Slug, Status-Badge (farbcodiert) und GitHub-Link.
Statischer JSON-Import in `[id].astro` — kein DB-Query, kein API-Endpoint.

## Non-Goals

- Kein Drawer (nur Vollansicht `/admin/tickets/[id]`)
- Keine CRUD-Aktionen (read-only)
- Kein Parsen von `proposal.md`-Inhalten zur Beschreibung
