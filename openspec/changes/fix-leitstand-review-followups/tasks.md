---
slug: fix-leitstand-review-followups
ticket: T007968
status: active
---

# Fix: Review-Follow-ups Leitstand

## Problem

Code-Review-Follow-ups aus PR #4663 (T007559, SDLC-Leitstand E1+E2):

1. `design/leitstand-ds/_tokens.css` hat keinen Staleness-Guard
2. `tests/spec/sdlc-cockpit/api-inventory-drift.bats` T2 hartcodiert "7 factory tools"

## Tasks

### Task 1: _tokens.css Staleness Guard

Kleinen Guard erstellen:
- Vergleich `_tokens.css` gegen Quell-CSS (`sdlc-leitstand.css`)
- ODER `task design:leitstand-ds-Wiring` in die bestehende Inventory-/Freshness-Familie einbinden

### Task 2: Dynamische Tool-Zählung

`tests/spec/sdlc-cockpit/api-inventory-drift.bats` T2:
- Statt hartcodierter "7 factory tools": Count gegen dieselbe Regex-Quelle
- Robuster beim nächsten legitimen Tool-Zuwachs

## Acceptance Criteria

- [ ] Staleness Guard für _tokens.css implementiert
- [ ] api-inventory-drift.bats zählt dynamisch
- [ ] Kein harter Count mehr in T2
