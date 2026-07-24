# p1 — Extract the Stage-2 half of `website-db.ts` into three new leaf modules

**Rolle:** impl
**target_files:** `website/src/lib/website-db.ts`, `website/src/lib/website-db-ops.ts` (new),
`website/src/lib/website-db-admin-ops.ts` (new), `website/src/lib/website-db-content-store.ts` (new)

## Assumption: Stage 1 (T002149) is already merged when this runs

This plan is authored against the **current, pre-Stage-1** state of `website-db.ts` (1939 lines,
this worktree's HEAD). Per `depends_on_plans: [T002149]` in `tasks.md`, T002149 merges to `main`
before this partial is implemented, and T002149 removes the first functional half (Timeline,
Customer, Meeting, Bug-Tickets CRUD, Site-Settings, Vacation, Legal-Pages — roughly the current
lines 76–740) into `website-db-core.ts`. **All line numbers cited below are pre-Stage-1 coordinates
for locating and verifying content today; the executor MUST locate every function by name/export
signature, not by line number, once Stage 1 has landed** — Stage 1's removal shifts everything after
line ~740 upward by however many lines Stage 1 actually deletes. Re-run the `grep -n` commands in
each task before editing to get live line numbers on the post-Stage-1 file.

## Deviation from the brief: three new modules, not one `website-db-ops.ts`

The task brief (and the change proposal's prose) frame Stage 2 as "one new module
`website-db-ops.ts`". Measuring the actual content confirms that doesn't fit the S1 gate:

```bash
sed -n '741,1001p' website/src/lib/website-db.ts | wc -l   # Time Entries        → 261
sed -n '1002,1057p' website/src/lib/website-db.ts | wc -l  # Client Notes        → 56
sed -n '1058,1134p' website/src/lib/website-db.ts | wc -l  # Onboarding          → 77
sed -n '1135,1250p' website/src/lib/website-db.ts | wc -l  # Follow-ups          → 116
sed -n '1251,1318p' website/src/lib/website-db.ts | wc -l  # Bug Ticket List     → 68
sed -n '1444,1510p' website/src/lib/website-db.ts | wc -l  # Admin Shortcuts     → 67
sed -n '1511,1540p' website/src/lib/website-db.ts | wc -l  # DSGVO Audit Log     → 30
sed -n '1541,1603p' website/src/lib/website-db.ts | wc -l  # Invoice Counter     → 63
sed -n '1604,1618p' website/src/lib/website-db.ts | wc -l  # Brett               → 15
sed -n '1630,1733p' website/src/lib/website-db.ts | wc -l  # Custom Sections     → 104
sed -n '1741,1939p' website/src/lib/website-db.ts | wc -l  # Content-Store       → 199
```

That's **1056 lines** of function/type bodies to move (the re-export blocks for
`appointments-db`/`content-bundle`/`test-infra-db`/`billing-db` interleaved in this range at lines
1319–1355, 1359–1443, 1619–1628 stay in `website-db.ts` untouched — they already delegate
elsewhere and aren't part of this extraction). A single new file would land at **~1075–1085 lines**
(content + a shared import header) — 79% over the 600-line `.ts` S1 limit, and since it's a
brand-new file with no `baseline.json` entry, the S1 ratchet hard-fails it in CI immediately (no
existing baseline to fall back on, per `plan-quality-gates.md` S1 rule: *"eine neue / nicht
gebaselinete Datei über ihrem Extension-Limit liegt"* blocks CI). Per S1 rule 4 (split before a
file crosses ~80% of its effective threshold) and rule 6 (never plan a baseline/ignore exception to
dodge the limit), this plan splits the extraction across **three** sibling modules instead of one,
each cut with real growth reserve:

| New file | Contents | Moved-content lines | + import header (est.) | Total (est.) | Budget | Reserve |
|---|---|---|---|---|---|---|
| `website-db-ops.ts` | Time-Entries, Client-Notes, Onboarding, Follow-ups | 510 | ~20 | ~530 | 600 | ~70 (~12%) |
| `website-db-admin-ops.ts` | Bug-Ticket-List, Admin-Shortcuts, DSGVO-Audit-Log, Invoice-Counter, Brett | 243 | ~20 | ~263 | 600 | ~337 (~56%) |
| `website-db-content-store.ts` | Custom Website Sections, Content-Store accessors | 303 | ~25 | ~328 | 600 | ~272 (~45%) |

`website-db-ops.ts` keeps the name and the largest/most central subset the brief asked for; the
other two are additions this plan makes to stay gate-compliant. All three re-export flatly from
`website-db.ts` under the original names (same precedent as `website-db.ts:1736` →
`export { initBillingTables, initTaxMonitorTables, initEurTables } from './billing-db';`), so
REQ-WEBSITE-DB-SPLIT-STAGE2-001's "no call-site import-path change" guarantee holds regardless of
how many physical files sit behind `website-db.ts` — only the module boundary inside the lib layer
differs from the brief's literal single-file wording. **Flag this split for the human reviewer
before merge** — it's a deliberate deviation from the proposal text, justified by the line-count
math above, not an oversight.

New-file budget claims above are not checked by `plan-lint`'s B1a (files that don't exist on disk
yet are skipped), so they're advisory for the human/executor, not a hard-gate assertion.

`website/src/lib/website-db.ts` current state: **1939 lines**. Extension limit 600, not present in
`docs/code-quality/baseline.json` (`jq -r '."S1:website/src/lib/website-db.ts".metric // "nicht-baselined"' docs/code-quality/baseline.json` → `nicht-baselined`), so its effective threshold is
the static 600 limit → computed budget **-1339**. This is not a new problem: the file is listed in
`docs/code-quality/gates.yaml` `s1.ignore` (line 72) specifically because of this, with the comment
"Remains in s1.ignore until it reaches ≤600 lines" — so today's negative number does **not** fail
CI. This plan's whole point is to shrink towards that exit condition (see Task 1.6).

## Cross-module call / type dependencies found (verified by grep across the moved ranges)

A systematic `grep` of every Stage-1-side function/type name (`listTimeline`, `upsertCustomer`,
`assignMeeting`, `insertBugTicket`, `getSiteSetting`, `getVacationPeriods`, `getLegalPage`, etc.,
plus the Stage-1-owned types `TimelineRow`, `PendingEnrollment`, `BugTicketStatus`,
`BugTicketComment`, `VacationPeriod`, `NavKey`/`FooterKey`/`StammdatenKey`/`KoreFlagsKey`/
`PricingHighlightKey`) against the full Stage-2 line range (741–1939) found **exactly one** hit:

- **`BugTicketRow`** (interface defined at current line 444, inside Stage-1's Bug-Tickets scope) is
  used as the return type of `listBugTickets` (current line 1256, moving to
  `website-db-admin-ops.ts`). **Resolution:** `website-db-admin-ops.ts` imports the type directly
  from Stage 1's module — `import type { BugTicketRow } from './website-db-core';` — **not** via
  `./website-db`. Importing through `website-db.ts` would create a cycle
  (`website-db.ts` → `./website-db-admin-ops` → `./website-db` → …) since `website-db.ts` itself
  re-exports from `website-db-admin-ops.ts` after this move. Verify Stage 1's actual module name
  once merged (this plan assumes `website-db-core.ts` per the Stage-1 ticket brief — adjust the
  import path if Stage 1 landed under a different name).

The reverse check (do any of the ~30 Stage-1 function/type names appear used *inside* lines 1–740
by code that's moving in Stage 2 — i.e. would Stage 1 need something Stage 2 owns) also found
**zero** hits — the two stages are cleanly disjoint at the call-graph level, confirming the
`depends_on_plans: [T002149]` ordering is about avoiding a two-partial-same-file plan-lint D1
violation, not about avoiding a real runtime dependency.

**Within Stage 2 itself**, a systematic cross-check between the three destination files (does
anything in the Time-Entries/Client-Notes/Onboarding/Follow-ups block reference anything in the
Bug-Ticket-List/Admin-Shortcuts/DSGVO/Invoice/Brett block or the Custom-Sections/Content-Store
block, and vice versa in both directions) found **zero** cross-references. The three-way split has
no internal coupling to resolve.

**Documented non-issue (pre-existing, unaffected by the move):** `readContent`/`writeContent`
(moving to `website-db-content-store.ts`) run raw SQL against the `site_settings` and `legal_pages`
tables (`liveRead`/`liveWrite`'s `'site_setting'`/`'legal_page'` cases) without calling
`initSiteSettingsTable()`/`initLegalPagesTable()` first — those schema-init functions live in
Stage 1's module. This is a **table-level** coupling (same Postgres database, not a TS import), and
it already exists today exactly as-is before any split — moving the code doesn't introduce or
change this coupling, so it's not a new risk from this extraction. Not an import cycle, no action
needed here beyond noting it so a future person doesn't mistake it for a regression this PR caused.

## Task 1.1 — New module `website-db-ops.ts`: Time-Entries, Client-Notes, Onboarding, Follow-ups

Create `website/src/lib/website-db-ops.ts` with this header:

```ts
import { pool } from './db-pool';
import { initTicketsSchema } from './tickets-schema';
```

Move from `website-db.ts` (current line ranges — **re-locate by name after Stage 1 merges**):

- **Time Entries** (741–1001): the `TimeEntry` interface, the module-private
  `timeEntriesReady` flag + `initTimeEntriesTable()`, and `getLastTimeEntryRate`,
  `createTimeEntry`, `listTimeEntries`, `listAllTimeEntries`, `setTimeEntryStripeInvoice`,
  `getTimeEntryIdsByInvoice`, the `UnbilledCustomerGroup` interface,
  `getUnbilledBillableEntriesByCustomer`, `deleteTimeEntry`, `getProjectTotalMinutes`.
- **Client Notes** (1002–1057): `ClientNote` interface, private `initClientNotesTable()`,
  `listClientNotes`, `createClientNote`, `deleteClientNote`.
- **Onboarding-Checkliste** (1058–1134): `OnboardingItem` interface, the private
  `DEFAULT_ONBOARDING_ITEMS` array and `initOnboardingTable()`, `getOrCreateOnboardingChecklist`,
  `toggleOnboardingItem`, `resetOnboardingChecklist`.
- **Follow-ups** (1135–1250): `FollowUp` interface, private `initFollowUpsTable()`,
  `createFollowUp`, `listFollowUps`, `getDueFollowUps`, `updateFollowUp`, `deleteFollowUp`.

All four blocks are pure moves — no signature or logic changes. Every DB call in this range already
goes through `pool` from `./db-pool` and (Time Entries only) `initTicketsSchema` from
`./tickets-schema`; both are leaf modules that don't import back from `website-db.ts` or any of the
three new files, so this is S2-safe.

**Step:** confirm the moved block compiles standalone:

```bash
cd website && pnpm exec tsc --noEmit -p tsconfig.json
```

## Task 1.2 — New module `website-db-admin-ops.ts`: Bug-Ticket-List, Admin-Shortcuts, DSGVO-Audit-Log, Invoice-Counter, Brett

Create `website/src/lib/website-db-admin-ops.ts` with this header:

```ts
import { pool } from './db-pool';
import { initTicketsSchema } from './tickets-schema';
import type { BugTicketRow } from './website-db-core';
```

The `BugTicketRow` import is the one confirmed cross-module dependency (see above) — import it
directly from Stage 1's module, never via `./website-db`, to avoid a cycle.

Move from `website-db.ts`:

- **Bug Ticket List** (1251–1318): `listBugTickets` only — it calls `initTicketsSchema()` and
  `pool.query` directly and does not call any of Stage 1's `insertBugTicket` /
  `resolveBugTicket` / `archiveBugTicket` / `getBugTicketWithComments` /
  `appendBugTicketComment` / `reopenBugTicket` functions (verified by grep — zero hits), only their
  shared `BugTicketRow` return type.

  **Risk to flag for the human reviewer (per the task brief):** `listBugTickets` is the *read* side
  of the bug-ticket domain, and every other bug-ticket function (`insertBugTicket`,
  `resolveBugTicket`, `archiveBugTicket`, `getBugTicketStatus`, `getBugTicketWithComments`,
  `appendBugTicketComment`, `reopenBugTicket`) is owned by Stage 1's module. There was no way to
  coordinate live with the Stage-1 author while writing this plan, so `listBugTickets` stays in
  Stage 2 as originally scoped by the proposal. If Stage 1 lands with its own re-export block for
  the bug-ticket domain, double-check at merge time that `website-db.ts` doesn't end up with two
  `export { listBugTickets, ... }` statements from two different source modules (a duplicate-export
  TS compile error) — if that happens, move `listBugTickets` into Stage 1's module instead and drop
  it from this file.
- **Admin Shortcuts** (1444–1510): `AdminShortcut` interface, private
  `initAdminShortcutsTable()`, `listAdminShortcuts`, `createAdminShortcut`, `deleteAdminShortcut`,
  `updateAdminShortcut`.
- **DSGVO Audit Log** (1511–1540): private `initDsgvoAuditTable()`, `insertDsgvoRequest`.
- **Invoice Counter** (1541–1603): the module-private `invoiceCountersReady` flag and
  `initInvoiceCountersTable()`, `getNextInvoiceNumber`, `seedInvoiceCounter`.
- **Brett** (1604–1618): `claimBrettLinkPost`. Reads/writes the `meetings` table by raw SQL — the
  same table Stage 1's `assignMeeting` touches, but again a table-level coupling, not a function
  call; no import needed.

**Step:**

```bash
cd website && pnpm exec tsc --noEmit -p tsconfig.json
```

## Task 1.3 — New module `website-db-content-store.ts`: Custom Website Sections, Content-Store accessors

Create `website/src/lib/website-db-content-store.ts` with this header:

```ts
import { pool, ensureSchemaOnce } from './db-pool';
import type { Pool, PoolClient } from 'pg';
import { refFor } from './content-registry';
import { idsToPrune } from './admin/version-prune';
import { isConflict as detectConflict, nextVersion as bumpVersion } from './admin/conflict';
```

Move from `website-db.ts`:

- **Custom Website Sections** (1630–1733): `CustomSectionField` interface, `CustomSection`
  interface, the module-private `customSectionsReady` flag and `initCustomSectionsTable()`,
  `listCustomSections`, `getCustomSection`, `createCustomSection`, `updateCustomSection`,
  `deleteCustomSection`.
- **Content-Store accessors** (1741–1939, T000306): the private `initServicePageConfigTable()`
  (used only by `liveRead`/`liveWrite`'s `'service'` case — moves together, it's not referenced
  anywhere else), the `ContentRead` interface, the `ContentConflictError` class, the private
  `safeJson`, `liveRead`, `liveWrite` helpers, and `readContent`, `writeContent`, `listVersions`.

`content-registry.ts`, `admin/version-prune.ts`, and `admin/conflict.ts` are leaf modules (grepped
their imports — none reference `website-db`), so importing them here is S2-safe.

**Step:**

```bash
cd website && pnpm exec tsc --noEmit -p tsconfig.json
```

## Task 1.4 — Wire re-exports in `website-db.ts`, remove the moved code

Delete the moved bodies from `website-db.ts` (the ranges listed in Tasks 1.1–1.3) and replace them
with re-export statements, following the exact precedent already in the file at line 1736
(`export { initBillingTables, initTaxMonitorTables, initEurTables } from './billing-db';`):

```ts
// Time-Entries/Client-Notes/Onboarding/Follow-ups domain extracted to website-db-ops.ts (T002150)
export {
  getLastTimeEntryRate, createTimeEntry, listTimeEntries, listAllTimeEntries,
  setTimeEntryStripeInvoice, getTimeEntryIdsByInvoice, getUnbilledBillableEntriesByCustomer,
  deleteTimeEntry, getProjectTotalMinutes,
  listClientNotes, createClientNote, deleteClientNote,
  getOrCreateOnboardingChecklist, toggleOnboardingItem, resetOnboardingChecklist,
  createFollowUp, listFollowUps, getDueFollowUps, updateFollowUp, deleteFollowUp,
} from './website-db-ops';
export type { TimeEntry, UnbilledCustomerGroup, ClientNote, OnboardingItem, FollowUp } from './website-db-ops';

// Bug-Ticket-List/Admin-Shortcuts/DSGVO/Invoice-Counter/Brett extracted to
// website-db-admin-ops.ts (T002150)
export {
  listBugTickets,
  listAdminShortcuts, createAdminShortcut, deleteAdminShortcut, updateAdminShortcut,
  insertDsgvoRequest,
  getNextInvoiceNumber, seedInvoiceCounter,
  claimBrettLinkPost,
} from './website-db-admin-ops';
export type { AdminShortcut } from './website-db-admin-ops';

// Custom-Sections/Content-Store extracted to website-db-content-store.ts (T002150)
export {
  listCustomSections, getCustomSection, createCustomSection, updateCustomSection, deleteCustomSection,
  readContent, writeContent, listVersions,
  ContentConflictError,
} from './website-db-content-store';
export type { CustomSection, CustomSectionField, ContentRead } from './website-db-content-store';
```

Place each block where its source content used to live (keeps the diff reviewable and preserves
the file's existing "domain extracted to X (goal)" comment convention already used for
`appointments-db.ts`, `test-infra-db.ts`, and `billing-db.ts`). Every external caller that imports
these names from `$lib/website-db` (90 files, 373 hits on the broader `website-db` symbol set per a
repo-wide grep — includes `admin.astro`, `api/admin/bugs/list.ts`, `api/admin/content/*.ts`,
`api/admin/legal/retokenize.ts`, `api/admin/inbox/[id]/action.ts`,
`api/admin/billing/create-monthly-invoices.ts`, `admin/inhalte.astro`, plus the three existing test
files `website-db.test.ts`, `website-db-projects.test.ts`, `website-db.content-store.test.ts`)
keeps working unchanged, since the import path (`$lib/website-db`) doesn't move — only satisfies
REQ-WEBSITE-DB-SPLIT-STAGE2-001 if this step is a true no-op for every one of those call sites (no
signature changes anywhere in Tasks 1.1–1.3).

**Step — RED before this task, GREEN after (STRUCT2 failing-test step):**

```bash
cd website && pnpm exec vitest run src/lib/website-db.test.ts src/lib/website-db-projects.test.ts src/lib/website-db.content-store.test.ts
# expected: FAIL before this task (imports resolve to functions that no longer exist in
# website-db.ts once Tasks 1.1-1.3 delete the bodies but before this task adds the re-exports)
```

Run the same command again after adding the re-exports — it must pass (GREEN). These three
existing Vitest files already cover the content being moved (per their own doc-comments —
`website-db.content-store.test.ts` mocks `pg` directly and exercises `readContent`/`writeContent`;
`website-db.test.ts`/`website-db-projects.test.ts` share the pg-mem-backed mock and cover
Time-Entries among other things) and import from `website-db.ts`/relative paths that don't need to
change, since the re-export preserves every name. No new test files are needed for this partial —
p2 (`tasks.d/p2-tests.md`) is responsible for judging whether additional direct-import coverage of
the three new modules is worth adding on top of this existing coverage.

<!-- vitest: no new test file needed in p1 — website-db.test.ts / website-db-projects.test.ts /
     website-db.content-store.test.ts already exercise this exact code through the unchanged
     $lib/website-db import path; p2 owns any additional direct-module test coverage. -->

## Task 1.5 — Import-cycle verification (S2)

```bash
task quality:check
```

This runs `node scripts/code-quality/check.mjs`, which includes the S2 cycle check
(`scripts/code-quality/gates/s2-cycles.mjs`) against the `website` graph
(`website/tsconfig.json`, per `docs/code-quality/gates.yaml` → `s2.graphs`). Confirm it reports no
new cycles involving `website-db.ts`, `website-db-core.ts` (Stage 1), `website-db-ops.ts`,
`website-db-admin-ops.ts`, `website-db-content-store.ts`, or `billing-db.ts`. If a cycle is
reported, it most likely means the `BugTicketRow` import in Task 1.2 was accidentally routed
through `./website-db` instead of `./website-db-core` — fix the import path, not the graph.

## Task 1.6 — Conditional: shrink check + remove the `s1.ignore` entry for `website-db.ts`

**This task is best-effort / conditional, not a hard requirement — only do the `gates.yaml` edit if
the line-count check below actually passes.**

```bash
wc -l website/src/lib/website-db.ts
```

If the result is **≤ 600**: remove the `website-db.ts` entry (and its three-line explanatory
comment) from `docs/code-quality/gates.yaml` → `s1.ignore`. Today that's the block at lines 69–72
(`# website-db.ts was split as part of G-SIZE03 ... - "website/src/lib/website-db.ts"`) — search for
the exact string `website/src/lib/website-db.ts` in `docs/code-quality/gates.yaml` before editing,
since other entries in the same `ignore:` list may have shifted the line number by the time this
runs (Stage 1's own edits, plus whatever else lands on `main` between now and execution).

If the result is **> 600**: skip the `gates.yaml` edit entirely, leave the existing ignore entry
and its comment as-is, and note the actual post-split line count in this task's completion note for
whoever picks up the next follow-up split.

## Task 1.7 — Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:changed` covers the Vitest suites touched in Task 1.4 plus `task quality:check`
(S1–S4, including the S2 cycle check already run standalone in Task 1.5 — running it again here is
the CI-equivalent confirmation, not redundant busywork, since `freshness:check` re-derives the
baseline-key-count assertion against `main` in the same pass). `freshness:regenerate` /
`freshness:check` re-derive `website/src/data/test-inventory.json` and the repo-index; commit any
diff they produce. No new `@test` BATS entries are added by this partial (the Vitest suites already
provide RED→GREEN coverage per Task 1.4), so `test:inventory` is only relevant if p2 adds BATS
coverage — re-run it then if p2's tests warrant it.
