# admin-ui-modal-drawer

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu admin-ui-modal-drawer ergänzen._

## Requirements

### Requirement: Native dialog-based AdminModal primitive

The system SHALL provide a reusable `components/admin/ui/AdminModal.svelte` primitive built on the
native `<dialog>` element so that focus trapping, the `::backdrop`, `inert` background, and Escape
handling are delivered by the browser platform rather than by bespoke JavaScript.

#### Scenario: Modal renders as an accessible dialog

- **GIVEN** a page mounts `AdminModal` with a `title` prop and a `body` snippet
- **WHEN** the component renders
- **THEN** the root element is a `<dialog>` carrying a stable `data-testid`
- **AND** the `<dialog>` has an `aria-labelledby` attribute referencing the `id` of an `<h2>` that
  contains the `title` text

#### Scenario: Binding open drives showModal/close

- **GIVEN** an `AdminModal` whose `open` prop is bound via `$bindable(false)`
- **WHEN** the bound `open` transitions from `false` to `true`
- **THEN** the component calls `dialogEl.showModal()` on the dialog
- **AND** when `open` transitions back to `false` the component calls `dialogEl.close()`

#### Scenario: Escape and backdrop close propagate outward

- **GIVEN** an open `AdminModal`
- **WHEN** the user presses Escape or clicks the backdrop and the dialog closes natively
- **THEN** the component fires its `onclose` callback so the parent can reset its bound `open` state to `false`

### Requirement: Snippet-based modal content API

The system SHALL expose modal content through Svelte 5 snippets: a required `body` snippet and an
optional `footer` snippet, establishing `AdminModal` as the reference example for the snippet pattern
in the admin surface.

#### Scenario: Body is mandatory, footer is optional

- **GIVEN** a caller passes only a `body` snippet
- **WHEN** the modal renders
- **THEN** the body content appears inside the dialog and no footer region is rendered

- **GIVEN** a caller passes both `body` and `footer` snippets
- **WHEN** the modal renders
- **THEN** the footer content appears in a dedicated footer region below the body

### Requirement: Side-anchored AdminDrawer variant

The system SHALL provide `components/admin/ui/AdminDrawer.svelte` as a thin variant of the same
native-`<dialog>` pattern, anchored to the side of the viewport instead of centered, sharing the
identical accessibility base (focus trap, Escape, `onclose` propagation, stable `data-testid`).

#### Scenario: Drawer shares the dialog accessibility base

- **GIVEN** a page mounts `AdminDrawer` with a `title` and body content
- **WHEN** the component renders
- **THEN** the root element is a `<dialog>` with `aria-labelledby` referencing its heading
- **AND** binding `open` to `true` opens it via `showModal()` and Escape closes it, firing `onclose`

### Requirement: Migrated dialogs preserve stable test selectors

The system SHALL migrate the admin modals and drawers onto `AdminModal` / `AdminDrawer` while
preserving the automation selectors that existing end-to-end and component tests depend on, so the
DOM-structure change from ad-hoc overlays to `<dialog>` does not silently break admin E2E specs. Of
the 8 modals and 4 drawers originally scoped, 7 modals and 3 drawers were migrated; `TicketCreateModal`
and `framework/VersionDrawer` were intentionally left on their pre-existing implementations (see the
two scenarios below for why), tracked as follow-up candidates rather than blocking this change.

#### Scenario: TicketCreateModal keeps its create-modal selector by staying unmigrated

- **GIVEN** `AdminModal`'s `<dialog>` is always mounted (visibility toggled via `showModal()`/`close()`,
  not conditional rendering) — established by `AdminModal.test.ts`, which renders with `open: false`
  and still expects the dialog element to resolve
- **AND** `TicketCreateModal.test.ts` asserts `queryByTestId('create-modal')` is `null` when `open` is
  `false`, a contract that requires the element to not exist in the DOM while closed
- **WHEN** these two contracts are compared
- **THEN** they are incompatible without editing `TicketCreateModal.test.ts`, which this change does
  not do
- **AND** `TicketCreateModal` therefore remains on its original `{#if open}`-based implementation,
  keeping `data-testid="create-modal"` and the `tests/e2e/fa-29-cockpit.spec.ts` flow working exactly
  as before

#### Scenario: Every migrated dialog carries a stable data-testid

- **GIVEN** a modal or drawer previously located via an overlay-specific selector
- **WHEN** it is migrated onto the native `<dialog>` primitive
- **THEN** the `<dialog>` exposes a stable `data-testid` recorded in the migration notes
  (`openspec/changes/admin-ui-modal-drawer/notes.md`)

#### Scenario: Non-overlay components are not forced onto the dialog primitive

- **GIVEN** `framework/VersionDrawer.svelte` renders inline in `SectionFrame.svelte` behind a toggle
  button, with no backdrop, no `role="dialog"`, and no Escape/close handling of its own
- **WHEN** deciding whether to migrate it onto `AdminDrawer`
- **THEN** it is left unmigrated, because forcing an inline expand-in-place panel onto a fixed
  right-edge overlay primitive would be a UX regression, not an accessibility improvement

<!-- merged from change delta admin-ui-modal-drawer.md (b3647ca33b7a) -->