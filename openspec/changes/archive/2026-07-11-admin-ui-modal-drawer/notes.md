# Migration Notes - admin-ui-modal-drawer (T001788)

## Old Selector -> New Data TestID Table

| Component | Old Selector | New Data TestID | Status |
|-----------|--------------|-----------------|--------|
| `TicketCreateModal.svelte` | `data-testid="create-modal"` (`<div>`) | `data-testid="create-modal"` (`<div>`, unchanged) | **NOT migrated** — see Deviations |
| `KnowledgeSourceModal.svelte` | `.modal-overlay` (none, no backdrop pre-migration) | `data-testid="admin-modal"` (`<dialog>`) | Migrated |
| `WebCrawlSourceModal.svelte` | none (no backdrop pre-migration) | `data-testid="admin-modal"` (`<dialog>`) | Migrated |
| `AdminBookingModal.svelte` | `.fixed.inset-0` overlay | `data-testid="admin-modal"` (`<dialog>`) | Migrated (also fixed missing import + lost trigger/footer from prior uncommitted WIP) |
| `CreateInvoiceModal.svelte` | `.fixed.inset-0` overlay | `data-testid="admin-modal"` (`<dialog>`) | Migrated |
| `AdminMeetingModal.svelte` | `.fixed.inset-0` overlay, trigger `data-testid="admin-meeting-new"` | `data-testid="admin-modal"` (`<dialog>`); trigger testid preserved | Migrated |
| `RecordPaymentModal.svelte` | `.modal-backdrop` + `role="dialog"` | `data-testid="admin-modal"` (`<dialog>`) | Migrated |
| `platform/AssetModal.svelte` | `.fixed.inset-0` overlay | `data-testid="admin-modal"` (`<dialog>`) | Migrated (converted legacy `export let`/`on:click` syntax to Svelte 5 runes to coexist with `$state`) |
| `KiCoachingDrawer.svelte` | `.scrim` + `.drawer` (`<aside>`) | `data-testid="admin-drawer"` (`<dialog>`) | Migrated |
| `KiProviderDrawer.svelte` | `.scrim` + `.drawer` (`<aside>`) | `data-testid="admin-drawer"` (`<dialog>`) | Migrated |
| `platform/AssetTicketDrawer.svelte` | fixed-inset panel + separate backdrop div | `data-testid="admin-drawer"` (`<dialog>`) | Migrated |
| `framework/VersionDrawer.svelte` | n/a (inline, no overlay) | n/a | **NOT migrated** — see Deviations |

## Dependencies & Risks
- `fa-29-cockpit.spec.ts` relies on `open-create` (trigger) and `create-modal` (dialog) — unaffected, `TicketCreateModal` was not migrated.
- `TicketCreateModal.test.ts` relies on `create-modal`, `create-title`, `create-submit`, `feature-select`, `type-select` — unaffected, component untouched.
- `AdminMeetingModal`'s `admin-meeting-new` trigger testid verified still present after migration (grep confirms no test/E2E references beyond the trigger itself).
- No E2E or component-test selectors found for `AdminBookingModal`, `CreateInvoiceModal`, `RecordPaymentModal`, `platform/AssetModal`, `KiCoachingDrawer`, `KiProviderDrawer`, `platform/AssetTicketDrawer` (grepped `tests/e2e` + `*.test.ts`) — free to restyle their internal DOM.

## Primitive fixes made during migration (not pre-existing, found while integrating)
- `AdminModal`/`AdminDrawer`'s `onclose` prop was destructured but never wired to the native
  `<dialog>` `close` event — Escape and `dialog.close()` (backdrop) never synced the bound `open`
  state back to the parent nor notified the caller. Fixed: `<dialog onclose={handleNativeClose}>`
  where `handleNativeClose` sets `open = false` and invokes the caller's `onclose()`.
- `on:click|self` (Svelte 4 syntax, deprecated under Svelte 5 runes) replaced with `onclick` +
  manual `e.target === dialogEl` check (unchanged semantics).
