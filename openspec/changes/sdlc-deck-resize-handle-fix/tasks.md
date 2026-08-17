---
title: "sdlc-deck-resize-handle-fix — Implementation Plan"
ticket_id: T011500
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# sdlc-deck-resize-handle-fix — Implementation Plan

_Ticket: T011500_

## File Structure

```
components/website/src/components/leitstand/DeckLeiste.svelte  (geändert: Scroll-Kontext auf __body, Drag gegen Panel-Kante)
components/website/src/lib/sdlc/deck-resize.ts                 (geändert: widthFromPointer(clientX, rightEdge))
components/website/src/lib/sdlc/deck-resize.test.ts            (geändert: Tests auf rightEdge-Semantik)
tests/spec/sdlc-cockpit/deck-resize-handle-fix.bats            (neu: RED-Guard, bereits im Stage-Commit)
```

## Kontext

Drei CONFIRMED-Review-Findings zu PR #4694 (Details in `proposal.md`): Handle
scrollt/clippt, weil `.deck-leiste` der Scroll-Container ist; Kante hängt bei
Seiten-Scrollbar hinter dem Cursor, weil gegen `window.innerWidth` gerechnet wird.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Guard liegt im Stage-Commit und ist rot
      (3/3 Failures an den Kern-Assertions, Positiv-Anker halten).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/deck-resize-handle-fix.bats
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix 1 — Scroll-Kontext.** In `DeckLeiste.svelte`: `overflow-y: auto` aus dem
      `.deck-leiste`-Regelblock entfernen und in den `.deck-leiste__body`-Block
      aufnehmen. Das `position: sticky` der Tabs wird dadurch wirkungslos (Tabs
      stehen jetzt außerhalb des Scroll-Containers fest) — die sticky-Deklaration
      kann entfallen.

- [ ] **Fix 2 — Panel-Geometrie.** `deck-resize.ts`: Signatur auf
      `widthFromPointer(clientX: number, rightEdge: number)` ändern
      (Breite = rightEdge − clientX, geklemmt; Doku-Kommentar anpassen).
      In `DeckLeiste.svelte` den Drag-Pfad auf
      `widthFromPointer(e.clientX, nav.getBoundingClientRect().right)` umstellen
      (`nav` = das `.deck-leiste`-Root-Element, per `bind:this`).

- [ ] **Fix 3 — Vitest nachziehen.** `deck-resize.test.ts`: Fälle auf die
      rightEdge-Semantik umstellen (Kante folgt Cursor exakt, Klemmen an beiden
      Rändern bleibt).

- [ ] **GREEN-Nachweis.** Beide BATS-Guards grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/
```

- [ ] **Visueller Nachweis.** Dev-Stack: Deck scrollen → Handle bleibt sichtbar und
      greifbar; Drag bei sichtbarer Seiten-Scrollbar → Kante folgt dem Cursor exakt.
      (Führt der Orchestrator im Browser aus.)

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
