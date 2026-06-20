---
title: "Cockpit Direct Ticket Links"
date: 2026-06-20
slug: cockpit-direct-ticket-links
ticket_id: null
plan_ref: null
status: draft
areas:
  - website
  - admin-cockpit
---

# Cockpit Direct Ticket Links — Design Spec

## Ausgangslage & Problem

Das Projekt-Cockpit (`/admin/cockpit`) zeigt eine Ticket-Tabelle (CockpitTable → TicketRow).
Klickt man auf den Ticket-Titel, öffnet sich `TicketDrawer.svelte` — ein fest eingebetteter
Schiebepanel innerhalb der Cockpit-Seite. Dieser Drawer ermöglicht Quickedits (Titel, Beschreibung,
Priority, Status-Übergänge) und hat einen "Vollansicht öffnen ↗"-Link zu `/admin/tickets/{id}`.

**Problem:** Zwei Klick-Ebenen für eine Vollansicht sind unnötig. Der Drawer ist ein UX-Umweg
(öffnen → nochmal klicken für Vollansicht). Die Vollansicht (`/admin/tickets/{id}`) hat bereits
alle Drawer-Funktionen und mehr. Außerdem: der Drawer hält redundanten Zustand (`drawerOpen`,
`drawerTicket`, `activeTicket` im Store) und ist ein separates File (~165 Zeilen), das gewartet
werden muss.

## Ziel

Ticket-Titel in der Cockpit-Overview werden zu **direkten Navigationslinks** auf die Vollansicht
(`/admin/tickets/{id}`). Der `TicketDrawer` wird vollständig entfernt.

## Was sich ändert

### Verhalten (User-facing)
| Vorher | Nachher |
|--------|---------|
| Ticket-Titelklick → Drawer öffnet sich | Ticket-Titelklick → Navigation zu `/admin/tickets/{id}` |
| Drawer hat "Vollansicht öffnen" Link (zweiter Klick) | Direkt auf Vollansicht (ein Klick) |
| ESC schließt Drawer | Kein Drawer mehr |
| Backdrop-Klick schließt Drawer | Kein Backdrop |

### Komponentenänderungen

**TicketRow.svelte** (Zeile 68):
```svelte
<!-- Vorher -->
<button class="title-link" on:click={handleOpenDrawer}>{ticket.title}</button>

<!-- Nachher -->
<a href="/admin/tickets/{ticket.id}" class="title-link">{ticket.title}</a>
```
Props `onOpenDrawer` und Funktion `handleOpenDrawer` + `dispatch('openDrawer')` werden entfernt.

**CockpitTable.svelte** (Zeile 13):
- Prop `onOpenDrawer` entfernen
- TicketRow-Übergabe `onOpenDrawer={(d) => onOpenDrawer?.(d)}` entfernen

**Cockpit.svelte**:
- State `drawerTicket`, `drawerOpen` entfernen
- Funktionen `openDrawer`, `closeDrawer` entfernen
- Import `TicketDrawer`, `setActiveTicket` entfernen
- `<TicketDrawer ... />` Mount entfernen
- `onOpenDrawer={openDrawer}` von CockpitTable entfernen

**cockpitStore.ts**:
- `activeTicket: string | null` aus `CockpitState` Interface entfernen
- `activeTicket: null` aus `initial` State entfernen
- `setActiveTicket` Funktion entfernen

### Dateien die gelöscht werden
- `website/src/components/admin/TicketDrawer.svelte`
- `website/src/components/admin/TicketDrawer.test.ts`

### Tests die aktualisiert werden
- `website/src/components/admin/TicketRow.test.ts` — statt Button→openDrawer jetzt `<a>`-Link auf `/admin/tickets/{id}`
- `website/src/lib/stores/cockpitStore.test.ts` — `activeTicket` und `setActiveTicket` Tests entfernen

## Was NICHT ändert

- Der globale `PortalSidekick` (CockpitSidekickView) bleibt unverändert — er ist nicht Teil des Drawer-Flows
- Die `TicketCreateModal` bleibt
- BulkBar und Multi-Select bleiben
- Status/Priority-Inline-Editing direkt in der Row bleibt
- Die vollständige `/admin/tickets/{id}` Seite bleibt

## S1 Budget

Alle betroffenen Dateien sind nicht gebaselined:
- `TicketRow.svelte`: 113 Zeilen → schrumpft (~15 weniger) → Budget +387 gegen Limit 500
- `CockpitTable.svelte`: 197 Zeilen → schrumpft (~5 weniger) → Budget +308 gegen Limit 500
- `Cockpit.svelte`: 170 Zeilen → schrumpft (~25 weniger) → Budget +355 gegen Limit 500
- `cockpitStore.ts`: 85 Zeilen → schrumpft (~8 weniger) → Budget +523 gegen Limit 600
- `TicketDrawer.svelte`: 165 Zeilen → GELÖSCHT
- `TicketDrawer.test.ts`: wird gelöscht

Alle Änderungen reduzieren die Gesamtzeilenzahl. S1 ist kein Problem.

## Akzeptanzkriterien

1. Klick auf Ticket-Titel in Cockpit-Overview navigiert zu `/admin/tickets/{id}`
2. Kein Drawer/Panel erscheint mehr
3. `TicketDrawer.svelte` und `TicketDrawer.test.ts` sind gelöscht
4. `onOpenDrawer` prop existiert nirgendwo mehr in admin-Cockpit-Komponenten
5. `setActiveTicket` / `activeTicket` existiert nicht mehr im cockpitStore
6. `task test:changed`, `task freshness:regenerate`, `task freshness:check` sind grün
7. Test-Inventar regeneriert und committed
