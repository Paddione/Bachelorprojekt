# Spec: T000598 — Factory UI — FactoryFloor Redesign (Förderband)

## Ziel

`FactoryFloor.svelte` (`/dev-status`) erhält ein vollständiges visuelles Redesign nach der Industrial/Loft-Ästhetik des Factory-Design-Systems (T000597). Die neue Ansicht visualisiert den Produktionsfluss als horizontales Förderband mit sechs klar abgrenzbaren Workstations (Scout → Design → Plan → Implement → Verify → Deploy), verbunden durch eine doppelstrichige Förderbandlinie. Workpieces werden als eigenständige Cards (160×80 px) mit LED-Prioritätsstreifen und Spotlight-Glow auf aktiven Stationen dargestellt. Ein fixiertes Detail-Panel (400 px, Monospace) zeigt Phase-Dot-Chain und Breadcrumb-Log. Mobile erhält vollständige Funktionsparität über Tab-Bar unten und Swipe-Navigation — kein abgespecktes Design.

---

## Scope

**Enthalten:**

- Vollständiges Redesign von `FactoryFloor.svelte` auf Industrial/Loft-Ästhetik
- Förderband-Layout: 6 Workstations horizontal, doppelstrichige Verbindungslinie
- `WorkpieceCard`-Komponente (160×80 px, #1e2736, 4 px LED-Strip links, priority-coloriert)
- `PhaseBadge`-Komponente (kompakter Phase-Indikator mit State)
- `PilotLight`-Komponente (Amber-Spotlight-Glow über aktiver Station)
- Amber Spotlight-Glow (`box-shadow`/`filter`) auf der jeweils aktiven Workstation
- Detail-Panel (400 px, `position: fixed right-0`, Monospace-Font, Phase-Dot-Chain, Breadcrumb-Log, Injektionsformular)
- Mobile-Ansicht: vollständige Funktionsparität, Tab-Bar unten (10 Stationen inkl. Staged/QS/Done), Swipe-Navigation
- View-Switcher: Auto-detect Viewport + `localStorage` Override, dezenter Toggle oben rechts
- Bestehende APIs (`/api/factory-floor` SSE+REST, `/api/factory-floor/:id`) unverändert nutzen
- Alle bestehenden `data-testid`-Attribute beibehalten und ggf. ergänzen
- Leitstand-Metriken-Leiste (Kill-Switch, Slots, Daily-Cap, Throughput, Ø Zyklus, Watchdog-Stale) oben
- Kommissionierung, Laderampe, Halle, QS-Platzhalter, Versand bleiben konzeptuell erhalten

**Explizit NICHT enthalten:**

- Änderungen an Backend-APIs oder Datenbankschema
- Neue Domain-Einträge oder Schema-Vars in `environments/`
- QS-Abnahme-Implementierung (T000581 — separates Ticket)
- Änderungen an `MobileFloorNav.svelte`, `QaChip.svelte`, `QaModal.svelte` (werden wiederverwendet)
- Produktions-Deploy (dieser PR stellt nur den Frontend-Code bereit)

---

## Design-Entscheidungen

### Farbpalette

| Token | Wert | Verwendung |
|-------|------|-----------|
| `--ff-bg` | `#0d1117` | Seitenhintergrund |
| `--ff-surface` | `#1e2736` | WorkpieceCard-Hintergrund, Panel-Hintergrund |
| `--ff-amber` | `#f59e0b` | Spotlight-Glow, aktive Station, Priorität hoch |
| `--ff-green` | `#22c55e` | Terminal-Green, Priorität niedrig, Success-States |
| `--ff-red` | `#ef4444` | Blocked-State, Priorität kritisch |
| `--ff-blue` | `#3b82f6` | devflow-Driver-Badge |
| `--ff-muted` | `rgba(255,255,255,0.45)` | Sekundärtexte |
| `--ff-border` | `rgba(255,255,255,0.08)` | Trennlinien |

### LED-Strip-Farbgebung (4 px links an WorkpieceCard)

- `hoch` → `#f59e0b` (Amber)
- `mittel` → `#f97316` (Orange)
- `niedrig` → `#22c55e` (Green)
- `kritisch` → `#ef4444` (Red)
- Fallback → `rgba(255,255,255,0.2)`

### Typografie

- Monospace überall: `font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace`
- Ticket-IDs, Phase-Labels, Timestamps: immer Monospace
- Fließtext (Titel): sans-serif erlaubt, aber kompakt

### Förderband-Layout

- Desktop: horizontale `flex`-Reihe der 6 Workstations, dazwischen `::before`/`::after`-Pseudo-Elemente mit doppelstrichiger SVG-Linie (`border-top` + `border-bottom`, 2 px, je 4 px Abstand, `#f59e0b/20`)
- Jede Workstation: `min-width: 180px`, `flex: 1`, vertikales Stack (Label oben, Cards mitte, Glow-Overlay)
- Spotlight-Glow: `box-shadow: 0 -8px 32px 4px rgba(245,158,11,0.35)` an der Station, wenn `hallAt(station).length > 0`

### WorkpieceCard (160×80 px)

- `width: 160px; height: 80px; background: #1e2736; border-radius: 6px`
- Linker Rand: `4px solid <prio-color>` (LED-Strip)
- Inhalt: Ticket-ID (Monospace, oben), Titel (truncated, 2 Zeilen, klein), Driver-Badge (rechts unten), CI-Icon
- Hover: `box-shadow: 0 0 0 1px #f59e0b/60` + leichter Amber-Schimmer
- Blocked-State: `border-color: #ef4444`, `animation: pulse 1.5s infinite`
- Stuck-State (>15 Min.): `border-color: #f59e0b`, `opacity: 0.85`

### Detail-Panel

- `position: fixed; right: 0; top: 0; bottom: 0; width: 400px`
- `background: #1e2736; border-left: 1px solid rgba(255,255,255,0.08)`
- Phase-Dot-Chain: horizontale Dots für alle 6 Phasen, aktive Phase `fill: #f59e0b`, vergangene `fill: #22c55e`, zukünftige `fill: rgba(255,255,255,0.15)`
- Breadcrumb-Log: `font-family: monospace; font-size: 11px; line-height: 1.6`
- Slide-in-Animation: `transform: translateX(0)` aus `translateX(100%)`

### Mobile-Ansatz

- Kein abgespecktes Design — vollständige Funktionsparität
- Tab-Bar unten: 10 Tabs (Staged, Backlog, Scout, Design, Plan, Implement, Verify, Deploy, QS, Done)
- Swipe-Navigation: `touchstart`/`touchend` mit 40 px Schwellwert (wie bisher)
- Tab-Bar-Labels: Monospace, `font-size: 10px`, aktiver Tab `color: #f59e0b`
- View-Switcher (`localStorage: 'ff-view'`): `'conveyor'` (Standard, neue Ansicht) | `'kanban'` (Legacy-Fallback)
- Auto-detect: `window.innerWidth < 768` → immer mobile Tab-Bar
- Desktop Toggle: Icon-Button oben rechts (≡ vs Förderband-Icon)

### Komponenten-Abhängigkeit (T000597 Design System)

- `WorkpieceCard.svelte` — wird hier neu erstellt (T000597 kann noch nicht mergen)
- `PhaseBadge.svelte` — wird hier neu erstellt
- `PilotLight.svelte` — wird hier neu erstellt
- Alle drei unter `website/src/components/factory/`
- Sobald T000597 mergt: Import-Pfade auf T000597-Exports umstellen (isolierter Schritt)

---

## Akzeptanzkriterien

1. **Förderband sichtbar (Desktop):** Auf Viewport >= 1024 px werden alle 6 Workstations (Scout, Design, Plan, Implement, Verify, Deploy) horizontal nebeneinander dargestellt, verbunden durch eine doppelstrichige horizontale Linie in `#f59e0b/20`; kein vertikales Kanban-Layout.

2. **WorkpieceCard korrekt:** Jedes aktive `HallItem` rendert eine Card (ca. 160×80 px) mit sichtbarem farbigen LED-Strip (4 px) links — Amber für Priorität `hoch`, Grün für `niedrig`, Rot für `blocked`-State. Der Strip ist im Screenshot visuell eindeutig erkennbar.

3. **Spotlight-Glow aktiv:** Mindestens eine Workstation mit einem Workpiece zeigt einen Amber Glow-Effekt (`box-shadow` oder `filter: drop-shadow`) — validierbar über `data-testid="station-spotlight"` + computed style check.

4. **Detail-Panel öffnet korrekt:** Klick auf eine WorkpieceCard öffnet das Detail-Panel mit Phase-Dot-Chain (6 Dots, davon die aktive Phase `#f59e0b`) und dem Breadcrumb-Log in Monospace-Schrift. Alle bestehenden `data-testid="floor-detail"` sowie `data-testid="inject-form"` bleiben funktional.

5. **Mobile Funktionsparität:** Auf Viewport < 768 px sind alle 10 Stationen über Tab-Bar unten erreichbar. Swipe-Gesten (>40 px Delta) wechseln die aktive Station. Das Detail-Panel öffnet sich auf dem gleichen Weg wie Desktop. Kein Inhalt ist auf Mobile dauerhaft versteckt, der auf Desktop sichtbar wäre.

6. **Bestehende `data-testid`-Attribute erhalten:** `data-testid="factory-floor"`, `"floor-pulse"`, `"floor-leitstand"`, `"floor-slots"`, `"floor-workpiece"`, `"floor-detail"`, `"floor-staged-item"`, `"floor-shipped-item"`, `"floor-staged-release"`, `"inject-form"`, `"inject-submit"` existieren weiterhin und sind über DOM-Queries auffindbar.

7. **SSE bleibt funktional:** `EventSource('/api/factory-floor/stream')` wird weiterhin verbunden; `phase`-Events triggern `refresh()`, `heartbeat`-Events setzen `stale = false`. Der Live-Indikator (`data-testid="floor-pulse"`) zeigt Grün im Live-Zustand.

8. **View-Switcher persistiert:** Toggle zwischen Förderband- und Kanban-Ansicht wird in `localStorage` unter `'ff-view'` gespeichert und beim Seitenreload wiederhergestellt.

---

## Nicht-Scope

- Keine Änderungen an `website/src/pages/api/factory-floor.ts` oder den API-Routen
- Keine Datenbankmigrationen oder neue Tabellen
- Kein neues CI-Workflow oder GitHub Actions-Änderung
- Keine Änderungen an `environments/schema.yaml` oder `k3d/configmap-domains.yaml`
- QS-Abnahme-UI-Implementierung (T000581)
- Backend-seitige SSE-Änderungen
- Animierte Bewegung der Workpieces entlang des Förderbands (MVP: statisch in Stations)
