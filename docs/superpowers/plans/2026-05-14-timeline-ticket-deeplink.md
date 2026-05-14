---
ticket_id: T000373
---

# Timeline Ticket Deep-Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the plan ticket (T-######) on each Kore timeline row so editors can click through to `/admin/tickets/T000xxx` directly from the homepage timeline.

**Architecture:** Three-layer change: (1) `parsePr()` extracts T-###### references from PR bodies; (2) `writeRowToDb()` writes `tickets.ticket_links` rows with `kind='implements'`; (3) `listTimeline()` batch-fetches those links and returns `ticket_external_id`; (4) `Timeline.svelte` renders a clickable badge. No schema migrations needed — `tickets.ticket_links` already has all required columns.

**Tech Stack:** Node.js ESM (`scripts/`), TypeScript/Astro (`website/src/`), Svelte 5, PostgreSQL

---

## File Map

| File | Change |
|------|--------|
| `scripts/track-pr.mjs` | Add `TICKET_RE`, extend `parsePr()` return, add ticket link writes to `writeRowToDb()` |
| `scripts/track-pr.test.mjs` | New tests for T-ref parsing |
| `website/src/lib/website-db.ts` | Add `ticket_external_id` to `TimelineRow`, extend `listTimeline()` |
| `website/src/components/Timeline.svelte` | Add `ticket_external_id` to Row type, render badge |

---

### Task 1: Extend `parsePr()` to extract T-###### references

**Files:**
- Modify: `scripts/track-pr.mjs` (add regex constant + extend return)
- Modify: `scripts/track-pr.test.mjs` (new tests)

- [ ] **Step 1: Write the failing tests**

Add to the end of `scripts/track-pr.test.mjs`:

```js
test('extracts T-###### ticket references from body', () => {
  const r = parsePr({
    number: 751,
    title: 'feat(tracking): timeline ticket deeplink',
    body: 'Implements T000373\n\nAlso related to T000001.',
    mergedAt: '2026-05-14T18:00:00Z',
  });
  assert.deepEqual(r.ticket_refs, ['T000373', 'T000001']);
});

test('returns empty ticket_refs when body has none', () => {
  const r = parsePr({
    number: 752,
    title: 'chore: bump deps',
    body: 'Updated package.json.',
    mergedAt: '2026-05-14T18:01:00Z',
  });
  assert.deepEqual(r.ticket_refs, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test scripts/track-pr.test.mjs 2>&1 | tail -10
```

Expected: FAIL — `r.ticket_refs` is undefined.

- [ ] **Step 3: Add `TICKET_RE` constant to `scripts/track-pr.mjs`**

After line 3 (`const REQ_RE = /\b(FA|SA|NFA|AK|L)-\d+\b/i;`), add:

```js
const TICKET_RE = /\bT\d{6}\b/g;
```

- [ ] **Step 4: Extract ticket_refs in `parsePr()`**

After `const reqMatch = REQ_RE.exec(body);` (around line 22), add:

```js
  const ticket_refs = Array.from(new Set((body.match(TICKET_RE) || [])));
```

- [ ] **Step 5: Include `ticket_refs` in the `parsePr()` return object**

The full return becomes:

```js
  return {
    pr_number: pr.number,
    title,
    description: body.length > 0 ? body.slice(0, 4000) : null,
    category,
    scope,
    brand,
    requirement_id,
    merged_at: pr.mergedAt,
    merged_by: pr.mergedBy?.login || null,
    bug_refs,
    ticket_refs,
  };
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
node --test scripts/track-pr.test.mjs 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/track-pr.mjs scripts/track-pr.test.mjs
git commit -m "feat(tracking): parsePr() extracts T-###### ticket_refs from PR body [T000373]"
```

---

### Task 2: Write `ticket_links` rows for T-refs in `writeRowToDb()`

**Files:**
- Modify: `scripts/track-pr.mjs` (`writeRowToDb()` function body)

- [ ] **Step 1: Add ticket_refs block after the `requirement_id` block**

In `writeRowToDb()`, after the `if (row.requirement_id) { ... }` block (ends around line 79), insert:

```js
  // 3. T-###### ticket references → ticket_links (kind='implements')
  for (const extId of (row.ticket_refs ?? [])) {
    const t = await pgClient.query(
      `SELECT id FROM tickets.tickets WHERE external_id = $1`,
      [extId]);
    if (t.rowCount > 0) {
      await pgClient.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number)
         VALUES ($1, $1, 'implements', $2)
         ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
        [t.rows[0].id, row.pr_number]);
    } else {
      console.log(`skip ticket link ${extId}: ticket not found`);
    }
  }
```

- [ ] **Step 2: Verify syntax**

