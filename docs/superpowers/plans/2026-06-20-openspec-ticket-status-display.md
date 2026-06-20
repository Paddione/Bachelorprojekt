---
title: OpenSpec Ticket Status Display Implementation Plan
ticket_id: null
domains: [website, infra, db, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# OpenSpec Ticket Status Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface OpenSpec proposal status (planning / plan_staged / archived) per ticket in the Admin Cockpit and the ticket-ops triage skill, using a generated JSON map committed to the repo.

**Architecture:** A new shell script `scripts/openspec-status-map.sh` reads the `openspec/changes/` filesystem and writes `website/src/data/openspec-status.json` keyed by ticket ID. That JSON is statically imported in `cockpit-db.ts` (following the same pattern as `test-inventory.json` in the traceability API), merged onto `TicketRow` objects, and rendered as colour-coded badges in `TicketRow.svelte`. The map is regenerated automatically by `task freshness:regenerate` and after every `openspec.sh propose/apply/archive` call. No new DB schema is required.

**Tech Stack:** Bash, jq, TypeScript (Astro/Svelte), vitest + @testing-library/svelte, BATS (optional), go-task

## Global Constraints

- No hardcoded hostnames (`*.mentolder.de` / `*.korczewski.de`) in any changed file
- No new DB schema or migration
- All new `.sh` files: `set -euo pipefail`, executable bit set
- `scripts/openspec-status-map.sh` must be referenced from Taskfile and/or openspec.sh (S4 orphan rule)
- `website/src/data/openspec-status.json` must be added to the `freshness:check` FILES list (same as `test-inventory.json`)
- No baseline.json entries may be added — line budgets enforced via static extension limits below:
  - `cockpit-types.ts` (98 lines, limit 600) → budget **+502**
  - `cockpit-db.ts` (381 lines, limit 600) → budget **+219**
  - `CockpitTable.svelte` (196 lines, limit 500) → budget **+304**
  - `TicketRow.svelte` (98 lines, limit 500) → budget **+402**
  - `scripts/openspec.sh` (134 lines, limit 500) → budget **+366**
  - `scripts/openspec-status-map.sh` (new, limit 500)
  - `.claude/skills/ticket-ops/SKILL.md` (156 lines, no S1 gate for `.md`)
- No `resolveJsonModule` change needed — `website/tsconfig.json` already has it set to `true`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `scripts/openspec-status-map.sh` | **Create** | Scan `openspec/changes/` → emit `website/src/data/openspec-status.json` |
| `website/src/data/openspec-status.json` | **Create (generated)** | Static map: `{ "T000737": [{ slug, status }] }` |
| `website/src/lib/tickets/cockpit-types.ts` | **Modify** | Add `openspecProposals` field to `TicketRow` |
| `website/src/lib/tickets/cockpit-db.ts` | **Modify** | Import JSON, merge proposals onto every `TicketRow` |
| `website/src/components/admin/TicketRow.svelte` | **Modify** | Render OpenSpec badges inline |
| `website/src/components/admin/CockpitTable.svelte` | **Modify** | Add "OpenSpec" column header |
| `scripts/openspec.sh` | **Modify** | Call `openspec-status-map.sh` after propose/apply/archive |
| `Taskfile.yml` | **Modify** | Add `openspec:status-map` task; wire into `freshness:regenerate`; add file to `freshness:check` |
| `.claude/skills/ticket-ops/SKILL.md` | **Modify** | Extend Step 1.1 with OpenSpec status column |
| `website/src/components/admin/TicketRow.test.ts` | **Modify** | Add badge-rendering tests |
| `website/src/components/admin/CockpitTable.test.ts` | **Modify** | Add OpenSpec header column test |

---

### Task 1: `scripts/openspec-status-map.sh` — generator script

**Files:**
- Create: `scripts/openspec-status-map.sh`

**Interfaces:**
- Produces: `website/src/data/openspec-status.json` — shape `Record<string, Array<{ slug: string; status: "planning" | "plan_staged" | "archived" }>>`
- No arguments required; `OPENSPEC_ROOT` env var overrides the default `$REPO/openspec`
- Exit 0 always (no required OpenSpec changes is valid); writes `{}` when no changes found

- [ ] **Step 1: Write the script**

Create `/tmp/wt-openspec-ticket-status/scripts/openspec-status-map.sh`:

```bash
#!/usr/bin/env bash
# scripts/openspec-status-map.sh
# Scan openspec/changes/ and emit website/src/data/openspec-status.json.
# OPENSPEC_ROOT overrides the default openspec/ directory (used in tests).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
OPENSPEC_ROOT="${OPENSPEC_ROOT:-$REPO/openspec}"
OUT="$REPO/website/src/data/openspec-status.json"
CHANGES="$OPENSPEC_ROOT/changes"

# Accumulate jq-compatible JSON fragments
declare -a frags=()

collect_entry() {
  local dir="$1" status="$2"
  local base; base="$(basename "$dir")"
  local ticket_file="$dir/.ticket"
  [[ -f "$ticket_file" ]] || return 0
  local ticket_id; ticket_id="$(tr -d '[:space:]' < "$ticket_file")"
  [[ -n "$ticket_id" ]] || return 0
  frags+=("$(jq -nc \
    --arg tid "$ticket_id" --arg slug "$base" --arg st "$status" \
    '{ ticket: $tid, slug: $slug, status: $st }')")
}

if [[ -d "$CHANGES" ]]; then
  shopt -s nullglob
  # Active changes
  for dir in "$CHANGES"/*/; do
    local_base="$(basename "$dir")"
    [[ "$local_base" == "archive" ]] && continue
    if [[ -f "$dir/tasks.md" ]]; then
      collect_entry "$dir" "plan_staged"
    else
      collect_entry "$dir" "planning"
    fi
  done
  # Archived changes
  for dir in "$CHANGES/archive"/*/; do
    collect_entry "$dir" "archived"
  done
  shopt -u nullglob
fi

# Build final JSON: group entries by ticket_id → array of {slug, status}
TMP="$(mktemp)"
if [[ ${#frags[@]} -eq 0 ]]; then
  echo '{}' > "$TMP"
else
  printf '%s\n' "${frags[@]}" | jq -s '
    group_by(.ticket)
    | map({ key: .[0].ticket, value: map({ slug, status }) })
    | from_entries
  ' > "$TMP"
fi
mv "$TMP" "$OUT"
echo "openspec-status-map: wrote $OUT"
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x /tmp/wt-openspec-ticket-status/scripts/openspec-status-map.sh
```

- [ ] **Step 3: Run the script and inspect the output**

```bash
cd /tmp/wt-openspec-ticket-status
bash scripts/openspec-status-map.sh
cat website/src/data/openspec-status.json
```

Expected output: a JSON object with at least `T000959` key (current proposal exists in `openspec/changes/openspec-ticket-status-display/`):

```json
{
  "T000737": [{"slug": "grilling-ui-multichoice", "status": "plan_staged"}],
  "T000959": [{"slug": "openspec-ticket-status-display", "status": "plan_staged"}]
}
```

(Other existing proposals may appear too — that is correct.)

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-openspec-ticket-status
git add scripts/openspec-status-map.sh website/src/data/openspec-status.json
git commit -m "feat(openspec): add openspec-status-map.sh generator script [T000959]"
```

---

### Task 2: `Taskfile.yml` — wire generator into freshness lifecycle

**Files:**
- Modify: `Taskfile.yml` — add `openspec:status-map` task, call it from `freshness:regenerate`, add JSON to `freshness:check` FILES list

**Interfaces:**
- Consumes: `scripts/openspec-status-map.sh` (Task 1)
- Produces: `task openspec:status-map` command; `task freshness:regenerate` now also regenerates the OpenSpec map; `freshness:check` fails when map is stale

- [ ] **Step 1: Add `openspec:status-map` task**

Find the `test:inventory` task block (around line 794 in `Taskfile.yml`) and add the new task nearby (in the `openspec:*` namespace or near `test:*`). Insert after the `test:inventory` task:

```yaml
  openspec:status-map:
    desc: "Regenerate website/src/data/openspec-status.json from openspec/changes/"
    cmds:
      - bash scripts/openspec-status-map.sh
```

- [ ] **Step 2: Wire into `freshness:regenerate`**

In the `freshness:regenerate` task's `cmds` list (around line 861), add a call to `openspec:status-map` after the existing tasks:

```yaml
      - task: openspec:status-map
```

The updated `freshness:regenerate.cmds` should look like:

```yaml
    cmds:
      - '[ -d node_modules ] || npm ci'
      - task: test:inventory
      - task: routes:manifest
      - task: assets:learning
      - task: quality:index
      - task: agent-guide:emit
      - task: graph:build
      - task: openspec:status-map
```

- [ ] **Step 3: Add `openspec-status.json` to `freshness:check` FILES list**

In the `freshness:check` task's inline shell block (around line 875), add the new file to the `FILES` variable (one entry per line, same pattern as existing entries):

```
          website/src/data/openspec-status.json
```

The updated FILES block should include that line alongside the existing entries.

- [ ] **Step 4: Verify freshness:regenerate runs without error**

```bash
cd /tmp/wt-openspec-ticket-status
task freshness:regenerate
```

Expected: no errors; `website/src/data/openspec-status.json` is regenerated.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-openspec-ticket-status
git add Taskfile.yml
git commit -m "feat(openspec): wire openspec-status-map into freshness lifecycle [T000959]"
```

---

### Task 3: `scripts/openspec.sh` — auto-regenerate map after status changes

**Files:**
- Modify: `scripts/openspec.sh` — call `openspec-status-map.sh` at the end of `cmd_propose()`, `cmd_apply()`, `cmd_archive()`

**Interfaces:**
- Consumes: `scripts/openspec-status-map.sh` (Task 1)
- The map regeneration is best-effort (not run when `TICKET_OFFLINE=1` is set, since that signals a non-repo CI test environment)

- [ ] **Step 1: Add map-regeneration call to `cmd_propose()`**

In `scripts/openspec.sh`, locate the end of `cmd_propose()` (the line `echo "proposed: $dir (ticket $ticket, status planning)"`). Add the map regeneration **before** the echo line:

```bash
  if [[ "${TICKET_OFFLINE:-0}" != "1" ]]; then
    bash "$HERE/openspec-status-map.sh" >/dev/null 2>&1 || true
  fi
  echo "proposed: $dir (ticket $ticket, status planning)"
```

- [ ] **Step 2: Add map-regeneration call to `cmd_apply()`**

Locate the end of `cmd_apply()` (the line `echo "applied: $slug (implementable)"`). Add before it:

```bash
  if [[ "${TICKET_OFFLINE:-0}" != "1" ]]; then
    bash "$HERE/openspec-status-map.sh" >/dev/null 2>&1 || true
  fi
  echo "applied: $slug (implementable)"
```

- [ ] **Step 3: Add map-regeneration call to `cmd_archive()`**

Locate the end of `cmd_archive()` (the line `echo "archived: $slug -> $dest (delta merged into SSOT)"`). Add before it:

```bash
  if [[ "${TICKET_OFFLINE:-0}" != "1" ]]; then
    bash "$HERE/openspec-status-map.sh" >/dev/null 2>&1 || true
  fi
  echo "archived: $slug -> $dest (delta merged into SSOT)"
```

- [ ] **Step 4: Test that TICKET_OFFLINE suppresses the map call**

```bash
cd /tmp/wt-openspec-ticket-status
# Should NOT regenerate map (test / CI context)
TICKET_OFFLINE=1 OPENSPEC_ROOT=/tmp/wt-openspec-ticket-status/openspec \
  bash scripts/openspec.sh validate
echo "Exit: $?"
```

Expected: `openspec validate: OK` (no map regeneration side-effect).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-openspec-ticket-status
git add scripts/openspec.sh
git commit -m "feat(openspec): auto-regenerate status map after propose/apply/archive [T000959]"
```

---

### Task 4: `cockpit-types.ts` — add `openspecProposals` field to `TicketRow`

**Files:**
- Modify: `website/src/lib/tickets/cockpit-types.ts`

**Interfaces:**
- Produces: `TicketRow.openspecProposals?: Array<{ slug: string; status: 'planning' | 'plan_staged' | 'archived' }>`
- This optional field carries zero overhead when no proposals exist (field simply absent)

- [ ] **Step 1: Add `OpenSpecProposal` type and extend `TicketRow`**

In `website/src/lib/tickets/cockpit-types.ts`, add after the `HealthStatus` type declaration (after line 4):

```typescript
export type OpenSpecStatus = 'planning' | 'plan_staged' | 'archived';

export interface OpenSpecProposal {
  slug: string;
  status: OpenSpecStatus;
}
```

Then extend the `TicketRow` interface (currently ending at line 60 with `createdAt?: string;`) by adding the new field before the closing brace:

```typescript
  openspecProposals?: OpenSpecProposal[];
```

The complete updated `TicketRow` interface becomes:

```typescript
export interface TicketRow {
  id: string;
  extId: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  parentId?: string;
  planningRank?: number;
  estimateMinutes?: number;
  timeLoggedMinutes?: number;
  description?: string;
  component?: string;
  createdAt?: string;
  openspecProposals?: OpenSpecProposal[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /tmp/wt-openspec-ticket-status/website
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-openspec-ticket-status
git add website/src/lib/tickets/cockpit-types.ts
git commit -m "feat(cockpit): add OpenSpecProposal type and openspecProposals field to TicketRow [T000959]"
```

---

### Task 5: `cockpit-db.ts` — import status map and merge onto TicketRow

**Files:**
- Modify: `website/src/lib/tickets/cockpit-db.ts`

**Interfaces:**
- Consumes: `OpenSpecProposal` from `cockpit-types.ts` (Task 4); `website/src/data/openspec-status.json` (Task 1)
- The static import is resolved at build time (Astro SSR) — same pattern as `traceability.ts` importing `test-inventory.json`
- `mergeOpenSpec(tickets, map)` is a pure function (no DB calls) that sets `openspecProposals` on matching rows

- [ ] **Step 1: Add import of the JSON map**

At the top of `website/src/lib/tickets/cockpit-db.ts`, add after the existing imports:

```typescript
import type { OpenSpecProposal } from './cockpit-types';
import openspecStatusMap from '../../data/openspec-status.json';
```

Note: `OpenSpecProposal` is already in `cockpit-types.ts` after Task 4. The JSON import relies on `resolveJsonModule: true` in `website/tsconfig.json` (already set).

- [ ] **Step 2: Add `mergeOpenSpec` helper function**

Add this pure helper function after the `aggregate` function (around line 188 in the original file):

```typescript
/** Attach openspecProposals from the static JSON map onto ticket rows.
 *  Pure — mutates `tickets` in place and returns the same array. */
function mergeOpenSpec(tickets: TicketRow[]): TicketRow[] {
  const map = openspecStatusMap as Record<string, Array<{ slug: string; status: string }>>;
  for (const t of tickets) {
    const entries = map[t.extId];
    if (entries && entries.length > 0) {
      t.openspecProposals = entries as OpenSpecProposal[];
    }
  }
  return tickets;
}
```

- [ ] **Step 3: Call `mergeOpenSpec` in `getLeafTickets` and `getFeatureTickets`**

In `getLeafTickets` (around line 92), change the return statement from:

```typescript
  return { feature, tickets };
```

to:

```typescript
  return { feature, tickets: mergeOpenSpec(tickets) };
```

In `getFeatureTickets` (around line 238), change the return statement from:

```typescript
  return { feature, tickets };
```

to:

```typescript
  return { feature, tickets: mergeOpenSpec(tickets) };
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /tmp/wt-openspec-ticket-status/website
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Run the existing cockpit unit tests to confirm nothing is broken**

```bash
cd /tmp/wt-openspec-ticket-status/website
npx vitest run src/lib/tickets/ 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-openspec-ticket-status
git add website/src/lib/tickets/cockpit-db.ts
git commit -m "feat(cockpit): merge openspec status map onto TicketRow in cockpit-db [T000959]"
```

---

### Task 6: `TicketRow.svelte` — render OpenSpec badges + extend tests

**Files:**
- Modify: `website/src/components/admin/TicketRow.svelte`
- Modify: `website/src/components/admin/TicketRow.test.ts`

**Interfaces:**
- Consumes: `TicketRow.openspecProposals?: OpenSpecProposal[]` (Task 4)
- Renders zero, one, or multiple badges inline in the row (no new component file)
- Badge classes: `os-badge os-badge--planning`, `os-badge--plan_staged`, `os-badge--archived`
- Badge labels: `planning` → `SPEC`, `plan_staged` → `READY`, `archived` → `DONE`
- Badges occupy an additional grid cell that is hidden on mobile (`display: none` at `max-width: 767px`)

- [ ] **Step 1: Extend the TicketRow import**

In `website/src/components/admin/TicketRow.svelte`, the import at line 3 already imports `TicketRow as TicketRowT` from `cockpit-types`. No change needed — `openspecProposals` is already part of `TicketRowT` after Task 4.

- [ ] **Step 2: Add the badge cell to the template**

In the template section of `TicketRow.svelte`, after the `<span class="created ticket-col-created">` element (line 75), add:

```svelte
  <span class="os-badges ticket-col-openspec">
    {#if ticket.openspecProposals && ticket.openspecProposals.length > 0}
      {#each ticket.openspecProposals as p (p.slug)}
        <span class="os-badge os-badge--{p.status}" title={p.slug}>
          {p.status === 'planning' ? 'SPEC' : p.status === 'plan_staged' ? 'READY' : 'DONE'}
        </span>
      {/each}
    {/if}
  </span>
```

- [ ] **Step 3: Update the row grid layout to include the new cell**

In the `<style>` section of `TicketRow.svelte`, change the `.row` `grid-template-columns` from:

```css
  .row { display: grid;
    grid-template-columns: auto auto auto 1fr auto auto auto; gap: 0.5rem;
```

to:

```css
  .row { display: grid;
    grid-template-columns: auto auto auto 1fr auto auto auto auto; gap: 0.5rem;
```

(Eight columns: checkbox | handle | ext-id | title | status | priority | created | openspec)

- [ ] **Step 4: Add badge styles**

In the `<style>` section, add after the `.created` rule:

```css
  .os-badges { display: flex; gap: 0.25rem; align-items: center; }
  .os-badge { font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.4rem; border-radius: 4px;
    letter-spacing: 0.04em; white-space: nowrap; }
  .os-badge--planning   { background: #78350f; color: #fde68a; }
  .os-badge--plan_staged{ background: #14532d; color: #86efac; }
  .os-badge--archived   { background: #374151; color: #9ca3af; }
```

- [ ] **Step 5: Hide the openspec column on mobile**

In the existing `@media (max-width: 767px)` block, add `TicketRow.svelte`'s current mobile rule:

```css
  @media (max-width: 767px) {
    .row { grid-template-columns: auto auto 1fr auto; }
    .ticket-col-id, .ticket-col-created, .ticket-col-openspec { display: none; }
    .priority-select { display: none; }
  }
```

- [ ] **Step 6: Write failing tests for badge rendering**

In `website/src/components/admin/TicketRow.test.ts`, add a new test suite at the end of the file:

```typescript
describe('TicketRow OpenSpec badges', () => {
  const base = { id: 't1', extId: 'T000959', title: 'Spec Feature', status: 'plan_staged',
    priority: 'mittel', type: 'task' };

  it('renders no badge when openspecProposals is absent', () => {
    const { container } = render(TicketRow, { ticket: base });
    expect(container.querySelectorAll('.os-badge').length).toBe(0);
  });

  it('renders a SPEC badge for planning status', () => {
    const ticket = { ...base, openspecProposals: [{ slug: 'my-proposal', status: 'planning' as const }] };
    const { container } = render(TicketRow, { ticket });
    const badge = container.querySelector('.os-badge--planning');
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toBe('SPEC');
  });

  it('renders a READY badge for plan_staged status', () => {
    const ticket = { ...base, openspecProposals: [{ slug: 'my-proposal', status: 'plan_staged' as const }] };
    const { container } = render(TicketRow, { ticket });
    const badge = container.querySelector('.os-badge--plan_staged');
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toBe('READY');
  });

  it('renders a DONE badge for archived status', () => {
    const ticket = { ...base, openspecProposals: [{ slug: 'my-proposal', status: 'archived' as const }] };
    const { container } = render(TicketRow, { ticket });
    const badge = container.querySelector('.os-badge--archived');
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toBe('DONE');
  });

  it('renders multiple badges when multiple proposals exist', () => {
    const ticket = { ...base, openspecProposals: [
      { slug: 'proposal-a', status: 'planning' as const },
      { slug: 'proposal-b', status: 'plan_staged' as const },
    ]};
    const { container } = render(TicketRow, { ticket });
    expect(container.querySelectorAll('.os-badge').length).toBe(2);
  });
});
```

- [ ] **Step 7: Run the failing tests to confirm they fail**

```bash
cd /tmp/wt-openspec-ticket-status/website
npx vitest run src/components/admin/TicketRow.test.ts 2>&1 | tail -30
```

Expected: the new `OpenSpec badges` suite fails with `querySelectorAll('.os-badge')` returning 0 (template not yet updated).

- [ ] **Step 8: Confirm the full test suite passes after implementing**

After applying all changes from Steps 2–5 above:

```bash
cd /tmp/wt-openspec-ticket-status/website
npx vitest run src/components/admin/TicketRow.test.ts 2>&1 | tail -20
```

Expected: all tests pass, including the new `OpenSpec badges` suite.

- [ ] **Step 9: Commit**

```bash
cd /tmp/wt-openspec-ticket-status
git add website/src/components/admin/TicketRow.svelte website/src/components/admin/TicketRow.test.ts
git commit -m "feat(cockpit): render OpenSpec proposal badges in TicketRow [T000959]"
```

---

### Task 7: `CockpitTable.svelte` — add OpenSpec column header + extend tests

**Files:**
- Modify: `website/src/components/admin/CockpitTable.svelte`
- Modify: `website/src/components/admin/CockpitTable.test.ts`

**Interfaces:**
- Consumes: the grid layout change from Task 6 (TicketRow now has 8 columns)
- The header row must stay in sync with the row grid (both use 8 columns on desktop, 4 on mobile)

- [ ] **Step 1: Write the failing test first**

In `website/src/components/admin/CockpitTable.test.ts`, add at the end of the `CockpitTable` describe block (before the closing `}`):

```typescript
  it('renders an OpenSpec column header', () => {
    const { getByTestId } = render(CockpitTable, { feature, tickets, features: [feature] });
    const header = getByTestId('table-header');
    expect(header.textContent).toMatch(/openspec/i);
  });
```

- [ ] **Step 2: Run the failing test to confirm it fails**

```bash
cd /tmp/wt-openspec-ticket-status/website
npx vitest run src/components/admin/CockpitTable.test.ts --reporter=verbose 2>&1 | grep -A5 "OpenSpec column"
```

Expected: FAIL — "expected string to match /openspec/i" (header does not yet contain "OpenSpec").

- [ ] **Step 3: Update the header row in `CockpitTable.svelte`**

In the template, locate the `div.row-header` block (around line 131–134):

```svelte
  <div class="row-header" data-testid="table-header" role="row" aria-hidden="true">
    <span></span><span></span><span>ID</span><span>Titel</span>
    <span>Status</span><span class="col-prio">Priorität</span><span class="col-date">Erstellt</span>
  </div>
```

Change to:

```svelte
  <div class="row-header" data-testid="table-header" role="row" aria-hidden="true">
    <span></span><span></span><span>ID</span><span>Titel</span>
    <span>Status</span><span class="col-prio">Priorität</span>
    <span class="col-date">Erstellt</span><span class="col-openspec">OpenSpec</span>
  </div>
```

- [ ] **Step 4: Update `.row-header` grid-template-columns in `CockpitTable.svelte`**

In the `<style>` section, find the `.row-header` rule (around line 182–185). Change the `grid-template-columns` from 7 columns to 8:

```css
  .row-header { display: grid; grid-template-columns: auto auto auto 1fr auto auto auto auto;
    gap: 0.5rem; align-items: center; padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--admin-border, #2a2e37);
    border-left: 3px solid transparent; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--admin-text-mute, #9ca3af); position: sticky; top: 0; background: var(--admin-surface, #14171d); z-index: 1; }
```

- [ ] **Step 5: Update the mobile `@media` block in `CockpitTable.svelte`**

In the existing `@media (max-width: 767px)` block (around line 192–195), add `col-openspec` to the hidden columns:

```css
  @media (max-width: 767px) {
    .row-header .col-prio, .row-header .col-date, .row-header .col-openspec { display: none; }
    .row-header { grid-template-columns: auto auto 1fr auto; }
  }
```

- [ ] **Step 6: Run the full CockpitTable test suite to confirm all tests pass**

```bash
cd /tmp/wt-openspec-ticket-status/website
npx vitest run src/components/admin/CockpitTable.test.ts 2>&1 | tail -20
```

Expected: all tests pass, including the new "renders an OpenSpec column header" test.

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-openspec-ticket-status
git add website/src/components/admin/CockpitTable.svelte website/src/components/admin/CockpitTable.test.ts
git commit -m "feat(cockpit): add OpenSpec column header to CockpitTable [T000959]"
```

---

### Task 8: `.claude/skills/ticket-ops/SKILL.md` — extend triage with OpenSpec status

**Files:**
- Modify: `.claude/skills/ticket-ops/SKILL.md`

**Interfaces:**
- Consumes: `website/src/data/openspec-status.json` (Task 1) read via `jq`
- The skill is a markdown document read by an AI agent — the changes are prose + shell snippets, not compiled code

- [ ] **Step 1: Add OpenSpec status block after the SQL query in Step 1.1**

In `.claude/skills/ticket-ops/SKILL.md`, locate the end of the `### Step 1.1: Fetch Open Tickets` block (after the SQL code block, before `### Step 1.2`). Insert the following new section between Step 1.1 and Step 1.2:

```markdown
### Step 1.1b: Load OpenSpec Status Map

After fetching tickets, enrich the triage view with OpenSpec proposal status. The map is pre-generated and committed in the repo:

```bash
OMAP_FILE="$REPO/website/src/data/openspec-status.json"
# Regenerate if the file is missing (e.g. freshly cloned worktree without freshness:regenerate)
if [[ ! -f "$OMAP_FILE" ]]; then
  bash "$REPO/scripts/openspec-status-map.sh"
fi

get_openspec_status() {
  local ext_id="$1"
  jq -r --arg id "$ext_id" '.[$id] // [] | map("\(.status):\(.slug)") | join(", ")' \
    "$OMAP_FILE" 2>/dev/null || echo ""
}
```

When displaying the triage table, append the OpenSpec status column. Example output format:

```
T000953 | Cockpit Fullscreen     | plan_staged | hoch    | READY (cockpit-fullscreen-overview)
T000959 | OpenSpec Status Badge  | plan_staged | mittel  | READY (openspec-ticket-status-display)
T000943 | Awaiting-Deploy Gaps   | planning    | mittel  | SPEC (fix-awaiting-deploy-visualization-gaps)
T000738 | Unbekanntes Feature    | backlog      | niedrig | —
```

Use `get_openspec_status "$ext_id"` per row and display `—` when the result is empty.
```

- [ ] **Step 2: Verify SKILL.md is still valid markdown (no broken headers)**

```bash
grep -n "^###" /tmp/wt-openspec-ticket-status/.claude/skills/ticket-ops/SKILL.md
```

Expected: sections appear in order: `Step 1.1`, `Step 1.1b`, `Step 1.2`, `Step 2.1`, etc.

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-openspec-ticket-status
git add .claude/skills/ticket-ops/SKILL.md
git commit -m "feat(ticket-ops): add OpenSpec status column to triage output [T000959]"
```

---

### Task 9: Verification — CI gates, freshness, and integration smoke

**Files:**
- No new files; runs the full gate suite

**Interfaces:**
- Consumes: all changes from Tasks 1–8
- Passes when: all vitest tests pass, `freshness:check` is green, `openspec validate` is OK

- [ ] **Step 1: Run targeted vitest tests**

```bash
cd /tmp/wt-openspec-ticket-status
task test:changed
```

Expected: all website vitest tests pass (including new TicketRow and CockpitTable badge tests).

- [ ] **Step 2: Regenerate all freshness artifacts**

```bash
cd /tmp/wt-openspec-ticket-status
task freshness:regenerate
```

Expected: completes without error; `website/src/data/openspec-status.json` is regenerated.

- [ ] **Step 3: Run freshness:check (full CI gate)**

```bash
cd /tmp/wt-openspec-ticket-status
task freshness:check
```

Expected output contains:
- `✓ All generated artifacts are fresh`
- No S1 line-limit violations
- `quality:check` passes

- [ ] **Step 4: Validate OpenSpec change tree**

```bash
cd /tmp/wt-openspec-ticket-status
bash scripts/openspec.sh validate
```

Expected: `openspec validate: OK`

- [ ] **Step 5: Smoke-test the generator with an isolated OPENSPEC_ROOT**

```bash
cd /tmp/wt-openspec-ticket-status

# Create a minimal test fixture
FIXTURE=$(mktemp -d)
mkdir -p "$FIXTURE/changes/my-proposal/specs"
echo "T123456" > "$FIXTURE/changes/my-proposal/.ticket"
touch "$FIXTURE/changes/my-proposal/proposal.md"
# No tasks.md → should be "planning"

OPENSPEC_ROOT="$FIXTURE" OUT_EXPECTED="$FIXTURE/out.json"

# Run the generator with overridden OUT path
OPENSPEC_ROOT="$FIXTURE" bash scripts/openspec-status-map.sh
cat website/src/data/openspec-status.json | jq .

# Verify T123456 maps to planning
jq -e '.T123456[0].status == "planning"' website/src/data/openspec-status.json

# Add tasks.md → should become plan_staged after re-run
touch "$FIXTURE/changes/my-proposal/tasks.md"
OPENSPEC_ROOT="$FIXTURE" bash scripts/openspec-status-map.sh
jq -e '.T123456[0].status == "plan_staged"' website/src/data/openspec-status.json

rm -rf "$FIXTURE"
echo "Smoke test PASSED"
```

Expected: `Smoke test PASSED`

- [ ] **Step 6: Commit the verified state and any stale artifacts**

```bash
cd /tmp/wt-openspec-ticket-status
git add website/src/data/openspec-status.json
git status
# If any other generated files were updated by freshness:regenerate, add them too
git add -p  # review each hunk before staging
git commit -m "chore(freshness): regenerate artifacts after openspec-status-map integration [T000959]"
```

---

## Self-Review Against Spec

**Spec coverage check:**

| Spec requirement | Task covering it |
|---|---|
| `scripts/openspec-status-map.sh` reads `openspec/changes/*/.ticket` | Task 1 |
| Status matrix: planning / plan_staged / archived | Task 1 (script logic) |
| JSON format `{ "T000737": [{ slug, status }] }` | Task 1 (jq pipeline) |
| `task freshness:regenerate` triggers map regeneration | Task 2 |
| `openspec.sh propose/apply/archive` regenerates map | Task 3 |
| `openspecProposals` field on `TicketRow` | Task 4 |
| Static JSON import in `cockpit-db.ts` | Task 5 |
| Badge colors: planning=yellow, plan_staged=green, archived=gray | Task 6 |
| Badge labels: SPEC / READY / DONE | Task 6 |
| Multiple proposals → multiple badges | Task 6 |
| "OpenSpec" column header in CockpitTable | Task 7 |
| Mobile: hide OpenSpec column | Tasks 6 + 7 |
| ticket-ops Step 1.1: OpenSpec status enrichment | Task 8 |
| Shell snippet with `get_openspec_status()` function | Task 8 |
| Example triage table with OpenSpec column | Task 8 |
| Verification gates: test:changed, freshness:regenerate, freshness:check, openspec validate | Task 9 |

**Placeholder scan:** All tasks carry complete, concrete implementation steps. No deferred or incomplete items remain. All code blocks are fully written out.

**Type consistency:**
- `OpenSpecProposal.status` typed as `'planning' | 'plan_staged' | 'archived'` in Task 4 — used verbatim in Task 6 badge class names (`os-badge--${p.status}`) and `get_openspec_status` output in Task 8.
- `mergeOpenSpec` in Task 5 casts the JSON to `Record<string, Array<{ slug: string; status: string }>>` and then to `OpenSpecProposal[]` — safe because the generator (Task 1) emits exactly that shape.
- `TicketRow.openspecProposals?: OpenSpecProposal[]` — optional in types (Task 4), treated as optional in template (Task 6: `{#if ticket.openspecProposals && ...}`), tests cover the absent case explicitly.
