---
title: "admin-ui-modal-drawer — Implementation Plan"
ticket_id: T001788
domains: [website, admin, a11y]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# admin-ui-modal-drawer — Implementation Plan

_Ticket: T001788 · Epic: T001786 · Design-Spec: docs/superpowers/specs/2026-07-10-admin-foundation-design.md §T3_

Two new `components/admin/ui/` primitives — `AdminModal` and `AdminDrawer` — built on the native
`<dialog>` element plus Svelte 5 snippets, then migration of the 8 existing modals and 4 drawers onto
them. The browser platform supplies focus-trap, `::backdrop`, `inert` and Escape; we delete the ad-hoc
overlay markup that today leaves 7 of 8 modals without a focus trap (and two without any backdrop).

## File Structure

### New files

- `website/src/components/admin/ui/AdminModal.svelte` — new primitive, target ~120 LOC, comfortably
  under the 500-line `.svelte` static limit (unbaselined ⇒ static limit applies). Style reference:
  `AdminCard.svelte` (76 LOC).
- `website/src/components/admin/ui/AdminDrawer.svelte` — new primitive, target ~110 LOC, same limit.
- `website/src/components/admin/ui/AdminModal.test.ts` — new Vitest DOM test (jsdom + `@testing-library/svelte`,
  both already in `website/package.json`); auto-collected by the `components` project glob
  `src/components/**/*.{test,spec}.ts` in `website/vitest.config.ts`.

### Changed files (migrated) — S1 budget = 500 − current LOC (none baselined ⇒ static `.svelte` limit)

Migration removes per-file overlay boilerplate, so each file is expected to **shrink**, not grow; the
budgets below are the pre-migration headroom.

| File | LOC (ist) | S1-Budget |
|------|-----------|-----------|
| `website/src/components/admin/KnowledgeSourceModal.svelte` | 158 | 342 |
| `website/src/components/admin/WebCrawlSourceModal.svelte` | 166 | 334 |
| `website/src/components/admin/AdminBookingModal.svelte` | 411 | 89 |
| `website/src/components/admin/CreateInvoiceModal.svelte` | 411 | 89 |
| `website/src/components/admin/AdminMeetingModal.svelte` | 276 | 224 |
| `website/src/components/admin/RecordPaymentModal.svelte` | 76 | 424 |
| `website/src/components/admin/platform/AssetModal.svelte` | 153 | 347 |
| `website/src/components/admin/TicketCreateModal.svelte` | 138 | 362 |
| `website/src/components/admin/KiCoachingDrawer.svelte` | 122 | 378 |
| `website/src/components/admin/KiProviderDrawer.svelte` | 120 | 380 |
| `website/src/components/admin/platform/AssetTicketDrawer.svelte` | 90 | 410 |
| `website/src/components/admin/framework/VersionDrawer.svelte` | 79 | 421 |

### Regenerated artifacts

- `website/src/data/test-inventory.json` — regenerated via `task test:inventory` after the new test is added.

### Guardrails

- **S1:** every file above stays far below its budget; the two 411-line files (`AdminBookingModal`,
  `CreateInvoiceModal`) are watched but shrink through the migration — no split needed.
- **S2/S3/S4:** no new import cycles; no hardcoded brand hostnames introduced; new `.svelte` files live
  under an existing component dir (no orphan-manifest concern).
- **CQ02:** no new `any` types — the primitives use typed `Props` interfaces (see `AdminCard.svelte`).

## Task 1: Pre-flight — inventory the old overlay selectors (de-risk selector break)

The migration replaces ad-hoc overlays (`<div class="modal-overlay">`, `<div class="modal-backdrop">`,
`<div class="fixed inset-0 …">`, `<aside class="drawer">`) with `<dialog>`. Before touching markup,
inventory which admin E2E and component specs target the affected DOM so each migrated `<dialog>` can
carry a matching stable `data-testid`.

- [x] Grep the E2E specs and admin component tests for the affected selectors and record an
      old-selector → new-`data-testid` table in the change folder notes:

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/admin-foundation
grep -rnE 'create-modal|modal-overlay|modal-backdrop|admin-meeting-new|getByRole..dialog|\.drawer' \
  tests/e2e website/src/components/admin | sort
```

- [x] Confirmed hard dependency to preserve: `tests/e2e/fa-29-cockpit.spec.ts` relies on
      `data-testid="open-create"` (trigger) and `data-testid="create-modal"` (the dialog). The
      `TicketCreateModal.test.ts` component test relies on `create-modal`, `create-title`,
      `create-submit`, `feature-select`, `type-select`. These selectors MUST survive the migration.

## Task 2: AdminModal primitive — failing test first (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Add `website/src/components/admin/ui/AdminModal.test.ts` asserting
      that `AdminModal` renders a `<dialog>` with `aria-labelledby` wired to its `<h2>` title, and that
      binding `open` to `true` invokes `showModal()`. It fails now because `AdminModal.svelte` does not
      yet exist (the `import` cannot resolve).

```ts
// website/src/components/admin/ui/AdminModal.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import AdminModal from './AdminModal.svelte';

