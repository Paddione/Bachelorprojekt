# admin-token-consolidation

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu admin-token-consolidation ergänzen._

## Requirements

### Requirement: Single color-token source in the Tailwind @theme layer

The system SHALL define every admin and factory base color token exclusively in
the Tailwind `@theme` layer of `website/src/styles/global.css`. The file
`website/src/styles/factory-tokens.css` SHALL NOT exist, and no second `:root`
block SHALL redeclare any of the 17 migrated base names (`--brass`, `--brass-2`,
`--brass-d`, `--fg`, `--fg-soft`, `--ink-750`, `--ink-800`, `--ink-850`,
`--ink-900`, `--line`, `--line-2`, `--mono`, `--mute`, `--mute-2`, `--sage`,
`--sans`, `--serif`) with a literal value. Shorthand names remain available only
as thin `var(--color-*)` aliases in `global.css`.

#### Scenario: factory-tokens.css is dissolved

- **GIVEN** the admin stylesheet chain loaded by `AdminLayout.astro`
- **WHEN** the guard test resolves the styles directory
- **THEN** `factory-tokens.css` is absent and every base color name resolves
  through a `@theme --color-*` token declared once in `global.css`

#### Scenario: no import references a deleted sheet

- **GIVEN** `global.css` and `AdminLayout.astro`
- **WHEN** their import statements are inspected
- **THEN** neither `@import "./factory-tokens.css"` nor
  `import '../styles/factory-tokens.css'` remains

### Requirement: Admin semantic color tokens are thin @theme aliases

The system SHALL declare each of the 16 semantic admin color tokens
(`--admin-bg`, `--admin-sidebar-bg`, `--admin-surface`, `--admin-surface-hover`,
`--admin-border`, `--admin-border-bright`, `--admin-primary`,
`--admin-primary-muted`, `--admin-accent`, `--admin-text`, `--admin-text-mute`,
`--admin-text-disabled`, `--admin-success`, `--admin-danger`, `--admin-info`,
`--admin-warning`) exactly once, in `global.css`, with a value that is a single
`var(--color-*)` reference into the `@theme` layer. The tokens SHALL NOT be
duplicated in `admin-foundation.css`.

#### Scenario: each admin token aliases a @theme color

- **GIVEN** the 16 semantic admin color tokens
- **WHEN** the guard test reads each declaration in `global.css`
- **THEN** the value matches `var(--color-<name>)` and resolves to an existing
  `@theme --color-*` token (`--color-danger` is added for `--admin-danger`)

#### Scenario: existing consumers keep working without edits

- **GIVEN** the ~36 components and pages that reference `--admin-*` color tokens
- **WHEN** the admin surfaces render after the migration
- **THEN** every referenced `--admin-*` token resolves and the computed color is
  unchanged from before the migration

### Requirement: Single owner for sidebar width tokens

The system SHALL define `--sidebar-width` and `--sidebar-collapsed-width` exactly
once, owned by `website/src/styles/admin-premium.css` as the owner of the sidebar
optics. These tokens SHALL NOT be declared in `admin-foundation.css`.

#### Scenario: sidebar tokens declared once

- **GIVEN** the admin stylesheets
- **WHEN** the definitions of `--sidebar-width` and `--sidebar-collapsed-width`
  are enumerated
- **THEN** each is declared exactly once, in `admin-premium.css`, and the derived
  `--admin-sidebar-w` / `--admin-sidebar-h` continue to resolve

### Requirement: Deliberate visual-regression baseline for the token migration

The system SHALL treat the token migration as the highest snapshot-risk step of
the admin-foundation epic and SHALL run the `visual-sweep` end-to-end pass
against the deployed brand as a deliberate regression review before the change is
considered done.

#### Scenario: admin surfaces render without regression

- **GIVEN** the deployed website after the token migration
- **WHEN** `tests/e2e/specs/visual-sweep.spec.ts` runs across the admin routes
- **THEN** no route errors (HTTP >= 400 or thrown navigation) occur and the
  generated gallery shows admin colors unchanged; any committed Playwright
  screenshot baseline is intentionally regenerated and reviewed

<!-- merged from change delta admin-token-consolidation.md (f82bfa9388d1) -->