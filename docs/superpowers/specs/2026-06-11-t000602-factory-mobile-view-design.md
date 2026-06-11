# Spec: T000602 — Factory UI — Mobile Factory View (Claude Design impl.)

**Parent:** T000598 (FactoryFloor Redesign — vollständig abgeschlossen, A1–A11 done)
**Design-System:** T000597 (factory-tokens.css, Industrial/Loft)
**Branch:** feature/T000602-factory-mobile-view
**Datum:** 2026-06-11

---

## Ziel

Die `/dev-status` Factory View ist aktuell auf Desktop vollwertig. Auf Mobilgeräten (< 768 px) existiert eine Tab-Bar-Skeleton-Implementierung und Swipe-Navigation — aber drei kritische Gaps blockieren echte Funktionsparität:

1. **DetailPanel ist kein echtes Mobile-Overlay** — `width: 100%` mit falschem `inset` führt zu einem "linksverklebten" Panel, kein Backdrop, kein natürlicher Schließ-Button-Platzierung
2. **Content-Padding-Kollision** — AdminLayout setzt `padding-top: 60px` (Topbar), MobileTabBar braucht `padding-bottom: 48px` + Safe-Area — fehlt komplett
3. **DevStatusTabs Tab-Bar nicht mobile-responsive** — 5 Tabs `overflow: visible` auf kleinem Viewport

Zusätzlich gibt es zwei _fehlende Features_ für volle Parität:
- **Leitstand-Karten auf Mobile unlesbar** — 8 Karten in `grid-cols-2` mit 160 px Mindestbreite passen nicht auf 375 px Viewport ohne Scroll-Verlust
- **Keine visuellen Indikatoren** für Swipe-Navigierbarkeit (User weiß nicht, dass weitere Columns per Swipe erreichbar sind)

---

## Scope

### Enthalten

1. **Gap-Fix: DetailPanel Mobile-Overlay** — vollwertiges Full-Screen-Overlay mit Slide-up-Animation, Close-Button (oben rechts, großer Touch-Target 44×44 px), Backdrop (halbtransparent), Scroll im Panel-Inneren, kein Viewport-Überlauf
2. **Gap-Fix: Content-Padding Bottom** — `padding-bottom: calc(var(--factory-tab-bar-height) + env(safe-area-inset-bottom, 0px))` auf dem Factory-Floor-Wrapper auf Mobile, damit der untere Content nicht von der Tab-Bar abgeschnitten wird
3. **Gap-Fix: DevStatusTabs Mobile Scroll** — `overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap;` auf `.tab-bar-wrap` bei `max-width: 767px`; Tabs komprimieren auf kürzere Labels auf Mobile (`Factory | Planung | Ctrl | Stats | Deps`)
4. **Enhancement: Leitstand-Grid Mobile-Optimierung** — auf Mobile (< 768 px) `grid-cols-2` beibehalten aber Karten kompakter darstellen (`p-2`, `text-base` statt `text-xl` für Werte, kein Overflow); optionale horizontale Scroll-Bar wenn Karten zu eng
5. **Enhancement: Swipe-Indikatoren** — „Dots" oder eine minimalistische Stations-Fortschrittsleiste (kompakte Punkte-Reihe, 4 px, aktiv = Amber) unterhalb der MobileTabBar als visuelle Orientierung
6. **Enhancement: MobileTabBar Haptic-Feedback** — `navigator.vibrate(5)` bei Tab-Wechsel (soft-vibrate, nur wenn API verfügbar)
7. **Enhancement: Touch-Target-Optimierung** — WorkpieceCards auf Mobile mindestens 44 px Höhe (statt 80 px Desktop — auf Mobile können sie schlanker sein, aber Touch-Target muss 44 px erfüllen per WCAG 2.5.5)
8. **Neue E2E-Tests** — Mobile Playwright-Tests (`FA-MOBILE-01` bis `FA-MOBILE-06`) mit Viewport 375×812 (iPhone 12 Profil)
9. **Stale-Banner auf Mobile** — der Stale-State-Banner (`stale = true`) muss auf Mobile sichtbar sein, ohne von der Tab-Bar überdeckt zu werden

### Explizit NICHT enthalten

