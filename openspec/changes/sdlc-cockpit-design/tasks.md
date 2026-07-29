# Tasks: SDLC Cockpit — K1 Lavish Design-Kit & Panel-Kontrakt

**Ticket:** T002460  
**Epic:** T002458  
**Branch:** `feature/sdlc-cockpit-design-T002460`  
**Spec:** `openspec/changes/sdlc-cockpit-design/design.md`

## Partial Manifest

| Partial | Name | Files | Role |
|---------|------|-------|------|
| p1 | foundation | `.lavish/kit/tokens.css`, `.lavish/kit/document.css` | implementation |
| p2 | panel-css | `.lavish/kit/panel.css` | implementation |
| p3 | panel-runtime | `.lavish/kit/panel.js`, `.lavish/kit/adapter.js` | implementation |
| p4 | proofs-tests | `.lavish/reference-board.html`, `.lavish/cockpit-shell.html`, `tests/spec/sdlc-cockpit/*.bats`, `tests/unit/cockpit-panel.test.ts` | tests |

**Disjunktheit:** Keine Datei kommt in mehr als einem Partial vor (D1).

**Pipeline:** Partials werden in Reihenfolge p1→p2→p3→p4 gestaged und enqueued. p4 (Tests-Rolle) ist das letzte Partial.

## Partial Plans

- [p1] `tasks.d/p1-foundation.md` — Design Tokens & Dokument-Bausteine (Schicht 1+2)
- [p2] `tasks.d/p2-panel-css.md` — Panel-Rahmen CSS (Schicht 3)
- [p3] `tasks.d/p3-panel-runtime.md` — Panel-Laufzeit & Adapter (panel.js + adapter.js)
- [p4] `tasks.d/p4-proofs-tests.md` — Belegartefakte & Tests (Referenz-Board, Cockpit-Hülle, BATS, Vitest)

## Quality Gates

- `bash scripts/plan-lint.sh openspec/changes/sdlc-cockpit-design/tasks.md`
- `bash scripts/openspec.sh validate`
- Alle BATS-Tests: Positiv-Anker bei Negativtests (T002356-M1)
- Kein Panel ruft `fetch` direkt — nur `adapter.js`-Methoden (E1)

## Blockiert

K2 (T002461), K3 (T002462), K4 (T002463), K5 (T002464), K6 (T002465), K7 (T002466), K8 (T002467), K9 (T002468)
