# Partial p2 — Panel CSS: Schicht 3 Rahmen
**Role:** implementation | **Ticket:** T002460 | **Depends:** p1

## Goal: Create the panel frame CSS — header, slots, sizes, responsiveness

Files: `.lavish/kit/panel.css` (builds on tokens.css, no JS)

## Panel Frame Structure

Each panel has `.panel` wrapper with 3 slots: `.panel__head` (title, type badge, staleness), `.panel__actions` (4 states: available/locked/confirming/running), `.panel__context` (brain links, empty placeholder). CSS-only — no JS behavior here, just visual structure.

## Three Sizes (E4)

- `.panel--rail`: one-line compact for focus column. Hides context slot, minimises actions. `max-height: 2.5rem`, no scroll, no interactive elements except click-to-expand.
- `.panel--card`: default workspace size. Full header + actions + context. Scrollable content area.
- `.panel--fullscreen`: pop-out / mobile mode. Full viewport minus header bar. Larger typography, touch-friendly action targets (min 44px).

## Action Slot — 4 Visual States (D4)

- `.panel__actions--available`: default, active buttons, accent color
- `.panel__actions--locked`: visible but greyed/washed out, lock icon, NOT hidden (D4: user must see that actions exist but are unavailable)
- `.panel__actions--confirming`: confirmation dialog inline, target name displayed (D5)
- `.panel__actions--running`: spinner/animation, buttons disabled

## Type Badge

`.panel__type-badge`: small label showing panel type (Status/Strom/Canvas/Terminal). Uses `--color-status-*` tokens. Created via CSS pseudo-element reading `data-panel-type` attribute.

## Staleness Indicator (D12)

`.panel__staleness`: always visible timestamp "aktualisiert vor X min" → "veraltet seit X min" on error. Positioned in header. Normal: text-secondary, stale (>2x refresh interval): text-warn, disconnected: text-err.

## Responsive Breakpoints (E4 Mobile)

- `@media (max-width: 768px)`: panels stack vertically, `.panel--card` becomes `.panel--fullscreen`
- `@media (min-width: 769px)`: side-by-side layout possible
- Mobile: action targets min 44×44px (touch), non-reversible actions locked by default (D6/D8)

## Visual Design (E20)

Dark surfaces (`--color-bg-elevated`), subtle borders (`--color-border-default`), single accent for interactive elements. Staggered visual depth: base < elevated < overlay. Status colors ONLY for status indicators, never decoration.

## Acceptance

- `.panel` with all three slots (.panel__head, .panel__actions, .panel__context)
- Three size variants: rail, card, fullscreen — responsive
- Action slot: 4 states visually distinct, locked state NOT hidden
- Type badge reads from `data-panel-type` attribute
- Staleness always visible in header (D12)
- Mobile breakpoint at 768px, touch targets ≥44px
- NO hardcoded values — all colors/sizes/spacing via tokens
- File in `.lavish/kit/panel.css`, build-free

## Relevant: D2 D3 D4 D5 D6 D8 D12 E4 E20
