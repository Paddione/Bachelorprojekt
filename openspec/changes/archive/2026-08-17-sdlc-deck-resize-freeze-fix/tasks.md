---
title: "sdlc-deck-resize-freeze-fix — Implementation Plan"
ticket_id: T011501
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# sdlc-deck-resize-freeze-fix — Implementation Plan

_Ticket: T011501_

## File Structure

```
components/website/src/components/leitstand/DeckLeiste.svelte  (geändert: scrollbar-gutter: stable auf __body)
tests/spec/sdlc-cockpit/deck-resize-freeze-fix.bats            (neu: RED-Guard, bereits im Stage-Commit)
```

## Kontext

Renderer-Freeze beim Deck-Resize, 2× reproduziert. Ursache und Mechanik in
`proposal.md`: Scrollbar↔Container-Query-Rückkopplung auf `.deck-leiste__body`
(zugleich Query- und Scroll-Container). Abhilfe ist die konstante
Gutter-Reservierung.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Der BATS-Guard liegt im Stage-Commit und ist
      rot (Kern-Assertion `scrollbar-gutter: stable` fehlt, Anker halten).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/deck-resize-freeze-fix.bats
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [x] **Fix.** In `components/website/src/components/leitstand/DeckLeiste.svelte`
      im `.deck-leiste__body`-Regelblock `scrollbar-gutter: stable;` ergänzen
      (direkt bei `overflow-y: auto`, mit Begründungskommentar).

- [x] **GREEN-Nachweis.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/deck-resize-freeze-fix.bats
```

- [ ] **Visueller Nachweis.** Dev-Stack: Handle fokussieren, 14× ArrowLeft in
      schneller Folge — kein Renderer-Stall (Screenshot-Aufnahme direkt danach
      gelingt ohne Timeout). (Führt der Orchestrator im Browser aus.)

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
