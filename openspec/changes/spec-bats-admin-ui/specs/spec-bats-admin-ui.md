## ADDED Requirements

### Requirement: BATS spec coverage for admin-token-consolidation

The system SHALL have BATS tests in `tests/spec/admin-token-consolidation.bats` that verify:
- `factory-tokens.css` is dissolved (file does not exist)
- No `:root` block redeclares the 17 migrated base color names
- No import statements reference `factory-tokens.css` in `global.css` or `AdminLayout.astro`
- Each of the 16 semantic admin tokens (`--admin-bg` through `--admin-warning`) is declared in `global.css`
- `--color-danger` exists in `@theme` for `--admin-danger`
- Visual-regression baseline is documented (reference: visual-sweep E2E)

#### Scenario: factory-tokens.css is absent

- **GIVEN** a fresh checkout of the project
- **WHEN** `ls website/src/styles/factory-tokens.css` is run
- **THEN** the file SHALL NOT exist (exit status non-zero)

#### Scenario: Each admin token is declared in global.css

- **GIVEN** `website/src/styles/global.css`
- **WHEN** checked for each of the 16 `--admin-*` tokens
- **THEN** each token SHALL be declared with a `var(--color-*)` reference

### Requirement: BATS spec coverage for admin-ui-modal-drawer

The system SHALL have BATS tests in `tests/spec/admin-ui-modal-drawer.bats` that verify:
- `AdminModal.svelte` uses native `<dialog>` with `data-testid` and `aria-labelledby`
- Binding `open` prop drives `showModal()`/`close()`
- Escape/backdrop close fires `onclose` callback
- Body snippet is mandatory, footer is optional
- `AdminDrawer.svelte` shares the same native-`<dialog>` pattern (side-anchored variant)
- Migrated dialogs preserve stable `data-testid` selectors
- Non-overlay components (`TicketCreateModal`, `VersionDrawer`) stay unmigrated

### Requirement: BATS spec coverage for react-login-edit-homepage

The system SHALL have BATS tests in `tests/spec/react-login-edit-homepage.bats` that verify:
- CORS helper `cors.ts` with allowlisted origin, credentials, OPTIONS preflight, fail-closed
- `callback.ts` returnTo-Allowlist accepts absolute React URL
- Block-document API: GET `/api/homepage` (public), POST `/api/admin/homepage/save` (admin, versioned, zod)
- Server-side block schema in `homepage-blocks-schema.ts`
- React-App components: `useAuth`, Navigation (Login/Edit Homepage), Editor Route, BlockRenderer
- Error handling: Auth-Fetch-Failure, 409 Conflict, 422 Invalid
- Environment config: `VITE_WEBSITE_ORIGIN`, `REACT_APP_ORIGIN`

### Requirement: BATS spec coverage for admin-content-db

The system SHALL have BATS tests (in `tests/spec/admin-cockpit.bats`) that verify:
- `ContentDb.svelte` component exists and renders a content database table

#### Scenario: ContentDb component exists

- **GIVEN** the admin component directory
- **WHEN** checking for `ContentDb.svelte`
- **THEN** the file SHALL exist

### Requirement: BATS spec coverage for admin-nav-accordion

The system SHALL have BATS tests (in `tests/spec/admin-cockpit.bats`) that verify:
- `AdminSidebarNav.astro` has accordion toggle (`sidebar-group-btn`, `accordion-arrow`)
- Collapse state toggle logic with `is-collapsed` or `collapsed`
- Click event listener on accordion groups
- Workshop ("Werkstatt") section and infrastructure ("Infrastruktur") section exist

#### Scenario: Sidebar accordion has toggle elements

- **GIVEN** `AdminSidebarNav.astro`
- **WHEN** searching for `sidebar-group-btn`
- **THEN** the file SHALL contain the class