const body = createRawSnippet(() => ({
  render: () => `<p data-testid="modal-body">Formularinhalt</p>`,
}));

beforeEach(() => vi.restoreAllMocks());

describe('AdminModal', () => {
  it('renders a <dialog> whose aria-labelledby points at the title <h2>', () => {
    const { getByTestId } = render(AdminModal, { open: false, title: 'Rechnung anlegen', body });
    const dialog = getByTestId('admin-modal');
    expect(dialog.tagName).toBe('DIALOG');
    const labelledby = dialog.getAttribute('aria-labelledby');
    expect(labelledby).toBeTruthy();
    const heading = document.getElementById(labelledby as string);
    expect(heading?.tagName).toBe('H2');
    expect(heading?.textContent).toContain('Rechnung anlegen');
  });

  it('calls showModal() when the bound open prop flips to true', async () => {
    const showModal = vi
      .spyOn(HTMLDialogElement.prototype, 'showModal')
      .mockImplementation(() => {});
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(() => {});
    const { rerender } = render(AdminModal, { open: false, title: 'X', body });
    expect(showModal).not.toHaveBeenCalled();
    await rerender({ open: true, title: 'X', body });
    expect(showModal).toHaveBeenCalled();
  });
});
```

```bash
cd website && npx vitest run src/components/admin/ui/AdminModal.test.ts
# expected: FAIL (red — AdminModal.svelte does not exist yet, import unresolved)
```

- [x] **Fix-Step (GREEN).** Implement `website/src/components/admin/ui/AdminModal.svelte`:
  - Typed `Props` interface with `open = $bindable(false)`, `title: string`, `body: Snippet`,
    `footer?: Snippet`, `onclose?: () => void` (typed — no `any`; mirror `AdminCard.svelte` style).
  - `let dialogEl: HTMLDialogElement | undefined = $state()`; `bind:this={dialogEl}` on the `<dialog>`.
  - `$effect(() => { if (!dialogEl) return; if (open) dialogEl.showModal(); else dialogEl.close(); })`.
  - Derive a stable heading `id` (e.g. `$props.id()` or a module counter); render
    `<h2 {id}>{title}</h2>` and set `aria-labelledby={id}` plus `data-testid="admin-modal"` on the `<dialog>`.
  - Native close wiring: `onclose={() => { open = false; onclose?.(); }}` on the `<dialog>`, and a
    backdrop click handler that calls `dialogEl.close()` when the click target is the dialog itself.
  - Render `{@render body()}`; render the footer region only `{#if footer}{@render footer()}{/if}`.
  - Re-run the runner above; both assertions now pass (GREEN).

```bash
cd website && npx vitest run src/components/admin/ui/AdminModal.test.ts
# GREEN — both cases pass once AdminModal.svelte exists
```

## Task 3: AdminDrawer primitive

- [x] Implement `website/src/components/admin/ui/AdminDrawer.svelte` as a thin variant of `AdminModal`:
      same native-`<dialog>` base and `open`/`title`/`body`/`footer`/`onclose` API, but styled
      side-anchored (right edge, full-height) instead of centered, with `data-testid="admin-drawer"`.
- [x] Extend `AdminModal.test.ts` with one render case importing `AdminDrawer`, asserting its root is a
      `<dialog>` with `aria-labelledby` wired to its heading (reuse the same snippet + spy pattern).

## Task 4: Migrate KnowledgeSourceModal + WebCrawlSourceModal (first — largest a11y gain)

These two have **no backdrop today** and the weakest accessibility, so they lead the migration.

- [x] Replace the hand-rolled container in `KnowledgeSourceModal.svelte` and `WebCrawlSourceModal.svelte`
      with `AdminModal`: move the existing form markup into `{#snippet body()}` and the action buttons
      into `{#snippet footer()}`; bind the existing local `open` state via `bind:open`; route the old
      close paths through `onclose`. Give each dialog a stable `data-testid`.
- [x] Run their targeted tests (component tests if present, otherwise the pre-flight E2E flows) to
      confirm the open/submit/close behavior is unchanged. (No dedicated component test or E2E
      selector exists for either — verified via `grep tests/e2e website/src/components/admin
      -e KnowledgeSourceModal -e WebCrawlSourceModal`; full `vitest run src/components/admin` green.)

## Task 5: Migrate AdminBookingModal + CreateInvoiceModal (largest files)

- [x] Migrate `AdminBookingModal.svelte` (411 → shrinks) and `CreateInvoiceModal.svelte` (411 → shrinks)
      onto `AdminModal`, moving overlay/backdrop markup out and form + actions into `body`/`footer`
      snippets. Preserve each internal `open`-state trigger and any embedded child forms. (Pre-existing
      uncommitted WIP on `AdminBookingModal` was missing the `AdminModal` import, its trigger buttons,
      and its footer actions entirely — restored all three during this pass; see notes.md.)
- [x] Verify LOC after migration is well under budget (`wc -l` both files); confirm no `any` was
      introduced.

## Task 6: Migrate AdminMeetingModal + RecordPaymentModal + platform/AssetModal

- [x] Migrate `AdminMeetingModal.svelte` onto `AdminModal`, preserving its `admin-meeting-new` trigger
      selector.
- [x] Migrate `RecordPaymentModal.svelte` (already has `role="dialog"` + `modal-backdrop`) onto
      `AdminModal`; route its `onClose` prop through the primitive's `onclose` (guarded against
      double-invocation, see notes.md).