- Keine Änderungen an Backend-APIs oder Datenbankschema
- Keine QS-Abnahme-Mobile-UI (T000581)
- Keine Änderungen an `k3d/`, `environments/`, `prod/`
- Keine Animation der Workpieces entlang des Förderbands
- Keine Landscape-Tablet-Optimierung (Ziel: Portrait Mobile < 768 px)
- Keine PWA/Home-Screen-Optimierung (kein Manifest, kein Service-Worker)

---

## Analyse der existierenden Implementierung (T000598-Stand)

### Was bereits funktioniert

| Feature | Implementierung | Status |
|---------|----------------|--------|
| MobileTabBar Fixed-Bottom | `display: flex` @ `max-width: 767px`, 10 Tabs | Fertig, korrekt |
| Swipe-Navigation | `touchstart/touchend`, ±40 px Delta → `mobileColIndex` | Fertig, korrekt |
| `mobileColIndex` State | 0–9, MOBILE_COL_INDEX Map, gesteuert von TabBar + Swipe | Fertig |
| `mobile-visible` Toggle | `class:mobile-visible={mobileColIndex === N}` auf allen 10 Columns | Fertig, korrekt |
| factory-tokens.css | `--factory-tab-bar-height: 48px`, alle Design-Tokens | Fertig |
| Conveyor → Mobile hide | `ConveyorBelt: display:none @max-width:767px` | Korrekt (MobileTabBar übernimmt) |

### Bekannte Gaps (diese Spec schließt sie)

**Gap 1 — DetailPanel Mobile Inset:**
```css
/* AKTUELL (DetailPanel.svelte ~Zeile 425) */
@media (max-width: 767px) {
  .detail-panel { width: 100%; }
}
/* FEHLT: position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 200; */
/* FEHLT: Backdrop-Overlay, Close-Button Touch-Target, Scroll innerhalb Panel */
```

**Gap 2 — Padding Bottom fehlt:**
```css
/* FEHLT in FactoryFloor.svelte .factory-floor Wrapper */
@media (max-width: 767px) {
  .factory-floor {
    padding-bottom: calc(48px + env(safe-area-inset-bottom, 0px));
  }
}
```

**Gap 3 — DevStatusTabs Overflow:**
```css
/* AKTUELL (DevStatusTabs.svelte:125) */
.tab-bar-wrap { display: flex; gap: 0; padding: 0 1.5rem; }
/* FEHLT: overflow-x: auto auf Mobile, kürzere Labels */
```

---

## Design-Entscheidungen

### DetailPanel Mobile: Slide-Up Full-Screen-Overlay (Empfehlung: Bottom-Sheet)

**Entscheidung:** Bottom-Sheet-Pattern statt Slide-from-Right auf Mobile.

**Begründung:** Auf Mobile navigieren User mit einer Hand. Ein Panel, das von rechts hereinkommt (Desktop-Pattern), erfordert horizontale Wischgesten — die bereits für Column-Navigation belegt sind. Ein Bottom-Sheet (75 % Viewport-Höhe, Slide-Up) ist:
- Nicht-kollisionierend mit horizontalen Swipe-Gesten
- Ein natives Mobile-UX-Pattern (iOS/Android-konsistent)
- Erreichbar mit dem Daumen

**Implementierung:**
```css
@media (max-width: 767px) {
  .detail-panel {
    /* Überschreibt Desktop fixed-right */
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 75vh;
    max-height: calc(100vh - 60px - 48px); /* Topbar + TabBar abziehen */
    border-left: none;
    border-top: 1px solid var(--factory-border);
    border-radius: var(--factory-radius-md) var(--factory-radius-md) 0 0;
    transform: translateY(100%);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    z-index: 200;
  }
  .detail-panel.open {
    transform: translateY(0);
    transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
  }
  .detail-panel__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 199;
  }
  .detail-panel__close {
    position: sticky;
    top: 0;
    right: 0;
    margin-left: auto;
    display: block;
    width: 44px; height: 44px;
    /* Sichtbarer Handle-Indikator oben */
  }
  /* Handle-Bar (Drag-Indikator) */
  .detail-panel::before {
    content: '';
    display: block;
    width: 36px; height: 4px;
    background: var(--factory-border);
    border-radius: 2px;
    margin: 8px auto 16px;
  }
}
```

**Backdrop:** `<div class="detail-panel__backdrop" onclick={onClose}>` — nur auf Mobile rendern (via `{#if isMobile && selected}`).

