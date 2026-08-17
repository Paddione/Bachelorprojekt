---
title: "sdlc-deck-leiste-resize — Implementation Plan"
ticket_id: T011499
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# sdlc-deck-leiste-resize — Implementation Plan

_Ticket: T011499_

## File Structure

```
components/website/src/lib/sdlc/deck-resize.ts          (neu: clampDeckWidth, widthFromPointer, Konstanten)
components/website/src/lib/sdlc/deck-resize.test.ts     (neu: Vitest fuer die reine Logik)
components/website/src/components/leitstand/DeckLeiste.svelte (geändert: Resize-Handle, Persistenz, A11y)
components/website/src/pages/sdlc/cockpit.astro         (geändert: Grid-Spalte clamp + --ls-deck-width)
tests/spec/sdlc-cockpit/deck-resize.bats                (neu: Struktur-Guard, bereits im Stage-Commit)
```

## Kontext

Design-Entscheidungen in `design.md` dieses Ordners. Kern: Der Handle setzt nur die
CSS-Var `--ls-deck-width` auf `#cockpit-root`; `cockpit.astro` konsumiert sie als
`grid-template-columns: 1fr clamp(240px, var(--ls-deck-width, 320px), 640px)`. Das
Content-Autoscaling liefert der Query-Container aus T011498. Pointer Events +
`setPointerCapture` sind Spec-Konvention (kein HTML5-DnD).

## Tasks (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Guard liegt im Stage-Commit und ist auf
      diesem Branch rot (4/4 Failures an den Kern-Assertions, Anker halten).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/deck-resize.bats
# expected: FAIL (rot — das Feature ist noch nicht implementiert)
```

- [ ] **T1 — Reine Logik `deck-resize.ts`.** Neu:
      `components/website/src/lib/sdlc/deck-resize.ts` mit
      `export const DECK_WIDTH_MIN = 240`, `DECK_WIDTH_MAX = 640`,
      `DECK_WIDTH_DEFAULT = 320`, `DECK_WIDTH_STEP = 16`,
      `export const DECK_WIDTH_STORAGE_KEY = 'ls-deck-width'`;
      `export function clampDeckWidth(px: number): number` (NaN/undefined →
      Default, sonst Klemmen auf [MIN, MAX], Runden auf ganze px);
      `export function widthFromPointer(clientX: number, innerWidth: number): number`
      (Breite = innerWidth − clientX, geklemmt).

- [ ] **T2 — Vitest `deck-resize.test.ts`.** Neu, neben der Lib: Fälle für
      Klemmen unten/oben, Default bei NaN, Runden, `widthFromPointer` an beiden
      Rändern. Stil wie bestehende Tests unter `src/lib/**/*.test.ts`.

- [ ] **T3 — `cockpit.astro` Grid-Spalte.** In der `.ls-main`-Regel
      (`components/website/src/pages/sdlc/cockpit.astro`)
      `grid-template-columns: 1fr minmax(240px, 320px);` ersetzen durch
      `grid-template-columns: 1fr clamp(240px, var(--ls-deck-width, 320px), 640px);`.
      Mobile-Query (`1fr`) bleibt unverändert.

- [ ] **T4 — Resize-Handle in `DeckLeiste.svelte`.** Am linken Rand der Leiste ein
      Handle-Element (`class="deck-leiste__resize"`, `role="separator"`,
      `aria-orientation="vertical"`, `tabindex="0"`, `aria-valuemin/-valuemax/-valuenow`,
      `aria-label="Deck-Leiste Breite anpassen"`). Verhalten (Logik aus T1
      importieren):
      - `onpointerdown` → `setPointerCapture`, `onpointermove` →
        `widthFromPointer(e.clientX, window.innerWidth)`,
        `document.getElementById('cockpit-root')?.style.setProperty('--ls-deck-width', px + 'px')`;
        `onpointerup`/`onpointercancel` → Capture lösen, Wert in
        `localStorage[DECK_WIDTH_STORAGE_KEY]` schreiben (try/catch).
      - `ondblclick` → Default wiederherstellen, Storage-Eintrag entfernen.
      - `onkeydown` ArrowLeft/ArrowRight → ±`DECK_WIDTH_STEP`, klemmen, anwenden,
        persistieren.
      - `onMount` → gespeicherten Wert lesen (try/catch), `clampDeckWidth` anwenden,
        CSS-Var setzen; `aria-valuenow` als Svelte-State mitführen.
      - Styles: 8 px breite Hitzone, `cursor: col-resize`, dezente Linie mit
        Hover-/Fokus-Akzent (bestehende `--ls-*`-Tokens nutzen); in der
        `@media (max-width: 767px)`-Regel `display: none`.

- [ ] **GREEN-Nachweis.** BATS-Guard grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/deck-resize.bats
```

- [ ] **Visueller Nachweis.** Dev-Stack `/sdlc/cockpit?deck=plattform`: Handle
      greifbar, Drag verbreitert die Leiste, oberhalb ~480 px Container-Breite
      werden die Karten zweispaltig, Reload behält die Breite, Doppelklick
      resettet. (Führt der Orchestrator im Browser aus.)

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
