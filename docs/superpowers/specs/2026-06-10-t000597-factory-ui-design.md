# Spec: Factory UI — Design System (Industrial/Loft)

**Ticket:** T000597
**Branch:** feature/t000597
**Datum:** 2026-06-10
**Status:** draft

---

## Ziel

Aufbau einer konsistenten Industrial/Loft Token-Library und wiederverwendbarer Svelte-Basiskomponenten fuer alle Factory-UI-Seiten (`/dev-status`, Factory-Floor, Planungsbuero). Die Token-Library definiert Farben, Typografie und Abstands-Tokens; die vier Komponenten (PilotLight, WorkpieceCard, PhaseBadge, ViewSwitcher) bilden die visuelle Sprache der gesamten Factory-UI-Suite und muessen vor den Sub-Features T000598–T000601 fertig sein.

---

## Scope

### Inbegriffen

- CSS Custom Properties / Design-Tokens als zentrales Stylesheet (`factory-tokens.css`)
- Svelte-Komponenten unter `website/src/components/factory/`:
  - `PilotLight.svelte` — runder Status-Indikator mit 3 Zustaenden (green / amber / red), Glow-Effekt
  - `WorkpieceCard.svelte` — Ticket-Karte mit 4 px LED-Strip links, priority-coloriert, Monospace-Layout
  - `PhaseBadge.svelte` — Pill-Badge mit Phase-Label und zugeordneter Farbe
  - `ViewSwitcher.svelte` — Viewport-Auto-Detection (CSS media query) + localStorage Override, dezenter Toggle
- Storybook-ahnliche Demo-Seite unter `website/src/pages/factory/design-system.astro` (nur im Dev-Build, kein Produktions-Route hinter SSO)
- Inline-Dokumentation der Tokens und Komponenten via JSDoc/HTML-Kommentare

### Explizit NICHT inbegriffen

- Neue Kubernetes-Manifeste, Ingress-Regeln oder Domain-Eintraege
- Datenbankschema-Aenderungen oder neue `environments/schema.yaml`-Variablen
- Authentifizierungs-Logik (SSO/Keycloak)
- Implementierung der eigentlichen Factory-Floor-Seiten (T000598–T000601)
- Backend-API-Aenderungen
- Neue npm-Abhaengigkeiten ausser optionalen Dev-Tools

---

## Design-Entscheidungen

### Farbsystem

| Token                  | Hex       | Verwendung                                      |
|------------------------|-----------|--------------------------------------------------|
| `--factory-bg`         | `#0d1117` | Seitenbackground                                 |
| `--factory-surface`    | `#1e2736` | Karten- und Panel-Background                     |
| `--factory-surface-2`  | `#252f40` | Erhoehte Surfaces (Hover, Focus-State)           |
| `--factory-amber`      | `#f59e0b` | Primaer-Akzent, CTA, Highlight-Border            |
| `--factory-green`      | `#22c55e` | Terminal-Green, Success, Online-State            |
| `--factory-red`        | `#ef4444` | Critical, Error, Offline-State                   |
| `--factory-blue`       | `#3b82f6` | Medium-Priority, Info                            |
| `--factory-gray`       | `#6b7280` | Low-Priority, Disabled, Muted Text               |
| `--factory-text`       | `#e2e8f0` | Haupttext                                        |
| `--factory-text-muted` | `#94a3b8` | Sekundaertext, Metadaten                         |
| `--factory-border`     | `#2d3748` | Trennlinien, Kanten                              |

### Priority-Farbzuordnung

| Priority   | Token                | Hex       |
|------------|----------------------|-----------|
| `critical` | `--factory-red`      | `#ef4444` |
| `high`     | `--factory-amber`    | `#f59e0b` |
| `medium`   | `--factory-blue`     | `#3b82f6` |
| `low`      | `--factory-gray`     | `#6b7280` |

### Typografie

- `--factory-font-mono`: `'JetBrains Mono', 'Fira Mono', 'Courier New', monospace` — alle Labels, IDs, Metriken
- `--factory-font-sans`: Systemstack fuer Fliesstexte (minimaler Einsatz)
- Basisgroesse: 13 px, kein rem-Upscaling an Factory-UI-Elementen

### Abstands- und Raster-System

