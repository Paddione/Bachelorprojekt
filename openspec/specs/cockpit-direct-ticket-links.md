# cockpit-direct-ticket-links

## Purpose

Im Cockpit wird der Ticket-Titel in der Tabellenzeile als direkter Link zur dedizierten Ticket-Detail-Seite (`/admin/tickets/{id}`) gerendert. Der bisherige Drawer-basierte Detail-Pfad (TicketDrawer-Mount in `Cockpit.svelte`, `onOpenDrawer`-Prop in `TicketRow`/`CockpitTable`, `activeTicket`-State im `cockpitStore`) wird vollständig entfernt, sodass Browser-Back/Forward, Link-Sharing und Tastatur-Navigation auf Detail-Views funktionieren.

## Requirements

### Requirement: TicketRow rendert Titel als direkten Link

The system SHALL render the ticket title in `TicketRow.svelte` as an `<a class="title-link" href="/admin/tickets/{ticket.id}">` element, styled as a link (inherits color, no underline; underline on hover).

#### Scenario: Title-Click navigiert zur Ticket-Detail-Seite

- **GIVEN** ein `TicketRow` für `ticket.id='t1'` ist gerendert
- **WHEN** der Nutzer auf den Titel klickt
- **THEN** navigiert der Browser zu `/admin/tickets/t1` (kein Drawer öffnet sich)

### Requirement: CockpitTable reicht keinen Drawer-Handler mehr durch

The system SHALL NOT define or pass an `onOpenDrawer` prop on `TicketRow` or `CockpitTable`; the corresponding test for the title-click drawer flow MUST be removed.

### Requirement: Cockpit mountet keinen TicketDrawer mehr

The system SHALL NOT mount a `TicketDrawer` component in `Cockpit.svelte`, SHALL NOT import `TicketDrawer`, and SHALL NOT track `drawerTicket` / `drawerOpen` state. The `TicketCreateModal` mount is preserved.

### Requirement: cockpitStore enthält keine aktive-Ticket-State

The system SHALL NOT export a `setActiveTicket` function or carry an `activeTicket: string | null` field on `CockpitState`; the corresponding unit tests SHALL be removed.

### Requirement: TicketDrawer-Dateien sind gelöscht

The system SHALL NOT have `website/src/components/admin/TicketDrawer.svelte` or `website/src/components/admin/TicketDrawer.test.ts` in the working tree (the platform-internal `AssetTicketDrawer` is preserved).

#### Scenario: Vollständige Entfernung des Drawer-Pfads

- **GIVEN** der Drawer-Pfad ist entfernt
- **WHEN** `grep -rn "TicketDrawer" website/src/ | grep -v "platform/AssetTicketDrawer"` ausgeführt wird
- **THEN** ist der Output leer
- **AND** `grep -nE "onOpenDrawer" website/src/components/admin/` ist leer
- **AND** `grep -nE "setActiveTicket|activeTicket" website/src` ist leer

<!-- from archive/2026-06-21-cockpit-direct-ticket-links/tasks.md lines 10-50 -->
