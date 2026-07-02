---
title: Factory Floor — Provider-Status entfernen & Versand-Ticket-Reveal
ticket_id: none
domains: [website]
status: completed
---

# factory-floor-versand-reveal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the provider-status telemetry widget from the Factory-Floor homepage and turn the Versand ("Shipped") column into a ticket-number-only view whose title reveals on click (independent per-item toggle).

**Architecture:** Presentation-only Svelte 5 change across three components. `ShippedColumn.svelte` gains a local `$state` set of open ticket ids and swaps its ticket-number `<a>` link for a toggle `<button>`; `FactoryFloor.svelte` drops the `ProviderStatus` import/render and the two now-unused props it passed to `ShippedColumn`; `ProviderStatus.svelte` is deleted (no other consumers). The server query `providerHealth` in `factory-floor.ts` and the `ProviderStatus` type in `factory-floor-types.ts` are left untouched (still needed by `AttentionStrip`).

**Tech Stack:** Astro + Svelte 5 (runes: `$props`, `$state`), Vitest + `@testing-library/svelte` (jsdom "components" project), Playwright (E2E `website` project).

## Global Constraints

- Svelte 5 runes only — reactive Set/Map mutation is NOT tracked on a plain `$state(new Set())`; the toggle MUST reassign a fresh `Set` (or the change won't re-render). Copied verbatim from design: "State: lokales `Set<string>` der offenen `extId`s (Svelte 5 `$state`)".
- Do NOT touch `website/src/lib/factory-floor.ts` (server `providerHealth` query stays) or `website/src/lib/factory-floor-types.ts` (`ProviderStatus` type stays — used by `AttentionStrip` cooldown chips).
- Do NOT touch `StagedColumn.svelte` or its `onOpenDetail`/`ticketUrl` wiring — it is independent. In `FactoryFloor.svelte` only the `<ShippedColumn …>` invocation loses `onOpenDetail`/`ticketUrl`; the `import { … ticketUrl … }` on line 28 and the `openDetail` function stay (still used by `StagedColumn` and the workpiece detail panel).
- S3 (hardcoded hostnames): no brand domains introduced — N/A here. CQ02: no new `any` types introduced.

### S1 line-budget pre-flight (wirksame Schwelle = statisches `.svelte`-Limit 500, beide nicht-baselined)

- `website/src/components/FactoryFloor.svelte` — Ist 323, Budget 177 (500 − 323). Change is net-negative (removes lines).
- `website/src/components/factory/ShippedColumn.svelte` — Ist 62, Budget 438 (500 − 62). Change adds ~8 lines of toggle logic, stays far under limit.
- `website/src/components/ProviderStatus.svelte` — deleted, budget n/a.
- `website/src/components/factory/ShippedColumn.test.ts` — new file, ~55 lines, well under the 600 `.ts` limit.

## File Structure

| File | Operation | Responsibility |
|---|---|---|
| `website/src/components/factory/ShippedColumn.svelte` | Modify | Per-item title-toggle state; ticket-number becomes a toggle button; title rendered conditionally; drop `onOpenDetail`/`ticketUrl` props |
| `website/src/components/FactoryFloor.svelte` | Modify | Remove `ProviderStatus` import + render; drop `onOpenDetail`/`ticketUrl` pass-through on the `<ShippedColumn>` invocation only |
| `website/src/components/ProviderStatus.svelte` | Delete | Orphaned after the render is removed (verified no other consumers) |
| `website/src/components/factory/ShippedColumn.test.ts` | Create | Vitest component test for default-hidden title + per-item click toggle |
| `tests/e2e/specs/fa-factory-floor.spec.ts` | Modify | Add E2E assertion that `floor-provider-status` is absent from the DOM |

---

## Task 1: ShippedColumn toggle behaviour (TDD)

Implements delta-spec scenarios "Versand-Zeile zeigt standardmäßig nur die Ticketnummer" and "Klick auf die Ticketnummer togglet nur den Titel dieses Tickets" (Requirement: FA-SF Factory Floor Hallendarstellung).

**Files:**
- Create: `website/src/components/factory/ShippedColumn.test.ts`
- Modify: `website/src/components/factory/ShippedColumn.svelte`

**Interfaces:**
- Consumes: `ShippedColumn` props after this task — `{ shipped: { extId: string; title: string; prNumber?: number | null; doneAt?: string | null }[]; mobileColIndex: number; relTime: (iso: string | null) => string; prUrl: (n: number) => string }`. Props `onOpenDetail` and `ticketUrl` are **removed**.
- Produces: rendered DOM contract for tests and for `FactoryFloor.svelte` — ticket number is a `<button>` (not `<a>`); title element carries `data-testid="floor-shipped-title"` and is present only when toggled open; existing `data-testid` `floor-shipped`, `floor-shipped-item`, `floor-shipped-pr` unchanged.

- [x] **Step 1: Write the failing component test**

Create `website/src/components/factory/ShippedColumn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ShippedColumn from './ShippedColumn.svelte';

const baseProps = {
  shipped: [
    { extId: 'T001001', title: 'Erstes Ticket', prNumber: 42, doneAt: '2026-07-01T10:00:00Z' },
    { extId: 'T001002', title: 'Zweites Ticket', prNumber: null, doneAt: '2026-07-01T09:00:00Z' },
  ],
  mobileColIndex: 0,
  relTime: (_iso: string | null) => 'vor 1h',
  prUrl: (n: number) => `https://example.test/pr/${n}`,
};

