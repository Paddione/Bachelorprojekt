# Design: K5 — Epic-Canvas & Planungs-Workflow

**Ticket:** T002464
**Slug:** epic-canvas-k5
**Branch:** feature/sdlc-cockpit-k5-epic-canvas-T002464
**Target Spec:** sdlc-cockpit (K1/K2)

## Abhängigkeiten

- K1 (T002460) — Lavish Design-Kit: CSS-Tokens, Panel-Laufzeit
- K2 (T002461) — Daemon mit Daten-Endpoints

## Scope

### Epic-Canvas (Panel + Vollfläche) E6/E7

Ein neuer Panel-Typ `.lavish/kit/panel-epic-canvas.html` (und .js/.css) der:
- Eine Liste laufender Epics anzeigt (E6)
- Pro Epic: Titel, Status, Priority, Epic-ID
- Umschaltbar zwischen Panel- und Vollflächen-Layout (E7)
- Die Epics kommen vom Daemon (`/api/cockpit/epics` — neuer Endpoint in K2-Route)

### Planungs-Workflow (E8)

Der Canvas zeigt für jedes Epic die nächsten Aktionen an:
- "Brainstorming starten" → öffnet Lavish-Board
- "Grilling" → record_grill_answers UI
- "OpenSpec-Entwurf" → openspec propose
- "Stagen" → stage_plan

### Canvas-Store (E13/E15)

Eigener JSON-Speicher pro Canvas-Session (IndexedDB/LocalStorage):
- Canvas-Inhalt = Quelle (E15)
- Exporte erzeugen Spec/Tickets/OpenSpec neu
- **Nicht blind überschreiben** (OF1): Vor Export prüfen, ob openspec/changes/ Dateien seit letztem Export geändert wurden

### OF1: Eigentumsgrenze

Canvas besitzt: Status, Epic-Beschreibung, Nächste-Schritt, Notizen
Umsetzung besitzt: Task-Häkchen in tasks.md, Delta-Korrekturen in specs/
Vor Export: `git diff` gegen den Branch → wenn tasks.md/specs geändert, Warnung statt Überschreiben

### OF2: ticket_plans ist leer — bestätigt

Canvas nutzt IndexedDB/LocalStorage, NICHT die ticket_plans-Tabelle.

## File Structure

```
.lavish/kit/
├── panel-epic-canvas.html   # [NEW] Epic-Canvas Panel
├── panel-epic-canvas.js      # [NEW] Panel-Logik
├── panel-epic-canvas.css     # [NEW] Panel-Styles
├── canvas-store.js           # [NEW] IndexedDB Canvas-Store
└── cockpit-shell.html        # [CHANGED] Epic-Spalte einbauen

.lavish/kit/daemon/routes/
└── epics.ts                  # [NEW] GET /api/cockpit/epics

tests/
└── spec/epic-canvas/
    ├── canvas-store.bats
    └── epic-panel.bats
```

## Partials

| p1 | tasks.d/p1-canvas-store.md | implementation | .lavish/kit/canvas-store.js |
| p2 | tasks.d/p2-epics-route.md | implementation | .lavish/kit/daemon/routes/epics.ts |
| p3 | tasks.d/p3-epic-panel.md | implementation | .lavish/kit/panel-epic-canvas.html, .lavish/kit/panel-epic-canvas.js, .lavish/kit/panel-epic-canvas.css, .lavish/kit/cockpit-shell.html |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/epic-canvas/*.bats |
