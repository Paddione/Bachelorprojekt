---
title: Cockpit Mobile-View Implementation Plan
ticket_id: T000987
domains: [website]
status: active
---

# Cockpit Mobile-View Implementation Plan

**Goal:** Das Projekt-Cockpit `/admin/cockpit` ist auf 360px-Breite ohne
horizontales Scrollen bedienbar. Container-Queries steuern das Layout, das
Sidekick-Drawer wird per Hamburger-Toggle geschaltet, alle Touch-Targets sind
≥48dp. Die Desktop-View (≥1024px) bleibt unverändert. Nur mentolder-Brand.

**Tech Stack:** Astro + Svelte 5 (Runes), CSS Container Queries (`@container`),
Vitest + @testing-library/svelte.

## File Structure

| Path | Type | Purpose |
|------|------|---------|
| `website/src/styles/mobile-cockpit.css` | new | `@container`-Regeln für schmale Viewports, Touch-Target-Mindestmaße, Truncation, Fallback |
| `website/src/pages/admin/cockpit.astro` | modify | Wrapper-Div mit `container-type: inline-size`, Import von `mobile-cockpit.css` |
| `website/src/components/admin/Cockpit/MobileToggle.svelte` | new | Hamburger-Button (≥48dp), dispatcht `cockpit:toggle-sidekick`-CustomEvent |
| `website/src/components/admin/Cockpit/cockpit-mobile.test.ts` | new | TDD-Test: Toggle-Render, Event-Dispatch, Container-Anker |
| `website/src/components/admin/Cockpit.svelte` | modify | Rendert `<MobileToggle>` im Header, hostet Sidekick-Open-State + Window-Listener |
| `website/src/components/PortalSidekick.svelte` | modify | Lauscht auf `cockpit:toggle-sidekick` im admin-Kontext, Mobile-Drawer full-width |
| `website/src/components/admin/CockpitTable.svelte` | modify | Touch-Targets ≥48dp, Ticket-Titel-Truncation mit `title`-Tooltip |
| `website/src/components/admin/ContainerRollupHeader.svelte` | modify | Karten-Stacking im schmalen Container via `@container` |

## Tasks

### Task 1: TDD — Mobile-Layout-Test schreiben (rot)

- [ ] Erstelle `website/src/components/admin/Cockpit/cockpit-mobile.test.ts` mit Tests:
  - `MobileToggle` rendert einen Button mit `aria-label="Sidekick öffnen"`
  - `MobileToggle` hat ≥48dp Höhe und Breite (`getBoundingClientRect`-Assertion)
  - Klick auf den Toggle dispatcht ein `cockpit:toggle-sidekick`-Window-CustomEvent mit `detail: { source: 'cockpit' }`
  - `Cockpit`-Wrapper trägt `data-container="cockpit"` (Container-Query-Anker)
- [ ] Führe aus: `cd website && npx vitest run src/components/admin/Cockpit/cockpit-mobile.test.ts` — expected: fail (Komponenten existieren noch nicht)

### Task 2: Container-Query-CSS — `mobile-cockpit.css`

- [ ] Erstelle `website/src/styles/mobile-cockpit.css` mit:
  - `[data-container="cockpit"] { container-type: inline-size; overflow-x: hidden; }`
  - `@container (max-width: 480px)` — vertikales Stacking der Ticket-Liste, Rollup-Header als gestapelte Karte, MobileToggle sichtbar (`display: inline-flex`), Sidekick-Drawer als full-width-overlay
  - `@container (min-width: 481px) and (max-width: 1023px)` — MobileToggle sichtbar, Sidekick als schmaler Streifen einklappbar (Tablet-Zwischenlayout)
  - `@container (min-width: 1024px)` — MobileToggle ausgeblendet (`display: none`), Desktop-Layout unverändert
  - Touch-Target-Regel: `[data-container="cockpit"] button, [data-container="cockpit"] [role="button"] { min-height: 48px; min-width: 48px; }`
  - Truncation: `.cockpit-ticket-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`
  - Fallback: `@supports not (container-type: inline-size) { [data-container="cockpit"] .cockpit-main { display: block; } [data-container="cockpit"] .mobile-toggle { display: inline-flex; } }`
- [ ] Validiere CSS-Syntax: `cd website && npx stylelint src/styles/mobile-cockpit.css` (falls stylelint nicht konfiguriert, `npx lightningcss --minify src/styles/mobile-cockpit.css > /dev/null && echo OK`)

### Task 3: `cockpit.astro` — Container-Wrapper + CSS-Import

- [ ] In `website/src/pages/admin/cockpit.astro` Frontmatter: `import '../../styles/mobile-cockpit.css';` (nach bestehenden Imports)
- [ ] Umschließe `<Cockpit {portfolioInitial} {brand} client:load />` mit `<div data-container="cockpit" class="cockpit-container">`
- [ ] Der Wrapper übernimmt die volle Main-Breite (`width: 100%`) und verhindert horizontales Overflow durch das in Task 2 gesetzte `overflow-x: hidden`

