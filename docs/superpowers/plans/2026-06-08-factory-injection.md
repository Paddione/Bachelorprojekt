---
title: Factory Injection (Notizen/Kontext + Assets) Implementation Plan
ticket_id: T000524
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Factory Injection (Notizen/Kontext + Assets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the write/feed-back side to the read-only `/dev-status` Fabrikhalle: an admin observer leaves notes/context and assets on a running ticket that flow into the running *or* next pipeline at the next phase boundary — no mid-run interrupt.

**Architecture:** A new idempotent table `tickets.ticket_injections` (open = `consumed_at IS NULL`) is written via a UI form (`POST /api/factory-floor/[extId]/inject`, admin-gated) and a CLI (`ticket.sh inject`). `pipeline.js` gains a best-effort `consumeInjections(phase)` helper called right after every `phaseEvent(phase,'entered')`: it atomically consumes (`UPDATE…SET consumed_at=now()…RETURNING`) the unconsumed injections for that phase (or NULL-phase = next boundary), folds `context`/`note` into a binding prompt block, and materializes `asset` rows to `${WORK_WT}/assets-inbox/<ticket-id>/<filename>` (gitignored). The detail panel reads the injections via an extended `getTicketDetail` and renders an inject form + an injection-status list.

**Tech Stack:** Postgres (`tickets` schema), TypeScript DAL (`pg`/pg-mem), Astro 6 API route, Svelte 5 component, Bash CLI (`scripts/ticket.sh`), Node Workflow script (`scripts/factory/pipeline.js`), Vitest + pg-mem, BATS (FA-SF-49), Playwright.

**Footguns (verified this session):**
- **FA-SF number:** next free is **FA-SF-49** (40..48 are taken; FA-SF-48 = T000518). All new BATS test descriptions use `FA-SF-49`.
- **Freshness gate:** new test files + new route → the final task runs `task freshness:regenerate` and commits `website/src/data/test-inventory.json`, `website/src/data/route-manifest.json`, and `docs/code-quality/repo-index.json` (whatever changed) so CI's `freshness:check` stays green.
- **S1 line-ratchet:** `scripts/factory/pipeline.js` (~582 lines) and `scripts/ticket.sh` (~600 lines) are under a line-limit gate. Keep new helpers terse (one-liner SQL where the existing code does). If `task test:all`/`quality:check` fails at the ratchet, condense without losing behavior.
- **Anchor to strings, not line numbers** — line numbers drift. The Edit anchors below quote exact existing strings.
- `consumeInjections` is best-effort like `phaseEvent`: wrapped in `try/catch`, **never throws**.

---

## File Structure

**New files:**
- `website/src/pages/api/factory-floor/[extId]/inject.ts` — admin-gated `POST` insert endpoint.
- `tests/local/FA-SF-49-injection-cli.bats` — offline arg-validation for `ticket.sh inject` / `get-injections`.

**Modified files:**
- `website/src/lib/tickets-db.ts` — add `tickets.ticket_injections` table + indexes in `initTicketsSchema()` (idempotent, next to `factory_phase_events`).
- `website/src/lib/factory-floor.ts` — add `InjectionRow`/types, `getInjections()`, `insertInjection()`, extend `getTicketDetail` with `injections`.
- `website/src/lib/factory-floor.test.ts` — pg-mem: add `ticket_injections` table to the schema and tests for DAL/consume/targeting/detail.
- `website/src/pages/api/factory-floor/[extId].ts` — *no change needed* (kept as reference for the new route's gate pattern).
- `website/src/components/FactoryFloor.svelte` — inject form + injection-status list in the detail panel; extend `TicketDetail` interface.
- `scripts/ticket.sh` — `cmd_inject` + `cmd_get_injections`; dispatch + usage.
- `scripts/factory/pipeline.js` — `consumeInjections(phase)` helper + a call after each `phaseEvent(<phase>,'entered')`.
- `.gitignore` — add `assets-inbox/`.
- generated artifacts (final task): `test-inventory.json`, `route-manifest.json`, `repo-index.json`.

---

## Task 1: Schema — `tickets.ticket_injections`

**Files:**
- Modify: `website/src/lib/tickets-db.ts` (in `initTicketsSchema()`, right after the `factory_phase_events` block — anchor string below)

- [ ] **Step 1: Add the table + indexes (idempotent)**

In `website/src/lib/tickets-db.ts`, find the existing line ending the phase-events block:

```ts
  await pool.query(`CREATE INDEX IF NOT EXISTS factory_phase_events_ticket_at_idx ON tickets.factory_phase_events (ticket_id, at DESC)`);
```

Insert immediately AFTER it:

```ts
  // Factory Injection (factory-injection): operator notes/context/assets fed back into a
  // running or next pipeline at the next phase boundary. consumed_at NULL = still open.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_injections (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id    UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      phase        TEXT CHECK (phase IN ('scout','design','plan','implement','verify','deploy')),
      kind         TEXT NOT NULL CHECK (kind IN ('context','note','asset')),
      title        TEXT,
      content      TEXT,
      target_files TEXT[],
      data_url     TEXT,
      nc_path      TEXT,
      filename     TEXT,
      mime_type    TEXT,
      injected_by  TEXT NOT NULL DEFAULT 'admin',
      injected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      consumed_at  TIMESTAMPTZ,
      CHECK (kind <> 'asset' OR data_url IS NOT NULL OR nc_path IS NOT NULL)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_injections_ticket_phase_idx ON tickets.ticket_injections (ticket_id, phase)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_injections_open_idx ON tickets.ticket_injections (ticket_id) WHERE consumed_at IS NULL`);
```

- [ ] **Step 2: Typecheck**

Run: `cd website && npx tsc --noEmit`
Expected: PASS (no new type errors from this file).

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/tickets-db.ts
git commit -m "feat(factory-injection): add tickets.ticket_injections schema [factory-injection]"
```

---

## Task 2: DAL — insert + list + consume-free reads, extend `getTicketDetail`

**Files:**
- Modify: `website/src/lib/factory-floor.ts`
- Test: `website/src/lib/factory-floor.test.ts`

- [ ] **Step 1: Add the pg-mem table to the test fixture**

In `website/src/lib/factory-floor.test.ts`, inside the `mem.public.none(\`…\`)` schema block, find:

```ts
    CREATE TABLE tickets.ticket_comments (id serial, ticket_id text, author_label text, kind text, body text, visibility text, created_at timestamptz);
```

Add immediately after it (pg-mem ignores `[]`/UUID specifics, so use simple types):

```ts
    CREATE TABLE tickets.ticket_injections (
      id text, ticket_id text, phase text, kind text, title text, content text,
      target_files text[], data_url text, nc_path text, filename text, mime_type text,
      injected_by text, injected_at timestamptz, consumed_at timestamptz);
```

- [ ] **Step 2: Write the failing DAL tests**

In `website/src/lib/factory-floor.test.ts`, change the existing import line:

```ts
import { getHall, getLoadingDock, getShipped, getMetrics, getControl } from './factory-floor';
```

to:

```ts
import { getHall, getLoadingDock, getShipped, getMetrics, getControl,
         insertInjection, getInjections, consumeInjections, getTicketDetail } from './factory-floor';
```

Then add a new describe block at the end of the file (before the final closing brace of the outermost `describe`, or as a sibling `describe` at top level — make it a top-level sibling):

```ts
describe('factory-floor injection DAL', () => {
  it('insertInjection + getInjections round-trips and exposes open status', async () => {
    await insertInjection({
      extId: 'T000459', kind: 'context', phase: 'implement',
      title: 'use the new util', content: 'prefer lib/foo over inline', injectedBy: 'admin',
    });
    const rows = await getInjections('T000459');
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe('context');
    expect(rows[0].phase).toBe('implement');
    expect(rows[0].consumedAt).toBeNull();
  });

  it('consumeInjections is atomic: a second consume returns empty', async () => {
    await insertInjection({ extId: 'T000459', kind: 'note', content: 'first', injectedBy: 'admin' });
    const first = await consumeInjections('T000459', 'implement');
    const got = first.filter((r) => r.content === 'first');
    expect(got.length).toBe(1);
    const second = await consumeInjections('T000459', 'implement');
    expect(second.filter((r) => r.content === 'first').length).toBe(0);
  });

  it('phase targeting: a verify-phase injection is NOT consumed at implement, NULL-phase always is', async () => {
    await insertInjection({ extId: 'T000460', kind: 'note', phase: 'verify', content: 'verify-only', injectedBy: 'admin' });
    await insertInjection({ extId: 'T000460', kind: 'note', content: 'any-boundary', injectedBy: 'admin' });
    const atImplement = await consumeInjections('T000460', 'implement');
    const bodies = atImplement.map((r) => r.content);
    expect(bodies).toContain('any-boundary');
    expect(bodies).not.toContain('verify-only');
    const atVerify = await consumeInjections('T000460', 'verify');
    expect(atVerify.map((r) => r.content)).toContain('verify-only');
  });

  it('getTicketDetail returns injections (open + consumed)', async () => {
    await insertInjection({ extId: 'T000459', kind: 'context', content: 'detail-test', injectedBy: 'admin' });
    const d = await getTicketDetail('T000459');
    expect(d).not.toBeNull();
    expect(Array.isArray(d!.injections)).toBe(true);
    expect(d!.injections.some((i) => i.content === 'detail-test')).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `cd website && npx vitest run src/lib/factory-floor.test.ts`
Expected: FAIL — `insertInjection`/`getInjections`/`consumeInjections` not exported; `injections` missing on `TicketDetail`.

- [ ] **Step 4: Implement the DAL**

In `website/src/lib/factory-floor.ts`, add the types + functions. First add interfaces near the existing `TicketDetail` interface (after the `Breadcrumb` interface, before `TicketDetail`):

```ts
export type InjectionKind = 'context' | 'note' | 'asset';
export interface InjectionRow {
  id: string; phase: Phase | null; kind: InjectionKind;
  title: string | null; content: string | null; targetFiles: string[] | null;
  dataUrl: string | null; ncPath: string | null; filename: string | null; mimeType: string | null;
  injectedBy: string; injectedAt: string; consumedAt: string | null;
}
export interface InjectInput {
  extId: string; kind: InjectionKind; phase?: Phase | null;
  title?: string | null; content?: string | null; targetFiles?: string[] | null;
  dataUrl?: string | null; ncPath?: string | null; filename?: string | null; mimeType?: string | null;
  injectedBy: string;
}
```

Add `injections: InjectionRow[];` to the `TicketDetail` interface:

```ts
export interface TicketDetail {
  extId: string; title: string; status: string; priority: string;
  retryCount: number; prNumber: number | null;
  events: PhaseEventRow[];
  breadcrumbs: Breadcrumb[];
  injections: InjectionRow[];
}
```

Add a shared row-mapper + the three functions at the END of the file:

```ts
function mapInjection(r: any): InjectionRow {
  return {
    id: String(r.id), phase: r.phase ?? null, kind: r.kind,
    title: r.title ?? null, content: r.content ?? null,
    targetFiles: r.target_files ?? null,
    dataUrl: r.data_url ?? null, ncPath: r.nc_path ?? null,
    filename: r.filename ?? null, mimeType: r.mime_type ?? null,
    injectedBy: r.injected_by, injectedAt: new Date(r.injected_at).toISOString(),
    consumedAt: r.consumed_at ? new Date(r.consumed_at).toISOString() : null,
  };
}

/** Insert an injection by ticket external_id; no-op (returns null) if the ticket is unknown. */
export async function insertInjection(inp: InjectInput): Promise<InjectionRow | null> {
  const t = await pool.query(`SELECT id FROM tickets.tickets WHERE external_id = $1`, [inp.extId]);
  if (!t.rows.length) return null;
  const r = await pool.query(
    `INSERT INTO tickets.ticket_injections
       (ticket_id, phase, kind, title, content, target_files, data_url, nc_path, filename, mime_type, injected_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, phase, kind, title, content, target_files, data_url, nc_path, filename, mime_type, injected_by, injected_at, consumed_at`,
    [t.rows[0].id, inp.phase ?? null, inp.kind, inp.title ?? null, inp.content ?? null,
     inp.targetFiles ?? null, inp.dataUrl ?? null, inp.ncPath ?? null, inp.filename ?? null,
     inp.mimeType ?? null, inp.injectedBy],
  );
  return mapInjection(r.rows[0]);
}

/** Read-only list of injections (open + recently consumed) for the detail panel. */
export async function getInjections(extId: string, limit = 20): Promise<InjectionRow[]> {
  const r = await pool.query(
    `SELECT i.id, i.phase, i.kind, i.title, i.content, i.target_files, i.data_url, i.nc_path,
            i.filename, i.mime_type, i.injected_by, i.injected_at, i.consumed_at
       FROM tickets.ticket_injections i
       JOIN tickets.tickets t ON t.id = i.ticket_id
      WHERE t.external_id = $1
      ORDER BY (i.consumed_at IS NULL) DESC, i.injected_at DESC
      LIMIT $2::int`,
    [extId, limit],
  );
  return r.rows.map(mapInjection);
}

/** Atomically consume open injections for a phase (or NULL-phase = any boundary). */
export async function consumeInjections(extId: string, phase: Phase): Promise<InjectionRow[]> {
  const r = await pool.query(
    `UPDATE tickets.ticket_injections SET consumed_at = now()
      WHERE consumed_at IS NULL
        AND (phase = $2 OR phase IS NULL)
        AND ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = $1)
      RETURNING id, phase, kind, title, content, target_files, data_url, nc_path, filename, mime_type, injected_by, injected_at, consumed_at`,
    [extId, phase],
  );
  return r.rows.map(mapInjection);
}
```

> Note: `consumeInjections` here is the DAL primitive used by tests and the API; the **pipeline's** consume goes through the CLI (`ticket.sh get-injections --consume`), not this TS function, because pipeline.js runs outside the website process.

- [ ] **Step 5: Wire injections into `getTicketDetail`**

In `getTicketDetail`, add a fourth parallel query. Change:

```ts
  const [events, breadcrumbs, pr] = await Promise.all([
```

to:

```ts
  const [events, breadcrumbs, pr, injections] = await Promise.all([
```

and add a fourth element to the array (after the `pr` query):

```ts
    pool.query(
      `SELECT id, phase, kind, title, content, target_files, data_url, nc_path,
              filename, mime_type, injected_by, injected_at, consumed_at
         FROM tickets.ticket_injections
        WHERE ticket_id = $1
        ORDER BY (consumed_at IS NULL) DESC, injected_at DESC LIMIT 20`,
      [row.id],
    ),
```

In the returned object, add after `breadcrumbs: …,`:

```ts
    injections: injections.rows.map(mapInjection),
```

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `cd website && npx vitest run src/lib/factory-floor.test.ts`
Expected: PASS (all existing + 4 new).

- [ ] **Step 7: Typecheck**

Run: `cd website && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add website/src/lib/factory-floor.ts website/src/lib/factory-floor.test.ts
git commit -m "feat(factory-injection): injection DAL + getTicketDetail.injections [factory-injection]"
```

---

## Task 3: Write API — `POST /api/factory-floor/[extId]/inject`

**Files:**
- Create: `website/src/pages/api/factory-floor/[extId]/inject.ts`
- Test: `website/src/pages/api/factory-floor/inject.test.ts`

> Mirrors the gate pattern of `website/src/pages/api/factory-floor/[extId].ts` (`getSession`+`isAdmin`, 401 on no session) and the POST/JSON-parse pattern of `website/src/pages/api/admin/tickets/[id].ts`.

- [ ] **Step 1: Write the failing API gate test**

Create `website/src/pages/api/factory-floor/inject.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async (cookie: string | null) => (cookie === 'admin' ? { preferred_username: 'admin', groups: ['admins'] } : null)),
  isAdmin: vi.fn((s: any) => s?.groups?.includes('admins') ?? false),
}));
const insertInjection = vi.fn(async () => ({ id: 'x' }));
vi.mock('../../../../lib/factory-floor', () => ({ insertInjection: (...a: any[]) => insertInjection(...a) }));

import { POST } from './[extId]/inject';

function req(cookie: string | null, body: unknown): Request {
  return new Request('http://x/api/factory-floor/T000459/inject', {
    method: 'POST',
    headers: cookie ? { cookie, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/factory-floor/[extId]/inject', () => {
  it('401 without an admin session', async () => {
    const res = await POST({ request: req(null, { kind: 'note', content: 'x' }), params: { extId: 'T000459' } } as any);
    expect(res.status).toBe(401);
  });

  it('400 on missing kind', async () => {
    const res = await POST({ request: req('admin', { content: 'x' }), params: { extId: 'T000459' } } as any);
    expect(res.status).toBe(400);
  });

  it('201 inserts a context injection for an admin', async () => {
    insertInjection.mockResolvedValueOnce({ id: 'abc' } as any);
    const res = await POST({ request: req('admin', { kind: 'context', content: 'hi', phase: 'implement' }), params: { extId: 'T000459' } } as any);
    expect(res.status).toBe(201);
    expect(insertInjection).toHaveBeenCalled();
  });

  it('413 when content exceeds the cap', async () => {
    const res = await POST({ request: req('admin', { kind: 'note', content: 'a'.repeat(9000) }), params: { extId: 'T000459' } } as any);
    expect(res.status).toBe(413);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd website && npx vitest run src/pages/api/factory-floor/inject.test.ts`
Expected: FAIL — module `./[extId]/inject` not found.

- [ ] **Step 3: Implement the endpoint**

Create `website/src/pages/api/factory-floor/[extId]/inject.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { insertInjection, type InjectionKind } from '../../../../lib/factory-floor';

export const prerender = false;

const KINDS = new Set<InjectionKind>(['context', 'note', 'asset']);
const PHASES = new Set(['scout', 'design', 'plan', 'implement', 'verify', 'deploy']);
const CONTENT_CAP = 8 * 1024;          // ~8 KB text
const DATAURL_CAP = 14 * 1024 * 1024;  // ~10 MB binary base64-expanded

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  const extId = params.extId ?? '';
  if (!extId) return json({ error: 'extId missing' }, 400);

  let body: Record<string, any>;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid JSON' }, 400); }

  const kind = body.kind;
  if (!KINDS.has(kind)) return json({ error: 'kind must be context|note|asset' }, 400);
  if (body.phase != null && !PHASES.has(body.phase)) return json({ error: 'invalid phase' }, 400);

  const content = typeof body.content === 'string' ? body.content : null;
  if (content && content.length > CONTENT_CAP) return json({ error: 'content too large' }, 413);

  const file = body.file as { filename?: string; mimeType?: string; dataUrl?: string } | undefined;
  if (kind === 'asset') {
    if (!file?.dataUrl && !body.ncPath) return json({ error: 'asset requires file.dataUrl or ncPath' }, 400);
    if (file?.dataUrl && !/^data:[\w.+-]+\/[\w.+-]+;base64,/.test(file.dataUrl)) return json({ error: 'invalid data URL' }, 400);
    if (file?.dataUrl && file.dataUrl.length > DATAURL_CAP) return json({ error: 'asset too large' }, 413);
  }

  const targetFiles = Array.isArray(body.targetFiles)
    ? body.targetFiles.filter((s: unknown) => typeof s === 'string').slice(0, 50)
    : null;

  try {
    const created = await insertInjection({
      extId, kind, phase: body.phase ?? null,
      title: typeof body.title === 'string' ? body.title.slice(0, 200) : null,
      content, targetFiles,
      dataUrl: file?.dataUrl ?? null, ncPath: body.ncPath ?? null,
      filename: file?.filename ?? null, mimeType: file?.mimeType ?? null,
      injectedBy: (session as any).preferred_username ?? 'admin',
    });
    if (!created) return json({ error: 'ticket not found' }, 404);
    return json({ ok: true, id: created.id }, 201);
  } catch (err) {
    console.error('[api/factory-floor/[extId]/inject]', err);
    return json({ error: 'insert_failed' }, 500);
  }
};
```

- [ ] **Step 4: Run to confirm it passes**

Run: `cd website && npx vitest run src/pages/api/factory-floor/inject.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `cd website && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/api/factory-floor/[extId]/inject.ts website/src/pages/api/factory-floor/inject.test.ts
git commit -m "feat(factory-injection): admin-gated POST /api/factory-floor/[extId]/inject [factory-injection]"
```

---

## Task 4: Detail-Panel UI — inject form + injection list

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte`

> No new unit test here (Svelte render is covered by the Playwright smoke in Task 7). Keep the form simple; the data-testids are what the Playwright test asserts.

- [ ] **Step 1: Extend the `TicketDetail` interface in the component**

In `website/src/components/FactoryFloor.svelte`, find:

```ts
  interface TicketDetail { extId: string; title: string; status: string; priority: string; retryCount: number; prNumber: number | null; events: PhaseEventRow[]; breadcrumbs: Breadcrumb[]; }
```

Replace with (add `InjectionRow` + `injections`):

```ts
  interface InjectionRow { id: string; phase: string | null; kind: 'context'|'note'|'asset'; title: string | null; content: string | null; filename: string | null; injectedBy: string; injectedAt: string; consumedAt: string | null; }
  interface TicketDetail { extId: string; title: string; status: string; priority: string; retryCount: number; prNumber: number | null; events: PhaseEventRow[]; breadcrumbs: Breadcrumb[]; injections: InjectionRow[]; }
```

- [ ] **Step 2: Add form state + submit handler**

In the `<script>` block, find the existing `function closeDetail() { selected = null; detail = null; }` line and add after it:

```ts
  let injKind = $state<'context'|'note'|'asset'>('context');
  let injPhase = $state<string>('');
  let injTitle = $state('');
  let injContent = $state('');
  let injBusy = $state(false);
  let injError = $state<string | null>(null);

  async function submitInjection() {
    if (!selected) return;
    injBusy = true; injError = null;
    const payload: Record<string, unknown> = { kind: injKind, title: injTitle || undefined, content: injContent || undefined };
    if (injPhase) payload.phase = injPhase;
    try {
      const res = await fetch(`/api/factory-floor/${encodeURIComponent(selected)}/inject`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) { injError = `Fehler (${res.status})`; return; }
      injTitle = ''; injContent = '';
      await openDetail(selected); // refresh injections list
    } catch { injError = 'Netzwerkfehler'; }
    finally { injBusy = false; }
  }
```

- [ ] **Step 3: Render the form + list in the panel**

In the detail panel, find the closing of the breadcrumbs block:

```svelte
          {#if detail.breadcrumbs.length}
            <h4 class="font-semibold mt-3 mb-1">Breadcrumbs</h4>
            <ul class="space-y-1 text-sm">
              {#each detail.breadcrumbs as b}
                <li class="rounded bg-white/5 px-2 py-1"><span class="text-muted text-xs">{b.authorLabel}:</span> {b.body}</li>
              {/each}
            </ul>
          {/if}
```

Insert AFTER that `{/if}` (still inside the `{:else}` of `{#if !detail}`):

```svelte
          <h4 class="font-semibold mt-4 mb-1">Injektionen</h4>
          {#if detail.injections.length}
            <ul class="space-y-1 text-sm mb-3" data-testid="inject-list">
              {#each detail.injections as inj (inj.id)}
                <li class="rounded bg-white/5 px-2 py-1">
                  <span class="font-mono text-xs">{inj.kind}{inj.phase ? `@${inj.phase}` : ''}</span>
                  {#if inj.title}<span class="font-semibold"> {inj.title}</span>{/if}
                  <span class="block text-xs">{inj.consumedAt ? `✓ konsumiert ${new Date(inj.consumedAt).toLocaleString('de-DE')}` : '⏳ offen'}</span>
                  {#if inj.content}<span class="block text-muted text-xs">{inj.content}</span>{/if}
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-muted text-sm mb-3">Keine Injektionen.</p>
          {/if}

          <details class="mt-2" data-testid="inject-form">
            <summary class="cursor-pointer font-semibold text-sm">Injizieren</summary>
            <div class="mt-2 space-y-2">
              <select bind:value={injKind} class="w-full rounded bg-white/10 px-2 py-1 text-sm" data-testid="inject-kind">
                <option value="context">context</option>
                <option value="note">note</option>
                <option value="asset">asset</option>
              </select>
              <select bind:value={injPhase} class="w-full rounded bg-white/10 px-2 py-1 text-sm" data-testid="inject-phase">
                <option value="">nächste Grenze (NULL)</option>
                <option value="scout">scout</option><option value="design">design</option>
                <option value="plan">plan</option><option value="implement">implement</option>
                <option value="verify">verify</option><option value="deploy">deploy</option>
              </select>
              <input bind:value={injTitle} placeholder="Titel (optional)" class="w-full rounded bg-white/10 px-2 py-1 text-sm" data-testid="inject-title" />
              <textarea bind:value={injContent} placeholder="Kontext / Notiz" rows="3" class="w-full rounded bg-white/10 px-2 py-1 text-sm" data-testid="inject-content"></textarea>
              {#if injError}<p class="text-red-400 text-xs">{injError}</p>{/if}
              <button onclick={submitInjection} disabled={injBusy} class="rounded bg-emerald-500/80 px-3 py-1 text-sm font-semibold disabled:opacity-50" data-testid="inject-submit">
                {injBusy ? 'sende…' : 'injizieren'}
              </button>
            </div>
          </details>
```

- [ ] **Step 4: Typecheck (Svelte)**

Run: `cd website && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: no new errors for `FactoryFloor.svelte`. (If `svelte-check` is unavailable, run `cd website && npx tsc --noEmit` — Svelte template typing is checked at build; at minimum the script-block types must compile.)

- [ ] **Step 5: Commit**

```bash
git add website/src/components/FactoryFloor.svelte
git commit -m "feat(factory-injection): inject form + injection list in detail panel [factory-injection]"
```

---

## Task 5: CLI — `ticket.sh inject` + `get-injections`

**Files:**
- Modify: `scripts/ticket.sh`
- Test: `tests/local/FA-SF-49-injection-cli.bats`

> Pattern: `cmd_phase` (positional/validate-before-`_pgpod`) + `cmd_add_comment` (`--id` insert) + `ticket-attach.sh` (base64/MIME/cap for `--file`). All arg-validation happens BEFORE `_pgpod` so FA-SF-49 is offline-safe.

- [ ] **Step 1: Write the failing BATS test**

Create `tests/local/FA-SF-49-injection-cli.bats`:

```bash
#!/usr/bin/env bats
# FA-SF-49: offline arg-validation for `ticket.sh inject` + `get-injections`. [factory-injection]
# All cases validate BEFORE _pgpod, so they are deterministic without a cluster (CI-safe).
setup() { load 'test_helper.bash'; }

@test "FA-SF-49: inject requires --id and --kind" {
  run bash scripts/ticket.sh inject --content "hi"
  [ "$status" -eq 2 ]
  [[ "$output" =~ "required" ]]
}
@test "FA-SF-49: inject rejects an invalid kind" {
  run bash scripts/ticket.sh inject --id T000001 --kind frobnicate
  [ "$status" -eq 2 ]
  [[ "$output" =~ "kind must be one of" ]]
}
@test "FA-SF-49: inject rejects an invalid phase" {
  run bash scripts/ticket.sh inject --id T000001 --kind note --phase sideways --content x
  [ "$status" -eq 2 ]
  [[ "$output" =~ "phase must be one of" ]]
}
@test "FA-SF-49: inject asset requires --file or --nc-path" {
  run bash scripts/ticket.sh inject --id T000001 --kind asset
  [ "$status" -eq 2 ]
  [[ "$output" =~ "asset requires" ]]
}
@test "FA-SF-49: inject --file rejects a missing file" {
  run bash scripts/ticket.sh inject --id T000001 --kind asset --file /no/such/file.png
  [ "$status" -eq 2 ]
  [[ "$output" =~ "not a file" ]]
}
@test "FA-SF-49: get-injections requires --id" {
  run bash scripts/ticket.sh get-injections
  [ "$status" -eq 2 ]
  [[ "$output" =~ "required" ]]
}
@test "FA-SF-49: get-injections rejects an invalid --phase" {
  run bash scripts/ticket.sh get-injections --id T000001 --phase nope
  [ "$status" -eq 2 ]
  [[ "$output" =~ "phase must be one of" ]]
}
@test "FA-SF-49: dispatch usage lists inject and get-injections" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "inject" ]]
  [[ "$output" =~ "get-injections" ]]
}
```

- [ ] **Step 2: Run to confirm it fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-49-injection-cli.bats`
Expected: FAIL — `Unknown command: inject`.

- [ ] **Step 3: Implement `cmd_inject` + `cmd_get_injections`**

In `scripts/ticket.sh`, add BEFORE the `if [[ $# -lt 1 ]]; then` dispatch block (anchor: the line `cmd_phase() {` … `}` precedes it; add after `cmd_phase`'s closing `}` / the `echo "phase recorded..."` line). Keep terse (S1 ratchet):

```bash
cmd_inject() {
  local id="" kind="" phase="" title="" content="" tfiles="" file="" nc_path="" by="admin"
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      --kind) kind="$2"; shift 2 ;;
      --phase) phase="$2"; shift 2 ;;
      --title) title="$2"; shift 2 ;;
      --content) content="$2"; shift 2 ;;
      --target-files) tfiles="$2"; shift 2 ;;
      --file) file="$2"; shift 2 ;;
      --nc-path) nc_path="$2"; shift 2 ;;
      --by) by="$2"; shift 2 ;;
      *) echo "Unknown inject option: $1" >&2; exit 2 ;;
    esac; done
  # Validate BEFORE _pgpod so bad-arg errors are deterministic w/o a cluster (FA-SF-49).
  [[ -z "$id" || -z "$kind" ]] && { echo "ERROR: --id and --kind are required." >&2; exit 2; }
  case "$kind" in context|note|asset) ;; *) echo "ERROR: kind must be one of context|note|asset." >&2; exit 2 ;; esac
  [[ -n "$phase" ]] && case "$phase" in scout|design|plan|implement|verify|deploy) ;; *) echo "ERROR: phase must be one of scout|design|plan|implement|verify|deploy." >&2; exit 2 ;; esac
  local data_url="" mime="" fname=""
  if [[ "$kind" == "asset" ]]; then
    [[ -z "$file" && -z "$nc_path" ]] && { echo "ERROR: asset requires --file or --nc-path." >&2; exit 2; }
    if [[ -n "$file" ]]; then
      [[ ! -f "$file" ]] && { echo "ERROR: not a file: $file" >&2; exit 2; }
      case "${file,,}" in
        *.md) mime="text/markdown" ;; *.html|*.htm) mime="text/html" ;; *.txt|*.log) mime="text/plain" ;;
        *.jpg|*.jpeg) mime="image/jpeg" ;; *.png) mime="image/png" ;; *.gif) mime="image/gif" ;; *.webp) mime="image/webp" ;;
        *.pdf) mime="application/pdf" ;; *.mp4) mime="video/mp4" ;; *.webm) mime="video/webm" ;;
        *) echo "ERROR: unsupported file extension: $file" >&2; exit 2 ;;
      esac
      local size; size=$(stat -c %s "$file" 2>/dev/null || stat -f %z "$file")
      (( size > 10*1024*1024 )) && { echo "ERROR: $file exceeds 10 MB inline cap; use --nc-path." >&2; exit 2; }
      fname=$(basename -- "$file")
      data_url="data:${mime};base64,$(base64 -w0 < "$file")"
    fi
  fi
  local pod; pod=$(_pgpod)
  local tfarr="NULL"
  [[ -n "$tfiles" ]] && tfarr="string_to_array(:'tfiles', ',')"
  _exec_sql "$pod" -v ext_id="$id" -v kind="$kind" -v phase="$phase" -v title="$title" \
    -v content="$content" -v tfiles="$tfiles" -v data_url="$data_url" -v nc_path="$nc_path" \
    -v fname="$fname" -v mime="$mime" -v by="$by" <<EOF >/dev/null
INSERT INTO tickets.ticket_injections
  (ticket_id, phase, kind, title, content, target_files, data_url, nc_path, filename, mime_type, injected_by)
SELECT id, NULLIF(:'phase',''), :'kind', NULLIF(:'title',''), NULLIF(:'content',''),
       ${tfarr}, NULLIF(:'data_url',''), NULLIF(:'nc_path',''), NULLIF(:'fname',''), NULLIF(:'mime',''), :'by'
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  echo "injection added to ticket $id (kind=$kind${phase:+ phase=$phase})"
}

cmd_get_injections() {
  local id="" phase="" consume="false" format="text"
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      --phase) phase="$2"; shift 2 ;;
      --consume) consume="true"; shift ;;
      --format) format="$2"; shift 2 ;;
      *) echo "Unknown get-injections option: $1" >&2; exit 2 ;;
    esac; done
  # Validate BEFORE _pgpod (FA-SF-49).
  [[ -z "$id" ]] && { echo "ERROR: --id is required." >&2; exit 2; }
  [[ -n "$phase" ]] && case "$phase" in scout|design|plan|implement|verify|deploy) ;; *) echo "ERROR: phase must be one of scout|design|plan|implement|verify|deploy." >&2; exit 2 ;; esac
  local pod; pod=$(_pgpod)
  local jsonsel
  jsonsel="json_agg(json_build_object('id',id,'kind',kind,'title',title,'content',content,'target_files',target_files,'data_url',data_url,'nc_path',nc_path,'filename',filename,'mime_type',mime_type,'phase',phase))"
  if [[ "$consume" == "true" ]]; then
    _exec_sql "$pod" -v ext_id="$id" -v phase="$phase" <<EOF
WITH consumed AS (
  UPDATE tickets.ticket_injections SET consumed_at = now()
   WHERE consumed_at IS NULL
     AND (phase = NULLIF(:'phase','') OR phase IS NULL)
     AND ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
  RETURNING id, kind, title, content, target_files, data_url, nc_path, filename, mime_type, phase)
SELECT COALESCE(${jsonsel}, '[]'::json) FROM consumed;
EOF
  else
    _exec_sql "$pod" -v ext_id="$id" -v phase="$phase" <<EOF
SELECT COALESCE(${jsonsel}, '[]'::json) FROM tickets.ticket_injections
 WHERE ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
   AND (:'phase' = '' OR phase = NULLIF(:'phase','') OR phase IS NULL);
EOF
  fi
}
```

> `--format` is accepted for forward-compat but the SELECT always emits JSON (the pipeline only ever consumes JSON); `text` is treated as JSON too. Keep it accepted so callers passing `--format json` don't error.

- [ ] **Step 4: Wire dispatch + usage**

In `scripts/ticket.sh`, find the usage-list line:

```bash
  echo "Commands: create, update-status, add-comment, archive-plan, get-attachments, get, set-touched-files, set-pipeline-slot, release-slot, touch, enqueue, retry-count, factory-control, dryrun-mark, dryrun-check, feature-flag, phase" >&2
```

Append `, inject, get-injections` before the closing quote:

```bash
  echo "Commands: create, update-status, add-comment, archive-plan, get-attachments, get, set-touched-files, set-pipeline-slot, release-slot, touch, enqueue, retry-count, factory-control, dryrun-mark, dryrun-check, feature-flag, phase, inject, get-injections" >&2
```

In the `case "$cmd" in` block, find:

```bash
  phase)             cmd_phase "$@" ;;
```

Add after it:

```bash
  inject)            cmd_inject "$@" ;;
  get-injections)    cmd_get_injections "$@" ;;
```

- [ ] **Step 5: Run BATS to confirm it passes**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-49-injection-cli.bats`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/ticket.sh tests/local/FA-SF-49-injection-cli.bats
git commit -m "feat(factory-injection): ticket.sh inject + get-injections (FA-SF-49) [factory-injection]"
```

---

## Task 6: Pipeline consume — `consumeInjections(phase)` in `pipeline.js`

**Files:**
- Modify: `scripts/factory/pipeline.js`
- Modify: `.gitignore`
- Test: `tests/local/FA-SF-20-pipeline-contract.bats` (extend the FA-SF-20-style contract)

> The helper mirrors `phaseEvent`: `try/catch`, never throws, uses `execFileSync` (arg array → no shell injection). It is called immediately after EACH `phaseEvent(<phase>,'entered')`. Anchor on those exact strings (line numbers drift).

- [ ] **Step 1: Add `assets-inbox/` to `.gitignore`**

Append to `/tmp/wt-factory-injection/.gitignore`:

```
# Factory injection assets — materialized into the worktree at a phase boundary, never committed.
assets-inbox/
```

- [ ] **Step 2: Write the failing pipeline-contract test**

In `tests/local/FA-SF-20-pipeline-contract.bats`, append new cases at the end of the file:

```bash
@test "FA-SF-20: defines consumeInjections and calls it after every phaseEvent(...,'entered')" {
  run grep -q "function consumeInjections" "$SCRIPT"; [ "$status" -eq 0 ]
  # one consume per entered-boundary: scout, design, plan(x2 reuse+fresh), implement, verify, deploy
  run grep -c "consumeInjections(" "$SCRIPT"
  [ "$status" -eq 0 ]
  [ "$output" -ge 7 ]
}

@test "FA-SF-20: consumeInjections is best-effort (try/catch, never throws) and uses get-injections --consume" {
  run grep -q "get-injections" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "'--consume'" "$SCRIPT"; [ "$status" -eq 0 ]
  # the helper body wraps in try/catch (mirrors phaseEvent)
  run bash -c "awk '/function consumeInjections/,/^}/' \"$SCRIPT\" | grep -q 'try {'"
  [ "$status" -eq 0 ]
}

@test "FA-SF-20: consumeInjections materializes assets into assets-inbox" {
  run grep -q "assets-inbox" "$SCRIPT"; [ "$status" -eq 0 ]
}
```

(The count `>= 7` matches: scout, design, plan-reuse, plan-fresh, implement, verify, deploy — 7 `phaseEvent(...,'entered')` anchors.)

- [ ] **Step 3: Run to confirm it fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-20-pipeline-contract.bats`
Expected: FAIL on the three new cases.

- [ ] **Step 4: Implement the helper**

In `scripts/factory/pipeline.js`, find the end of the existing `phaseEvent` helper:

```js
function phaseEvent(ph, state, detail) {
  try {
    const { execFileSync } = require('child_process')
    const a = [`${REPO}/scripts/ticket.sh`, 'phase', String(A.ticket_id), ph, state, '--driver', 'factory']
    if (detail) a.push('--detail', String(detail).slice(0, 240))
    execFileSync('bash', a, { stdio: 'ignore', timeout: 15000 }) // arg array → no shell injection via detail
  } catch { /* telemetry is best-effort; swallow */ }
}
```

Add immediately AFTER it (terse — S1 ratchet on pipeline.js):

```js
// Factory injection consume (factory-injection): at each phase boundary, atomically pull the
// operator's unconsumed injections for this phase (or NULL-phase). Returns a binding prompt
// block string ('' if none). Materializes assets to ${WORK_WT}/assets-inbox/<id>/. Best-effort:
// like phaseEvent it NEVER throws — a failed consume must not kill the pipeline.
function consumeInjections(ph) {
  try {
    const { execFileSync } = require('child_process')
    const fs = require('fs'), path = require('path')
    const out = execFileSync('bash',
      [`${REPO}/scripts/ticket.sh`, 'get-injections', '--id', String(A.ticket_id), '--phase', ph, '--consume', '--format', 'json'],
      { encoding: 'utf8', timeout: 20000 }).trim()
    const rows = out ? JSON.parse(out) : []
    if (!Array.isArray(rows) || !rows.length) return ''
    const inbox = path.join(WORK_WT, 'assets-inbox', String(A.ticket_id))
    const lines = []
    for (const r of rows) {
      if (r.kind === 'asset' && r.data_url && r.filename) {
        try {
          fs.mkdirSync(inbox, { recursive: true })
          const b64 = String(r.data_url).replace(/^data:[^;]+;base64,/, '')
          const dest = path.join(inbox, path.basename(String(r.filename)))
          fs.writeFileSync(dest, Buffer.from(b64, 'base64'))
          lines.push(`ASSET available at ${dest}${r.target_files ? ` (for: ${r.target_files.join(', ')})` : ''}`)
        } catch { /* asset write best-effort */ }
      } else if (r.content || r.title) {
        lines.push(`- ${r.title ? r.title + ': ' : ''}${r.content ?? ''}${r.target_files ? ` [files: ${r.target_files.join(', ')}]` : ''}`)
      }
    }
    phaseEvent(ph, 'note', `consumed ${rows.length} injection(s)`)
    if (!lines.length) return ''
    return `\n\nOPERATOR INJECTED CONTEXT — verbindlich berücksichtigen:\n${lines.join('\n')}\n`
  } catch { return '' } // best-effort: swallow everything
}
```

> Note on the `phaseEvent(ph,'note',...)` breadcrumb: `ticket.sh phase` rejects state `note` (only `entered|done|blocked`). To avoid a swallowed-but-wasted call, emit the breadcrumb via `add-comment` instead. Replace the `phaseEvent(ph, 'note', ...)` line above with:
> ```js
>     try { execFileSync('bash', [`${REPO}/scripts/ticket.sh`, 'add-comment', '--id', String(A.ticket_id), '--author', 'factory', '--body', `consumed ${rows.length} injection(s) @ ${ph}`], { stdio: 'ignore', timeout: 15000 }) } catch {}
> ```
> (This keeps the breadcrumb visible in the detail panel's Breadcrumbs section without abusing the phase-state enum.)

- [ ] **Step 5: Call the helper after each `phaseEvent(<phase>,'entered')`**

For EACH of the seven anchors below, insert a consume call on the next line and use its return string. Anchor on the exact existing strings.

**Scout** — find `phaseEvent('scout', 'entered')` and add after it:
```js
const injScout = consumeInjections('scout')
```
Then append `injScout` to the Scout agent prompt: in the Scout `agent(\`…\`, …)` call, append `+ injScout` to the template-literal prompt argument (i.e. `agent(\`…existing prompt…\` + injScout, { … })`).

**Design** — find `phaseEvent('design', 'entered')`, add after:
```js
const injDesign = consumeInjections('design')
```
and append `+ injDesign` to the Design agent's prompt literal.

**Plan (reuse path)** — find the `phaseEvent('plan', 'entered')` that is INSIDE the `else`/reuse branch (the one near `consumeInjections` anchor at the reuse plan, around the second occurrence). Add after it:
```js
const injPlanReuse = consumeInjections('plan')
```
and append `+ injPlanReuse` to that branch's plan agent prompt.

**Plan (fresh path)** — find the FIRST `phaseEvent('plan', 'entered')` (inside `if (!REUSE)`), add after:
```js
const injPlanFresh = consumeInjections('plan')
```
and append `+ injPlanFresh` to the fresh-path plan agent prompt.

**Implement** — find `phaseEvent('implement', 'entered')`, add after:
```js
const injImplement = consumeInjections('implement')
```
In the per-task implement loop (`for (const t of tasks)`), append the global block to the impl prompt, and additionally surface task-scoped context: append `+ injImplement` to the `impl` agent's prompt literal (the one with `Implement task ${t.id} …`). Because `consumeInjections` already annotates `target_files`, the agent sees `[files: …]` and self-scopes; no extra per-task filtering needed for MVP.

**Verify** — find `phaseEvent('verify', 'entered')`, add after:
```js
const injVerify = consumeInjections('verify')
```
and append `+ injVerify` to the Verify review-panel prompt(s).

**Deploy** — find `phaseEvent('deploy', 'entered')`, add after:
```js
const injDeploy = consumeInjections('deploy')
```
and append `+ injDeploy` to the Deploy agent's prompt literal.

> Implementation note: for each `agent(\`PROMPT\`, OPTS)` call, the change is `agent(\`PROMPT\` + injX, OPTS)`. If a prompt is built into a variable first, append `+ injX` where the string is finalized. Keep MVP simple: a single global block per phase. The `target_files` annotation inside the block is the scoping signal.

- [ ] **Step 6: `node --check` + contract test**

Run: `node --check scripts/factory/pipeline.js`
Expected: exit 0.

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-20-pipeline-contract.bats`
Expected: PASS (existing + 3 new).

- [ ] **Step 7: Verify the S1 line-ratchet still passes**

Run: `task quality:check 2>&1 | tail -20` (or `task test:all`)
Expected: PASS. If the pipeline.js / ticket.sh line gate fails, condense the new helpers (collapse multi-line `case`/`if` to one-liners as the existing code does) WITHOUT removing behavior, then re-run.

- [ ] **Step 8: Commit**

```bash
git add scripts/factory/pipeline.js .gitignore tests/local/FA-SF-20-pipeline-contract.bats
git commit -m "feat(factory-injection): consumeInjections at every phase boundary + assets-inbox [factory-injection]"
```

---

## Task 7: Playwright smoke — inject form renders + POST path

**Files:**
- Create: `tests/playwright/factory-injection.spec.ts` (follow the dir/auth pattern of existing `/dev-status` Playwright specs — locate one with `ls tests/playwright/ | grep -i 'dev-status\|factory'` and copy its admin-login/setup boilerplate)

> The smoke is intentionally light: it asserts the inject form renders inside the detail panel and that submitting issues a POST to `/api/factory-floor/<id>/inject`. Network is stubbed so it needs no live pipeline.

- [ ] **Step 1: Locate the existing dev-status spec for the auth/setup pattern**

Run: `ls tests/playwright/ | grep -iE 'dev-status|factory|floor'`
Read whichever exists to copy its admin-session/login `beforeEach` and base-URL handling. If none exists, search for the admin-login helper: `grep -rl "isAdmin\|admins\|preferred_username\|dev-status" tests/playwright/ | head`.

- [ ] **Step 2: Write the smoke spec**

Create `tests/playwright/factory-injection.spec.ts` (adapt the `<ADMIN_LOGIN_SETUP>` block from Step 1 — do not invent an auth flow; reuse the existing one):

```ts
import { test, expect } from '@playwright/test';

// <ADMIN_LOGIN_SETUP> — paste the admin-session beforeEach from the existing
// /dev-status spec found in Step 1 (cookie injection or login flow).

test('inject form renders in the detail panel and POSTs to the inject endpoint', async ({ page }) => {
  // Stub the floor payload so a clickable hall card exists without a live pipeline.
  await page.route('**/api/factory-floor', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      control: { killSwitch: false, slotsUsed: 1, slotsCap: 4, dailyCap: 5, dailyUsed: 0, dryRun: false, watchdogStale: 0 },
      metrics: { shippedToday: 0, avgCycleH: null },
      loadingDock: [],
      hall: [{ extId: 'T000459', title: 'Smoke', priority: 'hoch', phase: 'implement', phaseState: 'entered', phaseSince: new Date().toISOString(), retryCount: 0, blockReason: null, slot: 1 }],
      shipped: [], fetchedAt: new Date().toISOString(),
    }) }));
  await page.route('**/api/factory-floor/T000459', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      extId: 'T000459', title: 'Smoke', status: 'in_progress', priority: 'hoch', retryCount: 0, prNumber: null,
      events: [], breadcrumbs: [], injections: [],
    }) }));
  let posted = false;
  await page.route('**/api/factory-floor/T000459/inject', (route) => {
    posted = true;
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'x' }) });
  });

  await page.goto('/dev-status');
  await page.getByText('T000459', { exact: false }).first().click();
  await expect(page.getByTestId('floor-detail')).toBeVisible();
  await page.getByTestId('inject-form').click(); // open <details>
  await page.getByTestId('inject-content').fill('smoke context');
  await page.getByTestId('inject-submit').click();
  await expect.poll(() => posted).toBe(true);
});
```

- [ ] **Step 3: Run the smoke (best-effort; Playwright needs a built/served site)**

Run: `cd website && npx playwright test factory-injection --reporter=line` (or the repo's Playwright task — `bash scripts/task-oracle.sh 'run playwright smoke against local site'`).
Expected: PASS. If the local Playwright harness is not runnable in this environment, confirm the spec is syntactically valid with `npx tsc --noEmit` over the test and note it runs in the nightly `e2e.yml`.

- [ ] **Step 4: Commit**

```bash
git add tests/playwright/factory-injection.spec.ts
git commit -m "test(factory-injection): Playwright smoke for inject form + POST [factory-injection]"
```

---

## Task 8: Freshness regen + full offline suite (CI-green gate)

**Files:**
- Modify (generated): `website/src/data/test-inventory.json`, `website/src/data/route-manifest.json`, `docs/code-quality/repo-index.json` (and any other artifact `freshness:regenerate` touches).

> New test files + a new API route MUST be reflected in the generated inventory/route artifacts or CI's `freshness:check` fails. This is the last task — run it after everything else compiles.

- [ ] **Step 1: Regenerate all artifacts**

Run: `task freshness:regenerate`
Expected: completes; `git status` may show changes to `test-inventory.json`, `route-manifest.json`, `repo-index.json`.

- [ ] **Step 2: Run the full offline CI suite locally**

Run: `task test:all`
Expected: PASS — includes `test:factory` (FA-SF-*.bats: FA-SF-49 + extended FA-SF-20) and the Vitest unit tests.

- [ ] **Step 3: Run the freshness gate exactly as CI does**

Run: `task freshness:check`
Expected: PASS (no stale-artifact diff). If it fails, the previous regen left an uncommitted artifact — `git add` it.

- [ ] **Step 4: Run the test-inventory check as CI does**

Run: `task test:inventory && git diff --exit-code website/src/data/test-inventory.json`
Expected: exit 0 (committed inventory matches regenerated).

- [ ] **Step 5: Commit the generated artifacts**

```bash
git add website/src/data/test-inventory.json website/src/data/route-manifest.json docs/code-quality/repo-index.json
git commit -m "chore(factory-injection): regenerate freshness artifacts (inventory/routes/index) [factory-injection]"
```

> If `git status` shows other regenerated artifacts changed (e.g. `learning-assets.generated.json`, agent-guide surfaces) and they are genuinely affected, add them too — match the file list in `Taskfile.yml`'s `freshness:check` FILES block. If they are NOT related to this change, do NOT commit unrelated churn; investigate why regen touched them.

---

## Self-Review

**Spec coverage:**
- C (context/note injection → binding prompt block): Task 6 `consumeInjections` returns the `OPERATOR INJECTED CONTEXT` block, appended to each phase prompt. ✓
- D2 (asset materialized into worktree): Task 6 writes `data_url` → `${WORK_WT}/assets-inbox/<id>/<filename>`; `.gitignore` entry added. ✓
- New table `tickets.ticket_injections` with exact spec fields incl. `consumed_at`, CHECK, indexes: Task 1. ✓
- CLI `inject` (with `--file` base64/MIME/cap, `--phase`, `--target-files`, validate-before-_pgpod) + `get-injections` (`--consume` atomic UPDATE…RETURNING, `--format json`): Task 5. ✓
- `POST /api/factory-floor/[extId]/inject` admin-gated, content cap, data-url validation: Task 3. ✓
- Detail-panel form + injection status list (⏳ offen / ✓ konsumiert): Task 4. ✓
- `getTicketDetail` returns `injections`: Task 2. ✓
- Atomic consume (second consume empty), phase vs NULL targeting, best-effort/no-throw: Tasks 2 (DAL test) + 6 (helper try/catch). ✓
- Tests: Vitest+pg-mem (Task 2), API gate (Task 3), BATS FA-SF-49 (Task 5), pipeline contract FA-SF-20-style (Task 6), Playwright smoke (Task 7). ✓
- Freshness/inventory gate: Task 8. ✓

**Placeholder scan:** The only intentional placeholder is `<ADMIN_LOGIN_SETUP>` in Task 7 — explicitly instructed to copy the existing dev-status spec's auth boilerplate (inventing an auth flow would be wrong). All code steps contain full code.

**Type consistency:** `InjectionRow`/`InjectInput`/`InjectionKind` defined once in `factory-floor.ts` (Task 2), reused by the API (Task 3) and mirrored (narrowly) in the Svelte component (Task 4). `consumeInjections` exists in two forms: the TS DAL primitive (Task 2, used by tests/API) and the pipeline JS helper (Task 6, named identically by design — different runtime, no import conflict). The CLI emits the same JSON shape (`id,kind,title,content,target_files,data_url,nc_path,filename,mime_type,phase`) the pipeline parses (Task 5↔6). Field naming: DB snake_case (`target_files`, `data_url`, `consumed_at`) ↔ TS camelCase (`targetFiles`, `dataUrl`, `consumedAt`) via `mapInjection`. ✓

**Risks / assumptions:**
- S1 line-ratchet on `pipeline.js`/`ticket.sh` may trip — Task 6 Step 7 has a condense fallback.
- The seven `phaseEvent(...,'entered')` anchors assume the current pipeline structure (2 plan branches). If a branch is missing, the contract test's `>= 7` count adjusts — verify with `grep -c "phaseEvent('.*', 'entered')"` before finalizing the threshold.
- Playwright may not run in this environment (noted in Task 7 Step 3 — falls to nightly `e2e.yml`).
- pg-mem may not support `string_to_array`/`json_agg` identically; the DAL tests use the TS `consumeInjections` (parameterized, pg-mem-friendly), NOT the CLI's SQL, so this is isolated to the live path.
