# admin-token-consolidation — Delta (t002200-admin-design-token, T002200)

## MODIFIED Requirements

### Requirement: Single color-token source in the Tailwind @theme layer

The system SHALL define every admin and factory base color token exclusively in
the Tailwind `@theme` layer of `website/src/styles/global.css`. The file
`website/src/styles/factory-tokens.css` SHALL NOT exist, and no second `:root`
block SHALL redeclare any of the 17 migrated base names (`--brass`, `--brass-2`,
`--brass-d`, `--fg`, `--fg-soft`, `--ink-750`, `--ink-800`, `--ink-850`,
`--ink-900`, `--line`, `--line-2`, `--mono`, `--mute`, `--mute-2`, `--sage`,
`--sans`, `--serif`) with a literal value. Shorthand names remain available only
as thin `var(--color-*)` aliases in `global.css`.

The regression guard for this requirement (`tests/spec/admin-token-consolidation.bats`)
MUST point `ADMIN_LAYOUT` at the real file
(`website/src/layouts/AdminLayout.astro`, not a nonexistent
`website/src/components/admin/AdminLayout.astro`) and MUST use grep invocations
that actually exercise the assertion instead of silently passing regardless of
file content — a wrong path or a broken `grep` pipeline is a false-green test
that hides an incomplete migration.

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

#### Scenario: the regression guard resolves the real AdminLayout file

- **GIVEN** `tests/spec/admin-token-consolidation.bats`
- **WHEN** `ADMIN_LAYOUT` is read
- **THEN** it points at `website/src/layouts/AdminLayout.astro`, the file that
  Astro actually renders, so an import of `factory-tokens.css` there fails the
  test instead of being silently missed

### Requirement: Admin semantic color tokens are thin @theme aliases

The system SHALL declare each of the 16 semantic admin color tokens
(`--admin-bg`, `--admin-sidebar-bg`, `--admin-surface`, `--admin-surface-hover`,
`--admin-border`, `--admin-border-bright`, `--admin-primary`,
`--admin-primary-muted`, `--admin-accent`, `--admin-text`, `--admin-text-mute`,
`--admin-text-disabled`, `--admin-success`, `--admin-danger`, `--admin-info`,
`--admin-warning`) exactly once, in `global.css`, with a value that is a single
`var(--color-*)` reference into the `@theme` layer. The tokens SHALL NOT be
duplicated in `admin-foundation.css`, and MUST NOT remain declared in
`factory-tokens.css`.

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