- [x] Migrate `platform/AssetModal.svelte` (fixed-inset overlay) onto `AdminModal` (converted from
      legacy Svelte 4 `export let`/`on:click` syntax to Svelte 5 runes, required to coexist with
      `$state`/`$props` in the same component).

## Task 7: Migrate the four drawers onto AdminDrawer

- [x] Migrate `KiCoachingDrawer.svelte`, `KiProviderDrawer.svelte`, `platform/AssetTicketDrawer.svelte`
      onto `AdminDrawer`. Preserve each drawer's existing `onclose` / `dispatch('close')` contract; move
      `.scrim` / fixed-inset backdrop markup into the primitive.
      **Deviation:** `framework/VersionDrawer.svelte` was NOT migrated — it is not an overlay/dialog at
      all (renders inline in `framework/SectionFrame.svelte`, no backdrop, no close/escape handling);
      migrating it onto `AdminDrawer` would turn an inline expand-in-place panel into a fixed overlay,
      a UX regression rather than an a11y fix. See notes.md "Deviations" for full reasoning.
- [x] Confirm each migrated drawer still opens, closes on Escape and backdrop, and fires its close
      callback to the parent. (`AdminDrawer`'s `onclose` was not wired to the native `<dialog>` `close`
      event in the pre-existing WIP — Escape/backdrop never synced `open` or notified the caller. Fixed
      in `AdminModal.svelte`/`AdminDrawer.svelte`; see notes.md "Primitive fixes".)

## Task 8: Migrate TicketCreateModal last (regression anchor)

`TicketCreateModal` is already `role="dialog"` + Escape-aware and is guarded by both a component test
and the fa-29 E2E flow, so it migrates last to catch regressions in the primitive.

- [x] **NOT DONE — blocked, deviation from plan.** `TicketCreateModal.svelte` was intentionally left
      on its original `{#if open}` implementation rather than migrated onto `AdminModal`. Confirmed by
      experiment (migrated it, ran the test, reverted): `AdminModal`'s `<dialog>` is always mounted
      (visibility toggled via `showModal()`/`close()`, not conditional rendering), which is
      fundamentally incompatible with `TicketCreateModal.test.ts`'s
      `expect(queryByTestId('create-modal')).toBeNull()` assertion when `open=false` — that dialog
      element is still present (just closed) after migration, so the assertion would fail. jsdom also
      lacks native `showModal()`/`close()`, which would additionally throw in every other test in the
      file. Both issues can only be fixed by editing the test, which the plan explicitly forbids. Full
      reasoning in notes.md "Deviations". `create-modal`/`create-title`/`create-submit`/
      `feature-select`/`type-select`/`open-create` are all unaffected since the component is untouched.
- [ ] ~~Run the existing component test — it must stay green without edits~~ (N/A — component not
      migrated; test suite unmodified and green as-is):

```bash
cd website && npx vitest run src/components/admin/TicketCreateModal.test.ts
# GREEN — the migration must not break the existing create-modal contract
```

## Task 9: Final verification (mandatory CI gates)

- [x] OpenSpec delta validates before commit:

```bash
task test:openspec
```

- [x] Regenerate the test inventory (a new `.test.ts` was added) and commit it alongside the tests:

```bash
task test:inventory   # regenerates website/src/data/test-inventory.json → commit it
```

  (No-op: `test-inventory.json` only indexes BATS/shell tests under `tests/local`/`tests/prod` and
  Playwright specs under `tests/e2e/specs` — Vitest component `.test.ts` files like `AdminModal.test.ts`
  are not part of this inventory. `task test:inventory` produced zero diff.)

- [x] Run the three mandatory gates green (S1–S4 ratchet + freshness):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
