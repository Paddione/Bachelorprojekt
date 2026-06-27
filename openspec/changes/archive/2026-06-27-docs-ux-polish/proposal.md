# Proposal: docs-ux-polish

## Why

Die auto-generierte Docs-Seite (`docs.<domain>`, gebaut von `scripts/build-docs.mjs`
+ `scripts/docs-gen/`) rendert ~93–225 gestylte HTML-Seiten, ist für Menschen aber
schwer benutzbar: Die Suche macht reinen Substring-Match auf Titel/Excerpt (kein
Body, kein Ranking), es gibt **keine Sidebar und kein Prev/Next** (nur Breadcrumbs),
das TOC endet bei **h2**, und dem Dark-Theme fehlen Skip-Link, `:focus-visible`,
Such-ARIA sowie ein WCAG-AA-Kontrast-Pass. Das generierte HTML existiert, ist aber
nicht „humanly consumable".

## What

UX-Politur **innerhalb** der bestehenden `docs-gen`-Pipeline — kein SSG-Rewrite, kein
neuer Content, Serving-Kette (static-web-server-Image, Pocket-ID-OIDC, read-only
rootfs) unangetastet:

- **A. Volltextsuche** via zero-dependency **Bespoke Inverted-Index** (≤ 2 MB),
  ranked, mit `<mark>`-Snippet-Highlight und Sprung zum Heading-Anchor.
- **B. Navigation**: sektion-fokussierte Sidebar + deterministisches Prev/Next +
  **h3-TOC**, über ein neues Modul `scripts/docs-gen/navigation.mjs` (aus
  `templates.mjs` extrahiert, um dessen S1-Budget zu respektieren).
- **C. Lesbarkeit & A11y**: Skip-Link, `:focus-visible`, Such-ARIA, WCAG-AA-Kontrast
  der Dark-Tokens, responsive Sidebar.

**Out of Scope:** Light-Mode/Theme-Toggle, JSON-Dashboards, Freshness-Seam-Kopplung,
Publizieren ausgeschlossener Surfaces (`openspec/specs/`, `agent-guide/maps/`),
inhaltliches De-Stalen (z. B. Keycloak→Pocket-ID in den Texten), i18n/Englisch.

Such-Engine = Bespoke Inverted-Index und Sidebar-Umfang = sektion-fokussiert sind im
Brainstorming (2026-06-27) entschieden. Design-Spec:
`docs/superpowers/specs/2026-06-27-docs-ux-polish-design.md`.

_Ticket: T001233_
