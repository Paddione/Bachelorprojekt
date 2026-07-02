## ADDED Requirements

### Requirement: Admin-Design-Token-Basis Brass/Ink

The admin area SHALL use a single design-token base: `factory-tokens.css` (Ink surfaces, Brass
accent, Sage/Danger status colors, Newsreader/Geist/Geist-Mono type ramp). `admin-foundation.css`
SHALL define every `--admin-*` custom property as an alias of a `factory-tokens.css` value (e.g.
`--admin-primary: var(--brass)`); no `--admin-*` property SHALL carry a raw color literal that
diverges from the token base. `AdminLayout.astro` SHALL load `factory-tokens.css` before
`admin-foundation.css`. The global `.admin-card` class (admin-premium.css) and the
`AdminCard.svelte` component SHALL consume the same `--admin-card-radius` / `--admin-card-padding`
tokens. For the korczewski brand, `kore-app.css` SHALL override the alias layer with the Kore
copper palette so `admin/ui/*` components follow the brand.

#### Scenario: admin-foundation defines only aliases

- **WHEN** `website/src/styles/admin-foundation.css` is inspected
- **THEN** every color-bearing `--admin-*` declaration references a `var(--…)` from factory-tokens (no independent hex/oklch literals for primary/bg/surface/status colors)

#### Scenario: Kore brand recolors admin/ui components

- **GIVEN** an admin page on the korczewski brand (`body.kore`)
- **WHEN** an `AdminStatCard` is rendered
- **THEN** its accent color resolves to the Kore copper palette, not the mentolder Brass value

#### Scenario: Card class and component share one radius source

- **WHEN** the computed border-radius of a `.admin-card` element and an `AdminCard.svelte` instance are compared
- **THEN** both resolve to the same token value

### Requirement: Admin-Sidebar Kompaktheit und Front-Page-Sprache

The admin sidebar SHALL render section labels as mono-spaced uppercase kickers with a hairline
rule (front-page kicker pattern), SHALL mark the active item with a Brass edge marker and Brass
text (no indigo fill), and SHALL fit all sections including the fully expanded Werkstatt
accordion into a 900px-tall viewport without sidebar scrolling. The sidebar SHALL contain a
"Pipeline" item linking to `/admin/pipeline` in the Infrastruktur section.

#### Scenario: No sidebar scroll with open accordion

- **GIVEN** a desktop viewport of 1440×900 and the Werkstatt accordion expanded
- **WHEN** the sidebar is rendered
- **THEN** the sidebar content height does not exceed the viewport (no vertical scrollbar on `#admin-sidebar`)

#### Scenario: Active item uses Brass marker

- **GIVEN** the admin is on `/admin/cockpit`
- **WHEN** the sidebar renders
- **THEN** the Cockpit item shows a Brass edge marker and Brass-colored label instead of an indigo background fill

#### Scenario: Pipeline link in sidebar

- **WHEN** the admin views the sidebar
- **THEN** the Infrastruktur section contains a link with `href="/admin/pipeline"` labelled "Pipeline"

### Requirement: Dashboard Pipeline-Widget und Postfach-Vorschau

The admin dashboard (`/admin`) SHALL embed the compact pipeline widget
(`PipelineSidekickView.svelte`) showing the live lane distribution of the factory pipeline with a
link to `/admin/pipeline`, and SHALL render an inbox preview listing the newest open inbox items
(title, age, direct link to `/admin/inbox`). The KPI row SHALL render as a compact mono-digit
strip with hairline separators; service tiles SHALL use monochrome Brass icons.

#### Scenario: Pipeline widget on dashboard

- **GIVEN** an authenticated admin on `/admin`
- **WHEN** the dashboard renders
- **THEN** the pipeline lane widget is visible and links to `/admin/pipeline`

#### Scenario: Inbox preview lists open items

- **GIVEN** at least one open inbox item exists
- **WHEN** the dashboard renders
- **THEN** the inbox preview shows the newest open items with a direct link to `/admin/inbox`

#### Scenario: Empty inbox preview degrades gracefully

- **GIVEN** no open inbox items exist
- **WHEN** the dashboard renders
- **THEN** the inbox preview shows an empty state (no error, no crash)