- `AdminDrawer` had no actual side-anchored styling (task 3's "styled side-anchored" requirement
  was not implemented in the pre-existing WIP) — added `position: fixed; right: 0` drawer CSS +
  `::backdrop`.
- Components that pass a parent-owned callback through the primitive's `onclose` AND also call the
  same close function directly from a header/footer button (e.g. `RecordPaymentModal`,
  `platform/AssetModal`, the two `Ki*Drawer`s, `platform/AssetTicketDrawer`) get double-invoked
  without a guard, because the primitive's native-close path re-enters `onclose` after
  `open`/`dialog.close()` already ran. Fixed with an idempotency guard (`if (!open) return;`) in
  each of those components' close handler.
- jsdom has no native `HTMLDialogElement.showModal()`/`close()` — added a repo-wide polyfill to
  `website/src/lib/__tests__/setup.ts` so any future component test that mounts `AdminModal`/
  `AdminDrawer` doesn't need to redeclare `AdminModal.test.ts`'s local `beforeAll` shim.

## Deviations from the plan (openspec/changes/admin-ui-modal-drawer/tasks.md)

### Task 8 — TicketCreateModal NOT migrated
Confirmed by experiment (migrated it, ran its test, reverted): migrating `TicketCreateModal.svelte`
onto `AdminModal` breaks its existing component test in a way that cannot be fixed without editing
the test file, which the plan explicitly forbids ("must stay green without edits"):

1. `AdminModal`'s `<dialog>` is **always mounted** in the DOM (visibility toggled via
   `showModal()`/`close()`, not `{#if open}`). `TicketCreateModal.test.ts` asserts
   `expect(queryByTestId('create-modal')).toBeNull()` when `open=false` — that assertion is
   fundamentally incompatible with an always-mounted dialog, since the closed `<dialog>` is still
   present in the DOM and still carries the testid.
2. Even setting that aside, jsdom does not implement `HTMLDialogElement.showModal()`/`close()`
   natively — `AdminModal.test.ts` supplies its own polyfill (now hoisted to the shared setup file
   in this PR), but every other assertion in `TicketCreateModal.test.ts` would need that polyfill
   too, which means editing the test.

Both issues trace back to `AdminModal`'s Task-2-established "always mounted, dialog toggles
visibility" contract (itself asserted by `AdminModal.test.ts`, which renders `open: false` and still
expects `getByTestId('admin-modal')` to resolve) — that contract is incompatible with
`TicketCreateModal`'s pre-existing "unmounted when closed" test contract. Resolving this cleanly
would require either editing `TicketCreateModal.test.ts` (forbidden by the plan) or changing
`AdminModal`'s mount semantics (which would break `AdminModal.test.ts`, established in Task 2 and
already relied upon by 10 other migrated consumers). Left `TicketCreateModal.svelte` on its
original bespoke `{#if open}` + native-`role="dialog"` implementation. Ticket follow-up recommended
if this component needs the native-dialog a11y treatment later — likely via a variant of `AdminModal`
that supports `{#if open}`-conditional mounting for callers with this "must not exist when closed"
test contract, added as an explicit new capability rather than retrofitted onto the shared primitive.

### Task 7 — framework/VersionDrawer.svelte NOT migrated
`VersionDrawer.svelte` is not an overlay/dialog at all despite the name — it's rendered inline
in-flow inside `framework/SectionFrame.svelte` (`{#if showVersionDrawer}<VersionDrawer {contentKey} />`),
directly below a toggle button, with no backdrop, no `role="dialog"`, and no close/escape handling.
Migrating it onto `AdminDrawer` would turn an inline expand-in-place history panel into a fixed
right-edge overlay with an `::backdrop` — a UX regression, not an a11y fix, and out of step with the
rest of the migration's intent (native focus-trap for *actual* overlays). Left unmigrated; flagging
that "VersionDrawer" is a misleading name for a non-dialog component if anyone revisits this later.
