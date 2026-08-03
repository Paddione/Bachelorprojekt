# Partial p3 — Panel Runtime & Adapter (panel.js + adapter.js)
**Role:** implementation | **Ticket:** T002460 | **Depends:** p1, p2

## Goal: JavaScript runtime for 4 panel types + data adapter with fixtures

Files: `.lavish/kit/panel.js`, `.lavish/kit/adapter.js`

## panel.js

### Panel base class
Reads `data-panel-type` (D2), `data-refresh-interval`. Lifecycle: init → mount → refresh loop → destroy. Type from `data-panel-type` attribute determines all behavior.

### Four types
- **Status:** idempotent refresh (replace display), on error keep last value + "veraltet seit" (D12), stop polling when hidden (D11), >2× interval = stale badge
- **Strom:** append-only with cursor, on error insert gap marker "Verbindung unterbrochen HH:MM–HH:MM", auto-scroll to bottom (unless user scrolled up)
- **Canvas:** localStorage persistence, never discards input (E10), save with retry, "nicht gespeichert" indicator
- **Terminal:** placeholder — "Terminal verbindet sich mit Daemon (K2)", shows tmux lifecycle note. Actual xterm.js in K2 (D1 build boundary)

### Slots
- Action state machine: available → locked(no token) → confirming → running. Locked is visible not hidden (D4)
- `confirmAction(label, target, cb)`: shows inline dialog with target name (D5)
- Context slot: `setContext(links[])`

### Size: `resize('rail'|'card'|'fullscreen')`. Mobile <768px → fullscreen, non-reversible locked (D6)
### D13: never render null/0/dash as measurement. Error: icon+message, not empty.

## adapter.js
Contract methods (brand='mentolder' param per E16): `tickets()`, `agents()`, `ci()`, `cluster()`, `factory()`, `models()`, plus write stubs `ticketAction()`, `agentAction()`. K1 returns rich fixtures: 5 tickets, 3 agents, 2 CI runs, cluster pods, factory queue, 2 model servers. Matches `/api/admin/*` shape. NO `fetch()` in panel.js — only calls `data.*`.

## Acceptance
- 4 types with distinct behavior, type from `data-panel-type` attribute
- Status staleness (D12), Strom gap markers, Canvas localStorage, Terminal placeholder
- Action slot 4 states, locked visible (D4), confirmation names target (D5)
- D13 compliance, no direct fetch(), no build step
- Files in `.lavish/kit/`
