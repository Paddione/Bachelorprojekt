---
title: "Cockpit UX Redesign"
date: 2026-06-15
slug: cockpit-ux-redesign
status: staged
ticket_id: null
plan_ref: null
areas:
  - website
  - cockpit
---

# Cockpit UX Redesign — Design-Spec

## Kontext & Problem

Das aktuelle Projekt-Cockpit unter `/admin/cockpit` hat eine 4-Tab-Struktur
(Überblick / Werkbank / Karten / Tabelle), die aus zwei orthogonalen Dimensionen
(Lens: ueberblick/werkbank × Mode: karten/tabelle) entstanden ist. Dieses
mentale Modell ist für neue Nutzer nicht erschließbar.

Zusätzliche UX-Probleme:
- **Dauerhafte Create-Form** nimmt ~30 % des Hauptbereichs ein, auch beim Browsen
- **Überblick-Karten** zeigen dutzende winzige Karten ohne visuelle Hierarchie
- **TicketsTab.svelte** (615 Zeilen) vermischt Create-Form, Ticket-Liste und Inline-Aktionen
- **Keine Mobile-Unterstützung** — Sidebar und Split-Panel brechen auf kleinen Screens

## Ziel

Ein PM-taugliches Cockpit das:
1. Den Projektstand sofort zeigt (Feature → Ticket-Status)
2. Ohne Lernkurve bedienbar ist
3. Vollständig responsive (Desktop + Mobile) funktioniert

---

## Design-Entscheidungen

### 1. Primäre Ansicht: Tabelle-First

Die Hauptansicht ist eine Ticket-Tabelle. Keine Karten-Ansicht mehr als Default.
Tabelle zeigt alle Tickets des aktuell gewählten Features.

### 2. Hierarchie-Navigation: Sidebar-Baum

Links gibt es einen persistenten Navigationstree:
```
▸ System-Tests
  ▸ Auth        (4 Tickets)
    CRM         (5 Tickets)
    Komm.       (3 Tickets)
▸ Infra
    K8s         (2 Tickets)
▸ Factory
```
Klick auf ein Feature filtert die Tabelle. Produkt-Knoten sind nur
Überschriften (nicht anklickbar als Filter).

### 3. Mobile: Hamburger-Drawer

Unterhalb von 768 px verschwindet die Sidebar. Ein ☰-Icon im Header
öffnet den Baum als Slide-in-Drawer von links. Nach Feature-Auswahl
schließt der Drawer automatisch.

---

## Layout-Spezifikation

### Desktop (≥ 768 px)

```
┌─────────────────────────────────────────────────────────────┐
│  Cockpit                                                    │  ← Header (nur Titel)
├───────────────┬─────────────────────────────────────────────┤
│ Sidebar 200px │  🔍 Suche + [Status-Chips]     + Ticket     │  ← Toolbar
│               │─────────────────────────────────────────────│
│ (Baum)        │  Tabelle                                    │
│               │─────────────────────────────────────────────│
│               │  Bulk-Bar (sticky, wenn Auswahl)            │
└───────────────┴─────────────────────────────────────────────┘
```

Auf Desktop ist die Sidebar dauerhaft sichtbar — kein ☰-Icon nötig.
Der `+ Ticket` Button sitzt in der Toolbar (nicht im Header).
Die Sidebar hat eine feste Breite von 200 px und ist nicht resizable.

### Mobile (< 768 px)

```
┌─────────────────────────────┐
│ ☰  System-Tests › Auth   + │  ← Header mit Breadcrumb + FAB
├─────────────────────────────┤
│ 🔍 Suche...  [Offen ×]      │  ← Filter-Chips scrollbar horizontal
├─────────────────────────────┤
│ ● T000412  OIDC Token   H  │  ← Prio als linker farbiger Rand
│ ● T000411  Login-Seite  H  │
│ ● T000410  2FA Setup    K  │
└─────────────────────────────┘
```

Spalten auf Mobile: nur Titel + Status-Badge. ID und Erstellt-Datum entfallen.
Priorität als 3px linker Rand in Ampelfarbe (grün/gelb/orange/rot).

---

## Komponenten

### Tabellen-Toolbar

Immer sichtbar über der Tabelle:
- **Suchfeld** (links, flex-grow): Live-Filterung auf Titel
- **Status-Filter-Chips** (Mitte): `Alle | Offen | In Arbeit | Review | Blockiert | Erledigt`
  — aktiver Chip hat Hintergrund, inaktive sind ausgegraut
- **`+ Ticket` Button** (rechts): öffnet Create-Modal

### Tabellen-Spalten

| Spalte | Desktop | Mobile | Bemerkung |
|--------|---------|--------|-----------|
| Checkbox | ✓ | — | Bulk-Selektion |
| ID | ✓ | — | T000xxx, monospace |
| Titel | ✓ | ✓ | flex-grow, klickbar → Drawer |
| Status | ✓ | ✓ | Badge mit Farbe |
| Priorität | ✓ | Rand | niedrig/mittel/hoch/kritisch |
| Erstellt | ✓ | — | relatives Datum (vor 2T) |
| Aktionen | — | — | entfällt, alles im Drawer |

### Bulk-Aktionsleiste

