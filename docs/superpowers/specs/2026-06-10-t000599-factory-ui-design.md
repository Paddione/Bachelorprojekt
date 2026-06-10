# Spec: Factory UI — Planungsbüro Vollimplementierung (T000599)

**Ticket:** T000599
**Branch:** feature/t000599
**Datum:** 2026-06-10
**Autor:** Spec-Agent

---

## Ziel

Das bestehende `PlanningOffice.svelte` (aktuell ein funktionaler aber optisch roher Prototyp) wird vollständig neu implementiert. Das Ergebnis ist eine Industrial-Loft-Oberfläche mit zwei Hauptbereichen: links eine Drag-sortierbare Queue mit kompakten Zeilen (56 px, monospace Rang-Nummern, Priority-Dots, Readiness-Squares), rechts ein Detailbereich mit editierbarer Beschreibung, Readiness-Checklist, Depends-on-Tags und Freigabe-Button. Auf Mobilgeräten gilt volle Funktionsparität via Single-Column-Layout mit Tap-to-Expand Bottom-Sheet und Touch-Drag.

---

## Scope

### Enthalten

- Vollständige Neuimplementierung von `PlanningOffice.svelte` (ersetzt den bisherigen Prototyp, keine Migration nötig)
- **Top Stats Bar:** `X planning · Y ready · Z blocked` in monospace, einfarbig, über der Queue
- **Linke Queue (360 px feste Breite auf Desktop):**
  - Zeilen 56 px hoch, kompaktes Layout
  - Rang-Zahl monospace zweistellig (01, 02…) linksbündig
  - Priority-Dot 8 px — Farbkodierung: critical=#ef4444 / major=#f59e0b / minor=#6b7280 / trivial=#374151
  - `external_id` in `#f59e0b` monospace, kleingeschrieben
  - Titel truncated (text-overflow: ellipsis)
  - 4 Readiness-Squares 6 px (spec / questions / dependencies / effort) — grün wenn gesetzt, dunkel wenn nicht
  - Ausgewählte Zeile: 3 px Amber Left-Border + `#1e2736` Hintergrund
  - Drag-and-Drop zum Umranken (HTML5 drag/drop oder Pointer-Events, kein externes DnD-Framework)
  - Drag-Cursor nur für Rang-Handle (☰ Icon links, 32 px Touch-Target)
- **Rechtes Detail-Panel:**
  - Großer Titel (1.4 rem, monospace)
  - Beschreibung (`value_prop`) editierbar (Textarea, autosave on blur)
  - Readiness-Checklist mit 4 Items (Labels aus DOR_KEYS): Checkbox + Label + grüner Check wenn gesetzt
  - Depends-on als Tag-Chips (external_id format, entfernbar per ×, neues hinzufügen per Input+Enter)
  - Effort-Badge klein/mittel/groß mit Amber-Highlight für gesetzten Wert
  - Freigabe-Button `→ dev-flow-plan` (ruft `POST /api/planning-office/:extId/promote`, nur aktiv bei dorScore=4 oder override-Checkbox gesetzt)
  - Override-Checkbox für Freigabe trotz unvollständiger Readiness
- **Neue API-Endpoints** unter `/api/admin/planungsbuero` (Alias/Adapter zu den bestehenden `/api/planning-office`-Routen):
  - `GET /api/admin/planungsbuero` — Liste mit Stats (planning/ready/blocked counts)
  - `PATCH /api/admin/planungsbuero/[extId]` — Rang, Readiness, dependsOn, effort, valueProp
  - Die bestehenden `/api/planning-office/*`-Routen bleiben erhalten (Rückwärtskompatibilität)
- **View-Switcher:** localStorage-Key `planungsbuero_view` (`desktop` / `mobile`), dezenter Toggle-Button oben rechts (⊞ / ≡)
- **Mobile (< 768 px oder Override):**
  - Single-Column, volle Breite
  - Tap auf Zeile öffnet Bottom-Sheet (Slide-up 60 vh, überschreibt die Queue)
  - Bottom-Sheet enthält denselben Detailbereich wie Desktop-Rechts-Panel
  - Touch-Drag via Pointer-Events (touchstart/touchmove/touchend), 48 px Drag-Handle
  - Alle Aktionen (Readiness, Effort, Promote, Deps) im Bottom-Sheet verfügbar
- Styling vollständig in `<style>` des Svelte-Files (kein Tailwind — Industrial-Loft Custom-CSS)
- `data-testid`-Attribute an allen interaktiven Elementen (BATS/Playwright-kompatibel)
- BATS-Unit-Tests für neue API-Handler (Stats-Berechnung, Rang-Update)

### Explizit NICHT drin

- Redesign anderer Factory-UI-Teile (`FactoryFloor.svelte`, `FactoryDashboard.svelte`) — das ist T000597 (Design System)
- Neue Datenbankfelder oder Schema-Migrationen — die bestehenden Felder (planning_rank, readiness, depends_on, effort, pinned) sind ausreichend
- Inline-Klärungsfragen-Formular (bleibt im alten Flow via `/api/planning-office/:extId/clarify`) — wird im neuen UI ausgeblendet
- Real-time WebSocket-Updates
- Offline-Support / Service Worker
- Sortiermodi außer Rang (kein Sort-by-Status, Sort-by-Date etc.)

---

## Design-Entscheidungen

### Farbpalette

