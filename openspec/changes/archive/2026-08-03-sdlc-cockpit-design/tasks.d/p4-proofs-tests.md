# Partial p4 — Belegartefakte & Tests
**Role:** tests | **Ticket:** T002460 | **Depends:** p1, p2, p3

## Goal: Proof artifacts + test suite proving the panel contract

Files: `.lavish/reference-board.html`, `.lavish/cockpit-shell.html`, `tests/spec/sdlc-cockpit/*.bats` (6 files), `tests/unit/cockpit-panel.test.ts`

## Proof Artifact 1: Reference Board

Rebuild `admin-foundation-brainstorm.html` using ONLY kit CSS. Links `tokens.css` + `document.css`, zero inline styles, preserves structure, adds `data-lavish-question` markers. Standalone HTML, `file://` openable. Proves layers 1+2 can style any board with one `<link>`.

## Proof Artifact 2: Cockpit Shell

Standalone HTML with all 4 panel types × 3 sizes, populated from adapter fixtures. Left: focus column (4 rail panels). Right: workspace (2 card panels + 1 fullscreen Canvas + Strom stream + Terminal placeholder). Mobile: stacked fullscreen with bottom-sheet rail.

## BATS Tests (tests/spec/sdlc-cockpit/)

6 files, one per concern (T002416):
1. `panel-type-declaration.bats` — every `.panel` has valid `data-panel-type` (D2)
2. `rail-representation.bats` — every type has `.panel--rail` variant (D3)
3. `no-direct-fetch.bats` — NEGATIVTEST + POSITIV-ANKER: first grep `data.tickets` in adapter.js (anchor), then grep `fetch(` in panel.js must fail (T002356-M1)
4. `document-tokens-only.bats` — NEGATIVTEST + POSITIV-ANKER: first grep `--color-bg-base` in tokens.css, then no hardcoded colors in document.css (E11)
5. `kit-artifacts-exist.bats` — all 5 kit files + 2 proof artifacts exist
6. `kit-binding.bats` — cockpit shell and reference board both load kit via `<link>`/`<script>`

## Vitest (tests/unit/cockpit-panel.test.ts)

jsdom environment. Tests Panel.create() for all 4 types: correct methods (refresh/append/save/connect), error behaviors, invalid type throws. Uses adapter fixtures for data.

## Acceptance
- Reference board: kit-only, no inline styles, content preserved
- Cockpit shell: 4 types × 3 sizes, mobile responsive, fixtures
- 6 BATS pass, both Negativtests have Positiv-Anker
- Vitest passes
- No test modifies production code