- `--factory-gap-xs`: 4 px
- `--factory-gap-sm`: 8 px
- `--factory-gap-md`: 16 px
- `--factory-gap-lg`: 24 px
- Schweres Raster-Overlay optional als CSS-Klasse `.factory-grid-overlay`

### Komponenten

#### PilotLight.svelte

- Props: `state: 'green' | 'amber' | 'red'`, `label?: string`, `size?: 'sm' | 'md' | 'lg'`
- Runder Indikator (12 px / 16 px / 24 px), radialer Glow via `box-shadow`
- Kein Blinken im Standard-State; `amber` pulst bei `animated`-Flag

#### WorkpieceCard.svelte

- Props: `ticket: { id, title, phase, priority, assignee?, age_hours? }`, `compact?: boolean`
- 4 px linker Border-Strip in Priority-Farbe
- Monospace-Ticket-ID oben links, Title in Haupttext, Phase als PhaseBadge rechts
- Hover: `--factory-surface-2` Background + Amber-Border oben

#### PhaseBadge.svelte

- Props: `phase: string`, `color?: string` (auto aus bekannten Phasen, sonst Fallback Gray)
- Bekannte Phasen: `scout | plan | implement | review | done | blocked`
- Pill-Form: `border-radius: 9999px`, Monospace, 11 px

#### ViewSwitcher.svelte

- Props: `storageKey?: string` (default `'factory-view'`)
- Auto-detect: `@media (max-width: 768px)` → `compact`, darüber → `full`
- Override via localStorage: Wert `'compact'` oder `'full'`
- Toggle-Icon: dezent oben rechts (Grid vs. List Icon), keine Modal-Unterbrechung
- Emittiert Custom-Event `viewchange` mit `{ view: 'compact' | 'full' }`

### Mobile-Ansatz

- VOLLE Funktionsparitaet — kein abgespecktes Design
- WorkpieceCard im Compact-Mode: LED-Strip bleibt, Title verkuerzt, Metadaten in zweiter Zeile
- PilotLight immer voll sichtbar, kein Ausblenden auf kleinen Screens
- ViewSwitcher-Toggle auf Mobile in der Nav-Leiste (kein Floating-Button)

---

## Akzeptanzkriterien

1. **Token-Vollstaendigkeit:** Alle definierten CSS Custom Properties in `factory-tokens.css` sind vorhanden und ergeben beim Laden einer Factory-Seite keinen ungueltige-Variable-Fallback (pruefbar via Browser DevTools `getComputedStyle`).

2. **PilotLight — drei Zustaende sichtbar:** In der Design-System-Demo-Seite rendern alle drei States (`green`, `amber`, `red`) mit dem korrekten Glow-Effekt; Screenshot-Diff oder manuelle Sichtpruefung genuegt.

3. **WorkpieceCard — Priority-Strip:** Fuer jeden der vier Priority-Werte (`critical`, `high`, `medium`, `low`) zeigt die Karte den korrekten 4 px linken Border in der spezifizierten Farbe; kein schwarzer oder weisser Fallback-Strip.

4. **ViewSwitcher — localStorage Persistenz:** Nach manuellem Toggle auf `compact` und Seiten-Reload bleibt der Wert `compact` aktiv (localStorage-Key vorhanden); nach Reload auf `full` bleibt `full` aktiv.

5. **Mobile Vollparitaet:** Auf Viewportbreite 375 px (iPhone SE) sind alle vier Komponenten ohne horizontales Overflow-Scrollen sichtbar; WorkpieceCard zeigt alle Pflichtfelder (ID, Title, Priority-Strip, PhaseBadge).

6. **Keine SaaS-Look-Elemente:** Kein weisser Background, kein serifenloser Sans-Serif als Haupt-Font an Factory-Komponenten, kein Schatten-Effekt im Material-Design-Stil (nur Glow/LED-Effekte erlaubt).

7. **TypeScript-sauber:** `pnpm tsc --noEmit` laeuft ohne Fehler in `website/`; alle Props haben explizite Typen.

---

## Nicht-Scope

- Animierte Foerderband-Hintergrund-Grafiken (koennen spaeter ergaenzt werden)
- Dark-/Light-Mode-Toggle (Factory-UI ist immer Dark)
- Barrierefreiheits-Audit (WCAG — separate Story)
- Integration mit bestehendem Kore Design System (`website/src/components/kore/`)
- Neue Routen hinter Keycloak-SSO fuer die Demo-Seite