Sticky am unteren Rand, erscheint wenn ≥1 Ticket ausgewählt:
```
3 ausgewählt  [Status ▾]  [Priorität ▾]  [Feature ▾]  ✕
```
Verschwindet wenn Auswahl aufgehoben wird (Esc oder ✕).

### Ticket-Create-Modal

Öffnet via `+ Ticket` in Toolbar. Desktop: zentriertes Modal. Mobile: Bottom-Sheet.

Felder:
1. **Feature** (Select, vorausgefüllt mit aktuellem Feature aus Sidebar)
2. **Typ** (Select: Aufgabe / Bug / Feature / Projekt)
3. **Titel** (Input, required)
4. **Beschreibung** (Textarea, optional)
5. **Priorität** (Select: Niedrig / Mittel / Hoch / Kritisch)
6. **Komponente** (Input mit Autocomplete: website, auth, infra…)

Aktionen: `Abbrechen` | `Erstellen →` (disabled solange Titel leer).
Nach Erstellen: Modal schließt, Tabelle aktualisiert sich, neues Ticket kurz hervorgehoben.

### Ticket-Detail-Drawer

Öffnet via Klick auf eine Tabellenzeile. Desktop: Slide-over von rechts (400 px Breite).
Mobile: Full-Screen mit Zurück-Pfeil.

Inhalt:
- **Header**: Ext-ID + Titel + ✕ (Desktop) / ← (Mobile)
- **Metadaten**: Status, Priorität, Feature, Typ, Erstellt, Zuletzt geändert
- **Beschreibung** (editierbar inline via Klick)
- **Status-Transitionen**: als Buttons `→ In Arbeit`, `→ Review`, `→ Erledigt`
- **Schnell-Aktionen**: `Archivieren`, `KI klassifizieren`

---

## Technischer Scope

### Neue Komponentenstruktur

```
website/src/components/admin/cockpit/
  Cockpit.svelte              ← stark vereinfacht (kein lens/mode)
  CockpitSidebar.svelte       ← NEU: Baum + Hamburger-Logik + mobile Drawer
  CockpitTable.svelte         ← NEU: Toolbar + Tabelle + Bulk-Bar
  TicketRow.svelte            ← bestehend, leicht angepasst (mobil: kein ID/Datum)
  BulkBar.svelte              ← bestehend, unverändert
  TicketCreateModal.svelte    ← NEU: aus TicketsTab.svelte herausgelöst
  TicketDrawer.svelte         ← erweitert: Status-Transitionen + Inline-Edit
```

### Store-Vereinfachung (`cockpitStore.ts`)

Entfernt: `lens`, `mode` (4-Tab-Konzept entfällt komplett).

Bleibt:
- `selectedFeature: string | null`
- `activeTicket: string | null`
- `selectedTickets: Set<string>`
- `optimistic: Record<string, OptimisticEdit>`
- `isLoading: boolean`
- `error: string | null`

### Entfernte Dateien

| Datei | Grund |
|-------|-------|
| `TicketsTab.svelte` (615 Z.) | Aufgeteilt in `CockpitTable` + `TicketCreateModal` |
| `TicketsTableBody.svelte` (329 Z.) | Zeilen-Rendering wandert in `CockpitTable` + `TicketRow` |
| `FeatureWorkbench.svelte` (141 Z.) | Werkbank-Logik wandert in `CockpitTable` |
| `PortfolioGrid.svelte` (42 Z.) | Karten-Ansicht entfällt |

### Responsive-Implementierung

Ein einziger CSS-Breakpoint steuert das gesamte Layout:

```css
@media (max-width: 767px) {
  .cockpit-sidebar { display: none; }
  .cockpit-sidebar.drawer-open { display: block; position: fixed; … }
  .ticket-col-id, .ticket-col-created { display: none; }
  .ticket-create-modal { position: fixed; bottom: 0; … } /* Bottom-Sheet */
  .ticket-drawer { position: fixed; inset: 0; } /* Full-Screen */
}
```

### API — keine Änderungen

Alle bestehenden Endpunkte bleiben unverändert:
- `GET /api/admin/cockpit/portfolio`
- `GET /api/admin/cockpit/feature?id=`
- `POST /api/admin/cockpit/batch`
- `POST /api/admin/cockpit/reorder`
- `POST /api/admin/cockpit/reparent`
- `GET/POST /api/admin/tickets`
- `POST /api/admin/tickets/:id/transition`

### Tests

Bestehende Tests müssen angepasst werden:
- `TicketsTab.test.ts` → aufteilen in `CockpitTable.test.ts` + `TicketCreateModal.test.ts`
- `FeatureWorkbench.test.ts` → Logik in `CockpitTable.test.ts` integrieren
- `PortfolioGrid.test.ts` → entfernen
- `cockpitStore.test.ts` → `lens`/`mode`-Tests entfernen
- Neue Tests: `CockpitSidebar.test.ts` (Hamburger-Toggle, mobile Drawer)

### Verifikation

```bash
task test:all
task freshness:regenerate
task freshness:check
task test:inventory
```

---

## Abgrenzung (nicht in Scope)

- Kein Kanban-Board (kann später als optionaler View ergänzt werden)
- Keine Änderung an Backend-API oder Datenmodell
- Kein Dark/Light-Mode-Toggle (bleibt Dark-Mode)
- Keine neuen Ticket-Felder
- `feature/cockpit-feature-suggest` (T000784, KI-Feature-Vorschläge) bleibt separater Branch