### Task 4: `MobileToggle.svelte` — Hamburger-Komponente

- [ ] Erstelle `website/src/components/admin/Cockpit/MobileToggle.svelte` (Svelte 5 Runes):
  - `$props()`: `{ open = false, onToggle = () => {} }`
  - Rendert `<button class="mobile-toggle" type="button" aria-label={open ? 'Sidekick schließen' : 'Sidekick öffnen'} aria-expanded={open} onclick={handleClick}>` mit Hamburger-SVG-Icon (drei Striche)
  - `handleClick` dispatcht `window.dispatchEvent(new CustomEvent('cockpit:toggle-sidekick', { detail: { source: 'cockpit' } }))` und ruft `onToggle()` auf
  - `<style>`: `.mobile-toggle { min-height: 48px; min-width: 48px; display: none; align-items: center; justify-content: center; background: var(--admin-surface); border: 1px solid var(--admin-border); border-radius: 8px; cursor: pointer; color: var(--admin-text); }` — `display: none` als Default, sichtbar nur via `@container`-Regeln aus `mobile-cockpit.css`
- [ ] Test aus Task 1 ausführen: `cd website && npx vitest run src/components/admin/Cockpit/cockpit-mobile.test.ts` — Toggle-Render- und Event-Tests müssen PASS sein (Cockpit-Wrapper-Test bleibt rot bis Task 5)

### Task 5: `Cockpit.svelte` + `PortalSidekick.svelte` — Toggle-Wiring

- [ ] `website/src/components/admin/Cockpit.svelte`:
  - Importiere `MobileToggle from './Cockpit/MobileToggle.svelte'`
  - Füge `let sidekickOpen = $state(false)` hinzu
  - Rendere `<MobileToggle open={sidekickOpen} onToggle={() => (sidekickOpen = !sidekickOpen)} />` als erstes Kind in `.cockpit-shell`
  - `onMount`-Block: registriere `window.addEventListener('cockpit:toggle-sidekick', () => (sidekickOpen = !sidekickOpen))` mit Cleanup im Return
  - Setze `data-container="cockpit"` am `.cockpit-shell`-Div (falls nicht schon über cockpit.astro-Wrapper abgedeckt — stelle sicher, dass genau ein Element das Attribut trägt)
- [ ] `website/src/components/PortalSidekick.svelte`:
  - Im `$effect`-Block (neben dem bestehenden `checkMobile`-Effekt): registriere `window.addEventListener('cockpit:toggle-sidekick', onCockpitToggle)` wobei `onCockpitToggle` `open = !open` setzt, aber nur wenn `helpContext === 'admin'` (Cockpit ist admin-only)
  - Cleanup: `return () => window.removeEventListener('cockpit:toggle-sidekick', onCockpitToggle)`
  - Behalte `isMobile` und `checkMobile()` für die Drawer-Breitenberechnung bei (`drawerWidth` bei Mobile = `window.innerWidth`), aber entferne jegliche Layout-Entscheidung, die jetzt über Container-Queries läuft
- [ ] Type-Check: `cd website && npx svelte-check --tsconfig ./tsconfig.json --threshold error` — keine neuen Fehler
- [ ] Test aus Task 1 vollständig: `cd website && npx vitest run src/components/admin/Cockpit/cockpit-mobile.test.ts` — alle Tests PASS

### Task 6: Responsive `CockpitTable` & `ContainerRollupHeader`

- [ ] `website/src/components/admin/CockpitTable.svelte`:
  - Füge `class="cockpit-ticket-title"` und `title={t.title}`-Attribut an den Ticket-Titel-Cells hinzu (nativer Tooltip bei Truncation durch CSS aus Task 2)
  - Stelle sicher, dass Status-Chips und Aktions-Buttons keine harten `min-height`/`min-width`-Werte haben, die die 48dp-Regel aus `mobile-cockpit.css` unterschreiten
  - Tabellen-Wrapper: `overflow-x: auto` nur auf dem Tabellen-Container selbst, nicht auf dem Cockpit-Shell-Wrapper
- [ ] `website/src/components/admin/ContainerRollupHeader.svelte`:
  - Setze `class="rollup-header"` am Wurzel-Element, sodass `@container (max-width: 480px) .rollup-header { flex-direction: column; }` aus `mobile-cockpit.css` greift und den Header zur gestapelten Karte umbaut
- [ ] Visuelle Verifikation im Dev-Server: `cd website && npm run dev`, dann Browser-Devtools auf 360px Breite — keine horizontale Scrollbar, Sidekick per Hamburger aufklappbar, Touch-Targets ≥48dp, Ticket-Titel truncieren mit Tooltip

### Task 7: Finale Verifikation

- [ ] `task test:changed` — alle durch die Änderungen berührten Tests grün
- [ ] `task freshness:regenerate` — generierte Artefakte (test-inventory, route-manifest) aktualisieren und committen
- [ ] `task freshness:check` — S1–S4-Ratchet + Baseline-Assertion grün