describe('ShippedColumn.svelte', () => {
  it('shows ticket number, relTime badge and PR badge but hides the title by default', () => {
    const { getByText, queryByText, getByTestId } = render(ShippedColumn, baseProps);
    expect(getByText('T001001')).toBeTruthy();       // ticket number
    expect(getByText('vor 1h')).toBeTruthy();         // relTime badge unchanged
    expect(getByTestId('floor-shipped-pr')).toBeTruthy(); // PR badge unchanged
    expect(queryByText('Erstes Ticket')).toBeNull();  // title hidden in Ruhezustand
  });

  it('renders the ticket number as a button, with no ticket-overview anchor link', () => {
    const { getByText, container } = render(ShippedColumn, baseProps);
    expect(getByText('T001001').tagName).toBe('BUTTON');
    expect(container.querySelector('a[title*="Ticket-Übersicht"]')).toBeNull();
  });

  it('reveals only the clicked ticket title and toggles it off on a second click', async () => {
    const { getByText, queryByText } = render(ShippedColumn, baseProps);
    await fireEvent.click(getByText('T001001'));
    expect(queryByText('Erstes Ticket')).not.toBeNull();  // this title now visible
    expect(queryByText('Zweites Ticket')).toBeNull();     // other item unaffected (no accordion)
    await fireEvent.click(getByText('T001001'));
    expect(queryByText('Erstes Ticket')).toBeNull();      // toggled back off
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd website && npx vitest run --project components src/components/factory/ShippedColumn.test.ts`
Expected: FAIL — the current component still renders the title unconditionally (via `onOpenDetail`) and the ticket number is an `<a>`, so `queryByText('Erstes Ticket')` is non-null by default and `getByText('T001001').tagName` is `A`.

- [x] **Step 3: Rewrite the ShippedColumn script block**

Replace the `<script lang="ts">` block (lines 1-20) of `website/src/components/factory/ShippedColumn.svelte` with:

```svelte
<script lang="ts">
  import { PIPELINE_LANES } from '../../lib/tickets/pipeline-order';
  const shippedLabel = PIPELINE_LANES.find((l) => l.key === 'shipped')?.label ?? 'Versand';

  let {
    shipped,
    mobileColIndex,
    relTime,
    prUrl,
  }: {
    shipped: { extId: string; title: string; prNumber?: number | null; doneAt?: string | null }[];
    mobileColIndex: number;
    relTime: (iso: string | null) => string;
    prUrl: (n: number) => string;
  } = $props();

  // Independent per-item reveal state (no accordion). A plain $state(Set) is NOT
  // reactive on mutation in Svelte 5 — reassign a fresh Set so the toggle re-renders.
  let openTitles = $state(new Set<string>());
  function toggleTitle(extId: string) {
    const next = new Set(openTitles);
    if (next.has(extId)) next.delete(extId);
    else next.add(extId);
    openTitles = next;
  }
</script>
```

- [x] **Step 4: Rewrite the ticket-number link and title markup**

In the same file, replace the ticket-number `<a>` (current lines 33-34) and the title `<button>` (current lines 40-42) with:

```svelte
            <button type="button" onclick={() => toggleTitle(s.extId)}
                    class="font-mono text-xs text-gold hover:underline"
                    aria-expanded={openTitles.has(s.extId)}
                    title="Titel ein-/ausblenden">{s.extId}</button>
```

and, for the title (replacing the old `<button … onclick={() => onOpenDetail(...)}>`):

```svelte
          {#if openTitles.has(s.extId)}
            <p class="mt-0.5 block leading-snug" data-testid="floor-shipped-title">{s.title}</p>
          {/if}
```

Leave the `relTime` badge (`{#if s.doneAt}…`) and the PR badge (`{#if s.prNumber}…`, `data-testid="floor-shipped-pr"`) exactly as they are.

- [x] **Step 5: Run the test to verify it passes**

Run: `cd website && npx vitest run --project components src/components/factory/ShippedColumn.test.ts`
Expected: PASS (all three cases green).

- [ ] **Step 6: Commit**

```bash
git add website/src/components/factory/ShippedColumn.svelte website/src/components/factory/ShippedColumn.test.ts
git commit -m "feat(website): ShippedColumn title reveal toggle, drop onOpenDetail/ticketUrl props"
```

---

## Task 2: Remove ProviderStatus from FactoryFloor and delete the component

Implements delta-spec scenario "Provider-Status-Widget ist entfernt" and the props-cleanup for the Versand column (Requirement: FA-SF Factory Floor Hallendarstellung).

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte`
- Delete: `website/src/components/ProviderStatus.svelte`

**Interfaces:**
- Consumes: the updated `ShippedColumn` prop shape from Task 1 (no `onOpenDetail`, no `ticketUrl`).
- Produces: a `FactoryFloor` render tree with no `floor-provider-status` element and a `<ShippedColumn>` invocation passing only `shipped`, `mobileColIndex`, `relTime`, `prUrl`.

- [x] **Step 1: Remove the ProviderStatus import**

In `website/src/components/FactoryFloor.svelte` delete line 16:

```svelte
  import ProviderStatus from './ProviderStatus.svelte';
```

- [x] **Step 2: Remove the ProviderStatus render**

Delete the render line (currently line 188):

```svelte
    <ProviderStatus providerHealth={data.providerHealth} />
```

- [x] **Step 3: Drop the unused props on the ShippedColumn invocation**

Change the `<ShippedColumn>` block (currently lines 246-254) so it reads exactly:

```svelte
      <ShippedColumn
        shipped={data.shipped}
        {mobileColIndex}
        {relTime}
        {prUrl}
      />
```

Do NOT alter the `import { relTime, prUrl, ticketUrl, planUrl, prioDot } from '../lib/factory-floor-client'` line (28), the `openDetail` function, or the `{ticketUrl}` on line 215 (that one feeds `StagedColumn`, which is out of scope).

- [x] **Step 4: Delete the orphaned component**

```bash
git rm website/src/components/ProviderStatus.svelte
```

- [x] **Step 5: Verify no dangling references remain**

Run: `cd website && grep -rn "ProviderStatus.svelte\|<ProviderStatus" src`
Expected: no matches (the `ProviderStatus` *type* import in `factory-floor.test.ts` and `factory-floor-types.ts` is a different symbol and must stay).

- [x] **Step 6: Typecheck / build the components**

Run: `cd website && npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -20`
Expected: no new errors referencing `FactoryFloor.svelte` or `ShippedColumn.svelte` (unused-prop / missing-import errors gone).

- [ ] **Step 7: Commit**

```bash
git add website/src/components/FactoryFloor.svelte
git commit -m "feat(website): drop ProviderStatus widget from Factory Floor homepage"
```

---

## Task 3: E2E assertion that the provider-status widget is gone

Implements delta-spec scenario "Provider-Status-Widget ist entfernt" at the E2E layer (Requirement annotation `<!-- e2e: fa-factory-floor.spec.ts -->`).

**Files:**
- Modify: `tests/e2e/specs/fa-factory-floor.spec.ts`

**Interfaces:**
- Consumes: the rendered `/admin/pipeline` page after Task 2 (no `floor-provider-status` node).
- Produces: a Playwright assertion locking in the removal so a future regression re-adding the widget fails CI/E2E.

- [x] **Step 1: Add the failing E2E test**

Inside the existing `test.describe('FactoryFloor /admin/pipeline', …)` block in `tests/e2e/specs/fa-factory-floor.spec.ts`, add:

```ts
  test('does not render the provider-status telemetry widget', async ({ page }) => {
    await page.goto('/admin/pipeline');
    await expect(page.getByTestId('factory-floor')).toBeVisible();
    await expect(page.getByTestId('floor-provider-status')).toHaveCount(0);
  });
```

- [x] **Step 2: Note on execution**

This E2E runs against a live deployment (nightly `e2e.yml` / post-deploy `dev-flow-e2e`), not in the offline PR gate. Expected against the *pre-change* build: FAIL (the widget still exists → count 1). Against the post-change build: PASS. It is committed now so the deployed assertion lands with the code change; do not block the PR on a live run.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/specs/fa-factory-floor.spec.ts
git commit -m "test(e2e): assert Factory Floor provider-status widget is removed"
```

---

## Task 4: Final verification & test-inventory

**Files:**
- Modify: `website/src/data/test-inventory.json` (regenerated)

- [x] **Step 1: Regenerate the test inventory (new test files were added)**

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

- [x] **Step 2: Validate the OpenSpec change (must be green before commit)**

```bash
task test:openspec   # or: bash scripts/openspec.sh validate
```
Expected: validation passes for `factory-floor-versand-reveal`.

- [x] **Step 3: Run the mandatory gate commands**

```bash
task test:changed          # vitest --changed + BATS selection + quality for touched domains
task freshness:regenerate  # refresh generated artefacts (test-inventory, repo-index, …)
task freshness:check       # CI-equivalent: freshness + quality:check (S1–S4 ratchet) + baseline assertion
```
Expected: all three exit 0. `freshness:check` confirms no S1 baseline growth (both `.svelte` files are net-neutral-or-smaller) and no orphan/hostname violations.

- [x] **Step 4: Commit any regenerated artefacts**

```bash
git add -A
git commit -m "chore(website): regenerate test-inventory + freshness artefacts for factory-floor-versand-reveal"
```