| Token          | Wert      | Verwendung                                  |
|----------------|-----------|---------------------------------------------|
| `--bg`         | `#0d1117` | Page-Background                             |
| `--surface`    | `#1e2736` | Cards, Panels, ausgewählte Zeile            |
| `--surface2`   | `#252f3e` | Hover-State Queue-Zeile                     |
| `--border`     | `#2d3748` | Trennlinien, Borders                        |
| `--amber`      | `#f59e0b` | external_id, Freigabe-Button, Left-Border   |
| `--green`      | `#22c55e` | Readiness gesetzt, dorScore 4/4             |
| `--red`        | `#ef4444` | Priority critical, Fehler                   |
| `--text`       | `#e2e8f0` | Primärtext                                  |
| `--muted`      | `#64748b` | Sekundärtext, Labels                        |
| `--mono`       | `'JetBrains Mono', 'Fira Code', monospace` | Rang, external_id, Stats |

### Komponenten

- **Queue-Zeile:** Flexbox horizontal, 56 px `min-height`, `align-items: center`, `gap: 8px`
  - Drag-Handle `☰` (32 px, cursor: grab), Rang-Zahl (2ch monospace, 2-stellig 0-padded), Priority-Dot (8 px circle), external_id (monospace amber, 80 px max-width), Titel (flex: 1, ellipsis), 4× Readiness-Square (6×6 px)
- **Readiness-Square:** `width: 6px; height: 6px; border-radius: 1px`, `background: var(--green)` wenn true, `background: var(--border)` wenn false — reihenfolge: spec / questions / dependencies / effort
- **Bottom-Sheet (mobile):** `position: fixed; bottom: 0; left: 0; right: 0; height: 60vh`, `background: var(--surface)`, `border-radius: 12px 12px 0 0`, `transform: translateY(0)` via CSS-Transition, Schließen per Swipe-down oder × Button
- **Effort-Badge:** `<button>` mit `data-value="klein|mittel|gross"`, Amber-Outline wenn gewählt, `font-size: 0.7rem`

### Mobile-Ansatz

Die Svelte-Komponente liest beim Mount `window.innerWidth < 768` und den localStorage-Override. Ein reaktiver `$: isMobile`-Store (oder einfache Variable + `resize`-Listener) schaltet zwischen Desktop-Grid und Mobile-Stack. Bottom-Sheet wird als `<div class="sheet" class:open={sheetOpen}>` gerendert, nicht als Portal — bleibt im DOM, wird per CSS ein/ausgeblendet.

---

## Akzeptanzkriterien

1. **Queue-Layout:** Jede Zeile ist genau 56 px hoch (gemessen via `getBoundingClientRect`), enthält zweistellige monospace Rang-Zahl (01, 02…), Priority-Dot, external_id in `#f59e0b`, Titel und 4 Readiness-Squares.
2. **Drag-Rank:** Drag einer Zeile auf eine andere Position sendet `PATCH` mit neuem Rang und die Queue re-rendert sich ohne Reload in der neuen Reihenfolge; Playwright-Test via `dragAndDrop`.
3. **Selection:** Klick auf eine Zeile markiert sie mit 3 px Amber Left-Border + `#1e2736` Hintergrund und befüllt das rechte Detail-Panel mit Daten des gewählten Items.
4. **Stats Bar:** Top-Bar zeigt korrekte Counts `X planning · Y ready · Z blocked` (ready = dorScore 4, blocked = dependsOn.length > 0 && dorScore < 4), aktualisiert sich nach jeder Readiness-Änderung.
5. **Promote-Button:** Nur aktiv wenn dorScore === 4 oder override gesetzt; sendet `POST /api/planning-office/:extId/promote`; bei 200 verschwindet das Item aus der Queue und eine Erfolgsmeldung (`✓ Zur Planung freigegeben`) erscheint 2 s lang.
6. **Readiness-Autosave:** Checkbox-Toggle sendet sofort `PATCH` und aktualisiert den entsprechenden Readiness-Square in der Queue-Zeile — ohne manuellen Speichern-Button.
7. **Mobile Bottom-Sheet:** Auf Viewport < 768 px öffnet Tap auf eine Queue-Zeile ein Bottom-Sheet mit vollem Detailbereich; alle Aktionen (Readiness, Effort, Deps, Promote) sind dort ausführbar; Swipe-down schließt das Sheet.
8. **Neue API-Route:** `GET /api/admin/planungsbuero` gibt `{ items: [...], stats: { planning, ready, blocked } }` zurück; BATS-Test `FA-PB-01` prüft Stats-Berechnung gegen eine In-Memory-Fixture.
9. **View-Toggle:** Klick auf Toggle-Button setzt `localStorage.planungsbuero_view` und wechselt sofort die Ansicht; Reload behält den Override.
10. **data-testid:** Alle interaktiven Elemente tragen `data-testid`-Attribute gemäß Naming-Convention `pb-*` (z. B. `pb-queue-row-{extId}`, `pb-detail-promote`, `pb-sheet-close`).

---

## Nicht-Scope

- Design-System-Tokens aus T000597 werden NICHT abgewartet — die Farben werden lokal als CSS-Custom-Properties im Svelte-File definiert. Wenn T000597 mergt, können die Tokens nachträglich per Find-Replace extrahiert werden.
- Server-Side-Rendering des Queue-Inhalts — alles client:load, da Admin-gated.
- Accessibility über ARIA-Roles hinaus (kein vollständiges a11y-Audit im Scope dieses Tickets).
- Export-Funktion (CSV/JSON) der Queue.