### DevStatusTabs: Scrollable Tab-Bar mit Short Labels

**Entscheidung:** Scrollbar + Kurzbeschriftungen statt Collapse/Dropdown.

**Kurz-Labels Mapping:**
| Vollständig | Mobile-Label |
|-------------|-------------|
| Factory Floor | Factory |
| Planungsbüro | Planung |
| Control Panel | Control |
| Analytics | Analytics |
| Abhängigkeiten | Deps |

**CSS:**
```css
@media (max-width: 767px) {
  .tab-bar-wrap {
    padding: 0 0.75rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none; /* Firefox */
  }
  .tab-bar-wrap::-webkit-scrollbar { display: none; }
  .ds-tab {
    padding: 8px 12px;
    font-size: 12px;
    white-space: nowrap;
    flex-shrink: 0;
  }
}
```

### Swipe-Indicator: Dot-Row

**Entscheidung:** 10 Punkte (2 px Breite, 4 px Gap), aktiver Punkt = 6 px Breite + Amber-Farbe, in der MobileTabBar integriert (über den Tab-Labels) oder als separate kompakte `<div>`.

**Platzierung:** In `FactoryFloor.svelte`, direkt über `<MobileTabBar>`, nur auf Mobile sichtbar:
```html
<div class="mobile-station-dots" aria-hidden="true">
  {#each Array(10) as _, i}
    <span class="dot" class:active={i === mobileColIndex}></span>
  {/each}
</div>
```

```css
.mobile-station-dots {
  display: none;
}
@media (max-width: 767px) {
  .mobile-station-dots {
    display: flex;
    justify-content: center;
    gap: 4px;
    padding: 6px 0;
  }
  .dot {
    width: 4px; height: 4px;
    background: var(--factory-border);
    border-radius: 2px;
    transition: width 0.15s, background 0.15s;
  }
  .dot.active {
    width: 8px;
    background: var(--factory-accent);
  }
}
```

### Leitstand-Grid Mobile

**Entscheidung:** Beibehalten `grid-cols-2` (4 Reihen × 2 Spalten = 8 Karten), aber kompaktere Typografie.
- Werte: `text-lg` (1.125rem) statt `text-xl` (1.25rem) auf Mobile
- Padding: `p-2` statt `p-3`
- Schriftgröße Metriklabel: `text-[10px]` statt `text-xs`

Keine horizontale Scroll-Bar — 2 Spalten passen auf 375 px problemlos.

### Stale-Banner Mobile

Das Banner befindet sich im FactoryFloor-Template und nutzt absolute Positionierung. Auf Mobile muss es oberhalb der Tab-Bar sichtbar sein (nicht von ihr überdeckt). Lösung: `bottom: calc(48px + env(safe-area-inset-bottom, 0px))` wenn Stale-Banner `position: fixed` nutzt, oder als normaler Block-Element-Flow im Content (kein position:fixed).

### Haptic Feedback

```typescript
function onTabSelect(i: number) {
  mobileColIndex = i;
  if ('vibrate' in navigator) navigator.vibrate(5);
}
```

---

## Komponenten-Änderungen (Dateiliste)

| Datei | Art der Änderung | Priorität |
|-------|-----------------|-----------|
| `website/src/components/factory/DetailPanel.svelte` | Bottom-Sheet Mobile Overlay — CSS + `open` Class-Binding, Backdrop-Slot, `isMobile` Prop | **Kritisch** |
| `website/src/components/FactoryFloor.svelte` | Padding-Bottom Mobile, Dot-Indicator, Haptic-Call in `onTouchEnd`, DetailPanel `isMobile` Prop | **Kritisch** |
| `website/src/components/DevStatusTabs.svelte` | Mobile scrollable Tab-Bar, Short-Labels via `{#if isMobile}` oder CSS `content:` Override | **Kritisch** |
| `website/src/components/factory/MobileTabBar.svelte` | Haptic-Feedback bei `onSelect`, `aria-label` pro Tab | Hoch |
| `website/src/styles/factory-tokens.css` | Ggf. `--factory-bottom-safe-area` Utility-Token hinzufügen | Niedrig |
| `tests/e2e/specs/fa-mobile-factory.spec.ts` | Neue Mobile-E2E-Tests (FA-MOBILE-01…06) | Hoch |