```bash
node --check scripts/track-pr.mjs && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Run all track-pr tests**

```bash
node --test scripts/track-pr.test.mjs 2>&1 | tail -10
```

Expected: all pass (the DB write path is integration-only, covered by live verification in Task 5).

- [ ] **Step 4: Commit**

```bash
git add scripts/track-pr.mjs
git commit -m "feat(tracking): writeRowToDb() writes implements link for T-###### refs [T000373]"
```

---

### Task 3: Expose `ticket_external_id` in `listTimeline()`

**Files:**
- Modify: `website/src/lib/website-db.ts` (lines 36–98)

- [ ] **Step 1: Add `ticket_external_id` to `TimelineRow` type**

Replace the `TimelineRow` type definition (lines 36–48):

```ts
export type TimelineRow = {
  id: number;
  day: string;
  pr_number: number | null;
  title: string;
  description: string | null;
  category: string;
  scope: string | null;
  brand: string | null;
  requirement_id: string | null;
  requirement_name: string | null;
  bugs_fixed: number;
  ticket_external_id: string | null;
};
```

- [ ] **Step 2: Batch-fetch implements links in `listTimeline()`**

Replace the section from `const prNumbers = rows.map(...)` to the final `return rows.map(...)` (lines 85–98) with:

```ts
  const prNumbers = rows.map(r => r.pr_number).filter((n): n is number => n != null);
  const bugCounts = new Map<number, number>();
  const ticketIds = new Map<number, string>();

  if (prNumbers.length > 0) {
    const [counts, links] = await Promise.all([
      pool.query<{ pr: number; n: number }>(
        `SELECT pr_number AS pr, COUNT(*)::int AS n
           FROM tickets.ticket_links
          WHERE kind = 'fixes' AND pr_number = ANY($1::int[])
          GROUP BY pr_number`,
        [prNumbers],
      ),
      pool.query<{ pr: number; external_id: string }>(
        `SELECT tl.pr_number AS pr, t.external_id
           FROM tickets.ticket_links tl
           JOIN tickets.tickets t ON t.id = tl.from_id
          WHERE tl.kind = 'implements' AND tl.pr_number = ANY($1::int[])`,
        [prNumbers],
      ),
    ]);
    for (const c of counts.rows) bugCounts.set(c.pr, c.n);
    for (const l of links.rows) ticketIds.set(l.pr, l.external_id);
  }

  return rows.map(r => ({
    ...r,
    bugs_fixed: r.pr_number ? (bugCounts.get(r.pr_number) ?? 0) : 0,
    ticket_external_id: r.pr_number ? (ticketIds.get(r.pr_number) ?? null) : null,
  }));
```

- [ ] **Step 3: TypeScript compile check**

```bash
cd website
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors. If errors about `TimelineRow` elsewhere (missing `ticket_external_id`), add `ticket_external_id: null` to any literal `TimelineRow` objects in those files.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(timeline): expose ticket_external_id via implements link JOIN [T000373]"
```

---

### Task 4: Render ticket badge in `Timeline.svelte`

**Files:**
- Modify: `website/src/components/Timeline.svelte`

- [ ] **Step 1: Add `ticket_external_id` to the local Row type**

Replace the `type Row` block (lines 6–11):

```ts
  type Row = {
    id: number; day: string; pr_number: number | null;
    title: string; description: string | null;
    category: string; scope: string | null; brand: string | null;
    requirement_id: string | null; bugs_fixed: number;
    ticket_external_id: string | null;
  };
```

- [ ] **Step 2: Add ticket badge to the meta section**

Replace the `<span class="meta">` block (lines 56–59):

```svelte
      <span class="meta">
        {#if r.pr_number}<span class="pr">PR #{r.pr_number}</span>{/if}
        {#if r.bugs_fixed > 0}<span class="bug">+{r.bugs_fixed} fix</span>{/if}
        {#if r.ticket_external_id}
          <a class="ticket" href="/admin/tickets/{r.ticket_external_id}">{r.ticket_external_id}</a>
        {/if}
      </span>
```

- [ ] **Step 3: Add `.ticket` CSS rule**

After `.meta .bug { color: var(--sage, #5bd4d0); }` (around line 148), add:

```css
  .meta .ticket {
    color: var(--mute);
    text-decoration: none;
    border-bottom: 1px dotted var(--mute);
    transition: color 150ms ease, border-color 150ms ease;
  }
  .meta .ticket:hover {
    color: var(--brass);
    border-color: var(--brass);
  }
```

- [ ] **Step 4: TypeScript check**

```bash
cd website
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/Timeline.svelte
git commit -m "feat(timeline): render T-###### ticket badge with deep-link in timeline row [T000373]"
```

---

### Task 5: Backfill + live verification

- [ ] **Step 1: Check for PRs with T-refs in their existing descriptions**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "SELECT pr_number, title FROM tickets.pr_events
   WHERE description ~ 'T[0-9]{6}' ORDER BY pr_number DESC LIMIT 10;"
```

If no rows: skip to Step 4. If rows found: continue.

- [ ] **Step 2: Backfill (if rows found in Step 1)**

```bash
task tracking:backfill && task tracking:ingest:local
```

Requires `TRACKING_DB_URL` from `task workspace:port-forward ENV=mentolder` in a separate terminal.

- [ ] **Step 3: Verify implements links were created**

```bash
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "SELECT tl.pr_number, t.external_id, tl.kind
   FROM tickets.ticket_links tl
   JOIN tickets.tickets t ON t.id = tl.from_id
   WHERE tl.kind = 'implements' ORDER BY tl.pr_number DESC LIMIT 10;"
```

Expected: rows showing `implements` links.

- [ ] **Step 4: Run offline tests**

```bash
cd /home/patrick/Bachelorprojekt
task test:all 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 5: Create PR via commit-commands:commit-push-pr**

Invoke skill `commit-commands:commit-push-pr`.

Title: `feat(timeline): surface T-###### plan ticket as deep-link on Kore timeline [T000373]`

Body:
```
## Summary
- `parsePr()` now extracts T-###### ticket references from PR bodies
- `writeRowToDb()` writes `tickets.ticket_links` rows with `kind='implements'`
- `listTimeline()` batch-fetches implements links and exposes `ticket_external_id`
- `Timeline.svelte` renders a dotted-underline badge linking to `/admin/tickets/T######`

## Test plan
- [x] `node --test scripts/track-pr.test.mjs` passes (2 new T-ref tests)
- [x] `task test:all` green
- [x] `npx tsc --noEmit` 0 errors
- [ ] After merge: verify a future PR with T-###### in body shows badge on Kore homepage after CronJob runs
```
