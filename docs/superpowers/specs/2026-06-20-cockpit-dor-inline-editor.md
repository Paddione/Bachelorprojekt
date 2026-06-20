---
ticket_id: T000990
plan_ref: openspec/changes/cockpit-dor-inline-editor/tasks.md
status: active
date: 2026-06-20
---

# Spec: Cockpit: DoR / Lastenheft inline editieren

## Kern-Nutzerflow

Patrick öffnet die Container-Vollansicht eines Project/Feature-Tickets im Cockpit. Unter dem bestehenden Plan-Panel erscheint ein neues DoR/Lastenheft-Panel. Es zeigt den Inhalt der verknüpften `openspec/changes/<slug>/proposal.md` als Markdown-Textarea mit Live-Preview daneben. Patrick editiert den Text, klickt „Speichern" — die proposal.md wird via File-API oder API-Endpoint aktualisiert.

Jeder Admin darf editieren (keine Rollen-Einschränkung). Keine Versionsgeschichte — nur der aktuelle Stand wird gespeichert.

## Akzeptanzkriterien

1. DoR/Lastenheft-Panel sichtbar für type ∈ {project, feature} in Container-Vollansicht
2. Markdown-Textarea mit Live-Preview (Side-by-Side oder Toggle)
3. Speichern aktualisiert die verknüpfte openspec proposal.md
4. Alle Admins dürfen editieren (gleiche Guard wie andere Admin-Routen)
5. Bei fehlender proposal.md: Hinweis „Kein Proposal verknüpft" + Link zu Openspec

## Edge Cases

- proposal.md hat keinen Slug im Ticket: Hinweis auf Openspec-Verlinkung, kein Editor
- Markdown-Syntax-Fehler: Preview zeigt rohen Text, keine Blockade
- Zwei Admins editieren gleichzeitig: Last-Write-Wins (kein CRDT, kein Locking)

## Fehlerfall-Behandlung

- Speichern schlägt fehl (File-Lock, Berechtigung): Toast „Speichern fehlgeschlagen", Text bleibt im Editor
- proposal.md gelöscht während Edit: Warn-Banner, Speichern deaktiviert

## Erfolgsmetrik

- Patrick schreibt DoR im Cockpit statt externem Tool in ≥80% der Fälle
- Speichern in ≤3s inklusive Preview-Update

## Technische Constraints

- Openspec proposal.md als Single Source of Truth — keine zusätzliche Datenbank-Tabelle
- Keine Versionsgeschichte (Git-Commits sind die History)
- Keine Rollendifferenzierung — alle Admins平等

## Betroffene Dateien

- Neue `website/src/components/admin/DorPanel.svelte` — Editor + Preview
- `website/src/pages/admin/tickets/[id].astro` — DorPanel einbinden
- `website/src/pages/api/admin/openspec/save-proposal.ts` — neuer Save-Endpoint