---

## Akzeptanzkriterien

### AC-M-01: DetailPanel als Bottom-Sheet
Auf Viewport 375×812 öffnet sich das DetailPanel beim Klick auf eine WorkpieceCard als Bottom-Sheet (Slide-Up von unten, 75 % Viewport-Höhe). Es existiert ein halb-transparenter Backdrop, der bei Tap geschlossen wird. Der ✕-Button hat mindestens 44×44 px Touch-Target. Das Panel ist scrollbar, wenn Inhalt überläuft.

### AC-M-02: Content nicht von TabBar abgeschnitten
Auf Viewport 375×812 ist der unterste sichtbare Content (z. B. letzte Laderampe-Liste-Item) nicht durch die MobileTabBar verdeckt. `padding-bottom` des Containers muss `≥ 48px + safe-area-inset-bottom` betragen.

### AC-M-03: DevStatusTabs scrollbar
Auf Viewport 375×812 sind alle 5 Tabs der äußeren Tab-Bar (`DevStatusTabs`) ohne horizontales Overflow-Clipping erreichbar. Horizontales Wischen auf der Tab-Bar scrollt die Tabs. Kein Tab ist abgeschnitten.

### AC-M-04: Swipe-Indikatoren sichtbar
Auf Viewport 375×812 zeigt die Factory Floor Tab ein Dot-Indicator-Reihe mit 10 Punkten, wobei der aktive Punkt (Amber, breiter) die aktuelle Station anzeigt. Wechsel per Swipe oder Tab-Tap aktualisiert den aktiven Punkt.

### AC-M-05: Alle 10 Stationen per Tab erreichbar
Auf Viewport 375×812 ist durch Tab-Tap auf jede der 10 MobileTabBar-Tabs die zugehörige Column sichtbar und per `data-testid` aufrufbar. Insbesondere: Kommissionierung, Laderampe, alle 6 Halle-Stationen, QS, Versand.

### AC-M-06: Leitstand-Grid lesbar
Auf Viewport 375×812 ist das Leitstand-Grid lesbar ohne horizontalen Scroll. Alle 8 Karten (Kill-Switch, Slots, Daily-Cap, Durchsatz, Ø Zyklus, Watchdog-Stale, Büro, Kommissionierung) sind sichtbar.

### AC-M-07: SSE Live-Indikator auf Mobile sichtbar
Der `data-testid="floor-pulse"` Live-Indikator ist auf Mobile sichtbar und nicht von Topbar/TabBar überdeckt.

### AC-M-08: Alle bestehenden data-testid funktional
Alle `data-testid`-Attribute aus T000598 AC-6 bleiben vollständig erhalten und via DOM auffindbar (keine Regression).

---

## E2E-Testplan

**Playwright-Projekt:** `mentolder-mobile` oder `viewport-375` — Viewport `{ width: 375, height: 812 }`.
Alle Tests nutzen `test.use({ viewport: { width: 375, height: 812 } })`.

| Test-ID | Beschreibung |
|---------|-------------|
| FA-MOBILE-01 | DetailPanel öffnet als Bottom-Sheet, Backdrop sichtbar, Close-Button ≥ 44 px |
| FA-MOBILE-02 | Content-Padding: letztes Element in Laderampe-Liste nicht von TabBar verdeckt |
| FA-MOBILE-03 | DevStatusTabs: alle 5 äußeren Tabs durch horizontales Scrollen erreichbar |
| FA-MOBILE-04 | Dot-Indikatoren: aktiver Dot wechselt bei Tap auf MobileTabBar |
| FA-MOBILE-05 | Alle 10 Stationen per MobileTabBar-Tap erreichbar, `[data-col="staged"]` sichtbar bei Tab 0 |
| FA-MOBILE-06 | Leitstand-Grid: alle 8 Karten sichtbar ohne horizontalen Scroll |

---

## Nicht-Scope (explizit)

- Keine neuen API-Endpunkte
- Keine Datenbankmigrationen
- Keine Änderungen an `environments/schema.yaml` oder `k3d/configmap-domains.yaml`
- Keine Landscape-Tablet-Optimierung
- Keine PWA/Manifest-Änderungen
- Keine Backend-SSE-Änderungen
- Keine Änderungen an `QaModal.svelte`, `QaChip.svelte` (T000581)
