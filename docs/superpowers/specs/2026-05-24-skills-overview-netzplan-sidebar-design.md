# Skills Overview — Collapsible Netzplan Sidebar

**Date:** 2026-05-24
**File:** `docs/skills-overview.html`

## Goal

Add a collapsible left sidebar to `docs/skills-overview.html` that renders an SVG Netzplan (directed workflow graph) showing all skills as nodes with directed edges representing their invocation sequence, plus category filter chips. The existing legend strip and card grid are retained unchanged.

## Layout

```
┌──────────────────────────────────────────────────────┐
│  header (full width)                                 │
├────────┬─────────────────────────────────────────────┤
│Sidebar │ main content (scrollable)                   │
│220px   │                                             │
│ ◈ Net- │  [legend row — unchanged]                   │
│  zplan │                                             │
│ [chips]│  § Dev-Flow                                 │
│        │    [cards…]                                 │
│ [SVG]  │                                             │
│        │  § Infra                                    │
│ ──────  │    [cards…]                                │
│ [list] │  …                                         │
└────────┴─────────────────────────────────────────────┤
│  footer (full width)                                 │
└──────────────────────────────────────────────────────┘
```

## Sidebar Expanded (220px)

1. **Header row** — `◈ Netzplan` label left, `‹` collapse button right
2. **Filter chips** — `Alle | Dev | Infra | DB | Sec | Ops | Support` — clicking a chip dims nodes + cards outside that category
3. **SVG Netzplan** — fills remaining sidebar height; nodes are `<rect>` with category stroke colour, edges are `<line>` + arrowhead markers; matches the colour system already in `skills/style.css`
4. **Mini list** — 90px scrollable area at the bottom listing every skill name with its category dot

## Sidebar Collapsed (36px strip)

- `›` expand button at top
- `◈` icon below
- Six stacked category-colour dots (Dev=blue, Infra=green, DB=purple, Sec=amber, Ops=gray, Support=red)
- CSS `width` transition: `220px → 36px`, duration 250ms ease

## SVG Graph Node Layout

Column layout (top-to-bottom within each category, left-to-right across columns):

| Column 1 (x≈30) | Column 2 (x≈100) | Column 3 (x≈168) |
|---|---|---|
| dev-flow-plan | git-worktrees (dashed) | hetzner-node |
| dev-flow-execute | arena-brett-deploy (dashed) | new-environment |
| dev-flow-e2e | coaching-pipeline | deployment-assist |
| db-migration | knowledge-reindex | fleet-ops |
| backup-check | ticket-management | flux-day2-ops |
| secret-rotation | livekit-setup | dev-stack-ops |
| keycloak-realm-sync | incident-response | openclaw-ops |
| | mishap-tracker | update-dependencies |

Directed edges (solid): plan→execute→e2e, new-env→deploy→fleet→flux, migrate→backup, rotate→kc-sync, coaching→reindex, incident→mishap.
Dashed edges (optional/branch): plan⇢worktrees, fleet⇢arena-brett.

## Interactivity (vanilla JS, no libraries)

| Action | Result |
|---|---|
| Click toggle button | sidebar width 220↔36, arrow flips ‹/› |
| Click category chip | nodes outside category → opacity 0.25; cards outside → opacity 0.4 |
| Click SVG node | corresponding skill card scrolls into view + gets `highlighted` border for 2s |
| Click `Alle` chip | reset all opacities |

State preserved in a `sidebarOpen` boolean in a `<script>` block; no localStorage needed.

## Implementation Scope

- **Only file changed:** `docs/skills-overview.html`
- Sidebar CSS added inline in `<style>` block inside `skills-overview.html` (does not touch `skills/style.css`)
- SVG is inline (no external file)
- Zero external JS dependencies

## Out of Scope

- Mobile responsive collapse (sidebar stays fixed on narrow screens — same as current page)
- Persisting sidebar open/closed state across page loads
- Animated node highlighting beyond a CSS class toggle
