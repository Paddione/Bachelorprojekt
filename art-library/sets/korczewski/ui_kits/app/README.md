# Kore — App UI kit

The Kore operator console — the in-product surface ops engineers see. Recreates the app shell, clusters list, run detail, and a paper invoice document.

## Components (`AppShell.jsx`)
- `ShellNav` — sticky brand · tabs · user/region badge. Backdrop blur, hairline border.
- `HomeView` — today's headline + one cluster card + last-24h pager card.
- `ClustersView` — table of all clusters. Click a row to open its run.
- `RunsView` — runs list (left) + active run detail (right) with terminal-style log.
- `BillingView` — paper invoice on bone-paper substrate; `paper-doc` system from `app.css`.

## Notes
- Tab navigation is real; clicking tabs switches views.
- The invoice uses `--paper`, `--copper-print` (paper-safe lime), and `--ink-text` — the print-document colorway.
- Stat cards use the inset-lime top edge (`box-shadow: inset 0 1px 0 var(--copper)`).
