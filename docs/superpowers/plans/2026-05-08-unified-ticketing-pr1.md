# Unified Ticketing PR1 — Schema, Bug Migration, Close-Mail Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new `tickets` schema, migrate `bugs.bug_tickets` into it, and fix the missed-reporter-notification bug on every close path — without changing the public bug-report or admin-bugs UX.

**Architecture:** A new `tickets` Postgres schema is created in the `website` database. All existing bug data migrates into `tickets.tickets` (type=`bug`). Three close paths (admin bug resolve, inbox resolve action, PR-merge auto-close) are rewritten to call a single `transitionTicket()` service that always notifies the reporter via email. The old `bugs.bug_tickets` table is replaced by a SQL view so external readers (`timeline.ts` `bugs_fixed` join, `kore/KoreBugs.astro`) keep working.

**Tech Stack:** Astro 4, Svelte 4, TypeScript, PostgreSQL 16 (`shared-db`), `pg` driver, nodemailer (Mailpit dev / SMTP prod), Playwright + BATS for testing, `task` (go-task) for orchestration.

**Spec:** `docs/superpowers/specs/2026-05-08-unified-ticketing-design.md` — sections 5, 6, 7, 9 (PR1 only).

---

## File Structure

**Create:**
- `website/src/lib/tickets-db.ts` — schema init (CREATE SCHEMA + tables + triggers + indexes), query helpers for the new model.
- `website/src/lib/tickets/transition.ts` — single `transitionTicket()` service. The only code allowed to change `tickets.status`.
- `website/src/lib/tickets/email-templates.ts` — close-notification templates.
- `website/src/lib/tickets/reporter-link.ts` — reporter→customer auto-link helper.
- `scripts/migrate-bugs-to-tickets.mjs` — one-shot, idempotent migration runner.
- `tests/unit/tickets-transition.bats` — BATS state-machine tests.
- `tests/unit/tickets-migration.bats` — BATS migration verification (row counts, key mappings).
- `tests/e2e/specs/fa-bugs-notifications.spec.ts` — Playwright bug-report→admin-resolve→reporter-email E2E.

**Modify:**
- `website/src/lib/website-db.ts` — wire `initTicketsSchema()`; rewrite `insertBugTicket`/`resolveBugTicket`/`archiveBugTicket`/`reopenBugTicket`/`getBugTicketStatus`/`getBugTicketWithComments`/`appendBugTicketComment`/`listBugTickets` to read from `tickets.tickets`. Keep the JOIN at line 88-91 (`bugs_fixed` count) by replacing `bugs.bug_tickets` with the new view.
- `website/src/pages/api/bug-report.ts` — write into `tickets.tickets` directly (still mints BR-IDs); call `linkReporterToCustomer()`.
- `website/src/pages/api/admin/bugs/resolve.ts` — call `transitionTicket()`.
- `website/src/pages/api/admin/inbox/[id]/action.ts` — `resolve_bug` case calls `transitionTicket()`; remove the broken `info@<brand>` email block.
- `scripts/track-pr.mjs` — `writeRowToDb()` calls `transitionTicket()` with `status='done'` (not `'archived'`) and `resolution='fixed'`.

**No UI change in PR1.** `/admin/bugs`, `/admin/bugs/[id]`, and `BugsTab.svelte` keep working unchanged because the website-db reader functions still expose the same interface — they just read from `tickets.tickets` underneath.

---

## Task 1: Scaffold tickets-db.ts with schema + tables

**Files:**
- Create: `website/src/lib/tickets-db.ts`

- [ ] **Step 1: Create tickets-db.ts with schema init**

```typescript
// website/src/lib/tickets-db.ts
import { pool } from './db';

let schemaReady = false;

export async function initTicketsSchema(): Promise<void> {
  if (schemaReady) return;

  await pool.query(`CREATE SCHEMA IF NOT EXISTS tickets AUTHORIZATION website`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.tickets (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id     TEXT        UNIQUE,
      type            TEXT        NOT NULL CHECK (type IN ('bug','feature','task','project')),
      parent_id       UUID        REFERENCES tickets.tickets(id) ON DELETE SET NULL,
      brand           TEXT        NOT NULL,

      title           TEXT        NOT NULL,
      description     TEXT,
      url             TEXT,
      thesis_tag      TEXT,
      component       TEXT,

      status          TEXT        NOT NULL DEFAULT 'triage'
                      CHECK (status IN ('triage','backlog','in_progress','in_review','blocked','done','archived')),
      resolution      TEXT        CHECK (resolution IN
                        ('fixed','shipped','wontfix','duplicate','cant_reproduce','obsolete')),
      priority        TEXT        NOT NULL DEFAULT 'mittel'  CHECK (priority IN ('hoch','mittel','niedrig')),
      severity        TEXT        CHECK (severity IN ('critical','major','minor','trivial')),

      reporter_id     UUID        REFERENCES customers(id) ON DELETE SET NULL,
      reporter_email  TEXT,
      assignee_id     UUID        REFERENCES customers(id) ON DELETE SET NULL,
      customer_id     UUID        REFERENCES customers(id) ON DELETE SET NULL,

      start_date      DATE,
      due_date        DATE,
      estimate_minutes      INTEGER,
      time_logged_minutes   INTEGER NOT NULL DEFAULT 0,

      triaged_at      TIMESTAMPTZ,
      started_at      TIMESTAMPTZ,
      done_at         TIMESTAMPTZ,
      archived_at     TIMESTAMPTZ,

      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT resolution_only_when_closed CHECK (
        (resolution IS NULL AND status NOT IN ('done','archived'))
        OR status IN ('done','archived')
      )
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets.tickets (status) WHERE status NOT IN ('done','archived')`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_type_brand_idx ON tickets.tickets (type, brand)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_parent_idx ON tickets.tickets (parent_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_assignee_idx ON tickets.tickets (assignee_id) WHERE assignee_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_customer_idx ON tickets.tickets (customer_id) WHERE customer_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_thesis_tag_idx ON tickets.tickets (thesis_tag) WHERE thesis_tag IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_external_id_idx ON tickets.tickets (external_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_links (
      id          BIGSERIAL PRIMARY KEY,
      from_id     UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      to_id       UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL CHECK (kind IN ('blocks','blocked_by','duplicate_of','relates_to','fixes','fixed_by')),
      pr_number   INTEGER,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by  UUID REFERENCES customers(id),
      UNIQUE (from_id, to_id, kind)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_links_from_idx ON tickets.ticket_links (from_id, kind)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_links_to_idx   ON tickets.ticket_links (to_id, kind)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_links_pr_idx   ON tickets.ticket_links (pr_number) WHERE pr_number IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_activity (
      id          BIGSERIAL PRIMARY KEY,
      ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      actor_id    UUID REFERENCES customers(id),
      actor_label TEXT,
      field       TEXT NOT NULL,
      old_value   JSONB,
      new_value   JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS activity_ticket_idx ON tickets.ticket_activity (ticket_id, created_at)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_comments (
      id           BIGSERIAL PRIMARY KEY,
      ticket_id    UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      author_id    UUID REFERENCES customers(id),
      author_label TEXT NOT NULL,
      kind         TEXT NOT NULL DEFAULT 'comment'
                   CHECK (kind IN ('comment','status_change','system')),
      body         TEXT NOT NULL,
      visibility   TEXT NOT NULL DEFAULT 'internal'
                   CHECK (visibility IN ('internal','public')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON tickets.ticket_comments (ticket_id, created_at)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_attachments (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      filename    TEXT NOT NULL,
      nc_path     TEXT,
      data_url    TEXT,
      mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_size   BIGINT,
      uploaded_by UUID REFERENCES customers(id),
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (nc_path IS NOT NULL OR data_url IS NOT NULL)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_idx ON tickets.ticket_attachments (ticket_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_watchers (
      ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      user_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (ticket_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.tags (
      id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name  TEXT NOT NULL UNIQUE,
      color TEXT,
      brand TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_tags (
      ticket_id UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      tag_id    UUID NOT NULL REFERENCES tickets.tags(id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, tag_id)
    )
  `);

  schemaReady = true;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd website && npx tsc --noEmit src/lib/tickets-db.ts`
Expected: no output (clean compile). If you see "Cannot find module './db'", check that `website/src/lib/db.ts` exists and exports `pool`. If not, fall back to `import { pool } from './website-db.js';` since `website-db.ts` is where `pool` lives in this codebase.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/tickets-db.ts
git commit -m "feat(tickets): create tickets schema and core tables"
```

---

## Task 2: Add cycle-prevention and lifecycle-timestamp triggers

**Files:**
- Modify: `website/src/lib/tickets-db.ts`

- [ ] **Step 1: Append trigger DDL to `initTicketsSchema()` after the table creates**

Add at the end of `initTicketsSchema()` (before `schemaReady = true`):

```typescript
  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_prevent_cycle() RETURNS trigger AS $$
    DECLARE
      cur UUID := NEW.parent_id;
      depth INT := 0;
    BEGIN
      WHILE cur IS NOT NULL AND depth < 100 LOOP
        IF cur = NEW.id THEN
          RAISE EXCEPTION 'parent_id cycle detected on ticket %', NEW.id;
        END IF;
        SELECT parent_id INTO cur FROM tickets.tickets WHERE id = cur;
        depth := depth + 1;
      END LOOP;
      RETURN NEW;
    END $$ LANGUAGE plpgsql
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS trg_tickets_prevent_cycle ON tickets.tickets;
    CREATE TRIGGER trg_tickets_prevent_cycle
      BEFORE INSERT OR UPDATE OF parent_id ON tickets.tickets
      FOR EACH ROW WHEN (NEW.parent_id IS NOT NULL)
      EXECUTE FUNCTION tickets.fn_prevent_cycle()
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_lifecycle_ts() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'triage' AND NEW.triaged_at IS NULL THEN NEW.triaged_at := now(); END IF;
        IF NEW.status = 'in_progress' AND NEW.started_at IS NULL THEN NEW.started_at := now(); END IF;
        IF NEW.status = 'done' AND NEW.done_at IS NULL THEN NEW.done_at := now(); END IF;
        IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN NEW.archived_at := now(); END IF;
      ELSE
        IF NEW.status <> OLD.status THEN
          IF NEW.status = 'triage'      AND NEW.triaged_at  IS NULL THEN NEW.triaged_at  := now(); END IF;
          IF NEW.status = 'in_progress' AND NEW.started_at  IS NULL THEN NEW.started_at  := now(); END IF;
          IF NEW.status = 'done'        AND NEW.done_at     IS NULL THEN NEW.done_at     := now(); END IF;
          IF NEW.status = 'archived'    AND NEW.archived_at IS NULL THEN NEW.archived_at := now(); END IF;
        END IF;
        NEW.updated_at := now();
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS trg_tickets_lifecycle_ts ON tickets.tickets;
    CREATE TRIGGER trg_tickets_lifecycle_ts
      BEFORE INSERT OR UPDATE ON tickets.tickets
      FOR EACH ROW EXECUTE FUNCTION tickets.fn_lifecycle_ts()
  `);
```

- [ ] **Step 2: Smoke-check by initialising against a local k3d DB**

Run from project root:
```bash
task workspace:port-forward ENV=mentolder &
PG_PID=$!
sleep 3
PGPASSWORD=$(kubectl --context mentolder -n workspace get secret workspace-secrets -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d) \
  psql -h localhost -U postgres -d website -c '\dt tickets.*'
kill $PG_PID 2>/dev/null || true
```
Expected: error `Did not find any relation matching` (the schema doesn't exist yet — that's fine; we're just checking pool connectivity). If you get a connection error, the port-forward isn't up; investigate before continuing.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/tickets-db.ts
git commit -m "feat(tickets): add cycle-prevention and lifecycle-timestamp triggers"
```

---

## Task 3: Add audit-log trigger

**Files:**
- Modify: `website/src/lib/tickets-db.ts`

- [ ] **Step 1: Append audit-log trigger after the lifecycle-ts trigger**

```typescript
  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_audit_log() RETURNS trigger AS $$
    DECLARE
      actor_id_local UUID;
      actor_label_local TEXT;
      diff JSONB := '{}'::jsonb;
      tracked_field TEXT;
    BEGIN
      BEGIN actor_id_local := current_setting('app.user_id', true)::uuid;
      EXCEPTION WHEN OTHERS THEN actor_id_local := NULL; END;
      BEGIN actor_label_local := current_setting('app.user_label', true);
      EXCEPTION WHEN OTHERS THEN actor_label_local := NULL; END;

      IF TG_OP = 'INSERT' THEN
        INSERT INTO tickets.ticket_activity (ticket_id, actor_id, actor_label, field, new_value)
        VALUES (NEW.id, actor_id_local, actor_label_local, '_created', to_jsonb(NEW));
        RETURN NEW;
      END IF;

      FOR tracked_field IN SELECT unnest(ARRAY[
        'status','resolution','priority','severity','assignee_id','customer_id',
        'reporter_id','reporter_email','title','description','url','component',
        'thesis_tag','parent_id','start_date','due_date','estimate_minutes'
      ]) LOOP
        IF (to_jsonb(OLD) -> tracked_field) IS DISTINCT FROM (to_jsonb(NEW) -> tracked_field) THEN
          diff := diff || jsonb_build_object(tracked_field,
            jsonb_build_object('old', to_jsonb(OLD) -> tracked_field,
                               'new', to_jsonb(NEW) -> tracked_field));
        END IF;
      END LOOP;

      IF diff <> '{}'::jsonb THEN
        INSERT INTO tickets.ticket_activity (ticket_id, actor_id, actor_label, field, old_value, new_value)
        VALUES (NEW.id, actor_id_local, actor_label_local, '_updated', NULL, diff);
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS trg_tickets_audit_log ON tickets.tickets;
    CREATE TRIGGER trg_tickets_audit_log
      AFTER INSERT OR UPDATE ON tickets.tickets
      FOR EACH ROW EXECUTE FUNCTION tickets.fn_audit_log()
  `);
```

- [ ] **Step 2: Commit**

```bash
git add website/src/lib/tickets-db.ts
git commit -m "feat(tickets): add audit-log trigger writing to ticket_activity"
```

---

## Task 4: Reporter→customer auto-link helper

**Files:**
- Create: `website/src/lib/tickets/reporter-link.ts`
- Test: `tests/unit/tickets-reporter-link.bats`

- [ ] **Step 1: Write the failing test**

```bash
# tests/unit/tickets-reporter-link.bats
#!/usr/bin/env bats
load ../helpers/test_helper

setup() {
  export PGURL="${TRACKING_DB_URL:-postgres://postgres:postgres@localhost:5432/website}"
}

@test "linkReporterByEmail sets reporter_id when email matches a keycloak-linked customer" {
  psql "$PGURL" <<SQL
    INSERT INTO customers (id, name, email, keycloak_user_id)
      VALUES ('11111111-1111-1111-1111-111111111111', 'Test User', 'link-test@example.com', 'kc-1')
      ON CONFLICT (email) DO NOTHING;
    INSERT INTO tickets.tickets (id, type, brand, title, reporter_email)
      VALUES ('22222222-2222-2222-2222-222222222222', 'bug', 'mentolder', 'T', 'link-test@example.com')
      ON CONFLICT DO NOTHING;
SQL
  node --input-type=module -e "
    import('./website/src/lib/tickets/reporter-link.js').then(async m => {
      await m.linkReporterByEmail('link-test@example.com');
      process.exit(0);
    });
  "
  result=$(psql "$PGURL" -t -A -c "SELECT reporter_id::text FROM tickets.tickets WHERE id='22222222-2222-2222-2222-222222222222'")
  [ "$result" = "11111111-1111-1111-1111-111111111111" ]
}
```

- [ ] **Step 2: Verify it fails**

Run: `./tests/runner.sh local -- tests/unit/tickets-reporter-link.bats`
Expected: FAIL — module `./website/src/lib/tickets/reporter-link.js` not found.

- [ ] **Step 3: Implement the helper**

```typescript
// website/src/lib/tickets/reporter-link.ts
import { pool } from '../website-db';

/**
 * If a customer with this email exists and has a keycloak_user_id,
 * link any tickets where reporter_email = email AND reporter_id IS NULL.
 * Idempotent — safe to call repeatedly.
 */
export async function linkReporterByEmail(email: string): Promise<number> {
  if (!email) return 0;
  const r = await pool.query(
    `UPDATE tickets.tickets t
       SET reporter_id = c.id
       FROM customers c
      WHERE t.reporter_email = $1
        AND t.reporter_id IS NULL
        AND c.email = $1
        AND c.keycloak_user_id IS NOT NULL`,
    [email]
  );
  return r.rowCount ?? 0;
}

/**
 * Batch link: for every distinct reporter_email in tickets where reporter_id is null,
 * try to match against customers. Used by the migration script and as a nightly cron.
 */
export async function linkAllReporters(): Promise<number> {
  const r = await pool.query(
    `UPDATE tickets.tickets t
       SET reporter_id = c.id
       FROM customers c
      WHERE t.reporter_id IS NULL
        AND t.reporter_email IS NOT NULL
        AND c.email = t.reporter_email
        AND c.keycloak_user_id IS NOT NULL`
  );
  return r.rowCount ?? 0;
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `./tests/runner.sh local -- tests/unit/tickets-reporter-link.bats`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets/reporter-link.ts tests/unit/tickets-reporter-link.bats
git commit -m "feat(tickets): reporter-email to customer auto-link helper"
```

---

## Task 5: Close-notification email template

**Files:**
- Create: `website/src/lib/tickets/email-templates.ts`

- [ ] **Step 1: Implement the template**

```typescript
// website/src/lib/tickets/email-templates.ts
import { sendEmail } from '../email';

const FROM_NAME = process.env.FROM_NAME || process.env.BRAND_NAME || 'Workspace';
const PROD_DOMAIN = process.env.PROD_DOMAIN || '';
const BRAND = process.env.BRAND || 'mentolder';
const INFO_EMAIL = PROD_DOMAIN ? `info@${PROD_DOMAIN}` : `info@${BRAND}.de`;

export interface CloseEmailParams {
  externalId: string;
  reporterEmail: string;
  resolution: string;             // 'fixed' | 'shipped' | 'wontfix' | 'duplicate' | 'cant_reproduce' | 'obsolete'
  note?: string;                   // optional public note
  publicStatusUrl?: string;        // e.g. https://web.mentolder.de/portal/tickets/BR-…
}

const RESOLUTION_LABELS_DE: Record<string, string> = {
  fixed:         'behoben',
  shipped:       'umgesetzt',
  wontfix:       'nicht umgesetzt',
  duplicate:     'als Duplikat geschlossen',
  cant_reproduce:'nicht reproduzierbar',
  obsolete:      'nicht mehr relevant',
};

export async function sendBugCloseEmail(p: CloseEmailParams): Promise<boolean> {
  if (!p.reporterEmail) return false;
  const label = RESOLUTION_LABELS_DE[p.resolution] ?? p.resolution;

  const text = `Hallo,

Ihre Meldung mit der Nummer ${p.externalId} wurde ${label}.
${p.note ? `\nAnmerkung: ${p.note}\n` : ''}
${p.publicStatusUrl ? `Status & Verlauf: ${p.publicStatusUrl}\n\n` : ''}
Vielen Dank für Ihren Beitrag.

Mit freundlichen Grüßen
${FROM_NAME}`;

  const html = `<p>Hallo,</p>
<p>Ihre Meldung mit der Nummer <strong>${p.externalId}</strong> wurde <strong>${label}</strong>.</p>
${p.note ? `<p><em>Anmerkung:</em> ${p.note}</p>` : ''}
${p.publicStatusUrl ? `<p>Status &amp; Verlauf: <a href="${p.publicStatusUrl}">${p.publicStatusUrl}</a></p>` : ''}
<p>Vielen Dank für Ihren Beitrag.</p>
<p>Mit freundlichen Grüßen<br>${FROM_NAME}</p>`;

  return sendEmail({
    to: p.reporterEmail,
    bcc: INFO_EMAIL,
    replyTo: INFO_EMAIL,
    subject: `[${p.externalId}] Ihre Meldung wurde bearbeitet`,
    text,
    html,
  });
}
```

- [ ] **Step 2: Add `bcc` field to the email helper**

Modify `website/src/lib/email.ts` — find the `SendEmailParams` interface and add `bcc?: string;`. Find the `transporter.sendMail({ ... })` call and add `bcc: params.bcc,`.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/tickets/email-templates.ts website/src/lib/email.ts
git commit -m "feat(tickets): bug close-notification email template (To=reporter, BCC=info@brand)"
```

---

## Task 6: `transitionTicket()` service — the only writer of `status`

**Files:**
- Create: `website/src/lib/tickets/transition.ts`
- Test: `tests/unit/tickets-transition.bats`

- [ ] **Step 1: Write the failing tests**

```bash
# tests/unit/tickets-transition.bats
#!/usr/bin/env bats
load ../helpers/test_helper

setup() {
  export PGURL="${TRACKING_DB_URL:-postgres://postgres:postgres@localhost:5432/website}"
  export TICKET_ID="33333333-3333-3333-3333-333333333333"
  psql "$PGURL" <<SQL
    DELETE FROM tickets.tickets WHERE id = '$TICKET_ID';
    INSERT INTO tickets.tickets (id, type, brand, title, status, reporter_email, external_id)
      VALUES ('$TICKET_ID', 'bug', 'mentolder', 'T', 'triage', 'rep-test@example.com', 'BR-19990101-0001');
SQL
}

@test "transitionTicket: triage -> done sets resolution, done_at, sends mail" {
  node --input-type=module -e "
    import('./website/src/lib/tickets/transition.js').then(async m => {
      const r = await m.transitionTicket('$TICKET_ID', { status: 'done', resolution: 'fixed', actor: { label: 'test' } });
      console.log(JSON.stringify(r));
    });
  "
  result=$(psql "$PGURL" -t -A -c "SELECT status||','||resolution||','||CASE WHEN done_at IS NULL THEN 'null' ELSE 'set' END FROM tickets.tickets WHERE id='$TICKET_ID'")
  [ "$result" = "done,fixed,set" ]
}

@test "transitionTicket: rejects done without resolution" {
  output=$(node --input-type=module -e "
    import('./website/src/lib/tickets/transition.js').then(async m => {
      try { await m.transitionTicket('$TICKET_ID', { status: 'done', actor: { label: 'test' } }); console.log('OK'); }
      catch (e) { console.log('ERR:'+e.message); }
    });
  " 2>&1)
  [[ "$output" == *"ERR:"*"resolution"* ]]
}

@test "transitionTicket: rejects unknown status" {
  output=$(node --input-type=module -e "
    import('./website/src/lib/tickets/transition.js').then(async m => {
      try { await m.transitionTicket('$TICKET_ID', { status: 'banana', actor: { label: 'test' } }); console.log('OK'); }
      catch (e) { console.log('ERR:'+e.message); }
    });
  " 2>&1)
  [[ "$output" == *"ERR:"* ]]
}
```

- [ ] **Step 2: Verify tests fail**

Run: `./tests/runner.sh local -- tests/unit/tickets-transition.bats`
Expected: 3 FAILs — module not found.

- [ ] **Step 3: Implement `transitionTicket()`**

```typescript
// website/src/lib/tickets/transition.ts
import { pool } from '../website-db';
import { sendBugCloseEmail } from './email-templates';
import { linkReporterByEmail } from './reporter-link';

export type TicketStatus =
  'triage' | 'backlog' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'archived';

export type TicketResolution =
  'fixed' | 'shipped' | 'wontfix' | 'duplicate' | 'cant_reproduce' | 'obsolete';

const VALID_STATUSES: ReadonlySet<TicketStatus> = new Set(
  ['triage','backlog','in_progress','in_review','blocked','done','archived']);

const VALID_RESOLUTIONS: ReadonlySet<TicketResolution> = new Set(
  ['fixed','shipped','wontfix','duplicate','cant_reproduce','obsolete']);

export interface TransitionParams {
  status: TicketStatus;
  resolution?: TicketResolution;
  note?: string;
  noteVisibility?: 'internal' | 'public';
  actor: { id?: string; label: string };
  prNumber?: number;
}

export interface TransitionResult {
  id: string;
  externalId: string | null;
  type: string;
  status: TicketStatus;
  resolution: TicketResolution | null;
  emailSent: boolean;
}

export async function transitionTicket(
  ticketId: string,
  p: TransitionParams
): Promise<TransitionResult> {
  if (!VALID_STATUSES.has(p.status)) {
    throw new Error(`invalid status: ${p.status}`);
  }
  if ((p.status === 'done' || p.status === 'archived') && !p.resolution) {
    throw new Error(`status=${p.status} requires a resolution`);
  }
  if (p.resolution && !VALID_RESOLUTIONS.has(p.resolution)) {
    throw new Error(`invalid resolution: ${p.resolution}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (p.actor.id) {
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [p.actor.id]);
    }
    await client.query(`SELECT set_config('app.user_label', $1, true)`, [p.actor.label]);

    const cur = await client.query(
      `SELECT id, external_id, type, status, reporter_email, brand
         FROM tickets.tickets WHERE id = $1 FOR UPDATE`,
      [ticketId]
    );
    if (cur.rowCount === 0) throw new Error(`ticket ${ticketId} not found`);
    const before = cur.rows[0];

    const upd = await client.query(
      `UPDATE tickets.tickets
         SET status = $1,
             resolution = $2
       WHERE id = $3
       RETURNING id, external_id, type, status, resolution, reporter_email, brand`,
      [p.status, p.resolution ?? null, ticketId]
    );
    const after = upd.rows[0];

    if (p.note) {
      await client.query(
        `INSERT INTO tickets.ticket_comments
           (ticket_id, author_id, author_label, kind, body, visibility)
         VALUES ($1, $2, $3, 'status_change', $4, $5)`,
        [ticketId, p.actor.id ?? null, p.actor.label, p.note, p.noteVisibility ?? 'internal']
      );
    }

    if (p.prNumber) {
      await client.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number, created_by)
         SELECT $1, $1, 'fixes', $2, $3
         WHERE NOT EXISTS (
           SELECT 1 FROM tickets.ticket_links
           WHERE from_id = $1 AND kind = 'fixes' AND pr_number = $2
         )`,
        [ticketId, p.prNumber, p.actor.id ?? null]
      );
    }

    await client.query('COMMIT');

    let emailSent = false;
    const becomingDone = before.status !== 'done' && p.status === 'done';
    if (becomingDone && after.type === 'bug' && after.reporter_email) {
      await linkReporterByEmail(after.reporter_email);
      emailSent = await sendBugCloseEmail({
        externalId: after.external_id ?? after.id,
        reporterEmail: after.reporter_email,
        resolution: after.resolution,
        note: p.noteVisibility === 'public' ? p.note : undefined,
      });
    }

    return {
      id: after.id,
      externalId: after.external_id,
      type: after.type,
      status: after.status,
      resolution: after.resolution,
      emailSent,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `./tests/runner.sh local -- tests/unit/tickets-transition.bats`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets/transition.ts tests/unit/tickets-transition.bats
git commit -m "feat(tickets): transitionTicket service — single writer of status, fires close mail"
```

---

## Task 7: Migration script — copy bugs into tickets.tickets

**Files:**
- Create: `scripts/migrate-bugs-to-tickets.mjs`
- Test: `tests/unit/tickets-migration.bats`

- [ ] **Step 1: Write the failing test**

```bash
# tests/unit/tickets-migration.bats
#!/usr/bin/env bats
load ../helpers/test_helper

setup_file() {
  export PGURL="${TRACKING_DB_URL:-postgres://postgres:postgres@localhost:5432/website}"
}

@test "migration: every bugs.bug_tickets row produces one tickets.tickets row" {
  before=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_tickets")
  node scripts/migrate-bugs-to-tickets.mjs --apply
  after=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
  [ "$before" = "$after" ]
}

@test "migration: status mapping is correct" {
  open_count=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_tickets WHERE status='open'")
  triage_count=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug' AND status='triage'")
  [ "$open_count" = "$triage_count" ]

  resolved_count=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_tickets WHERE status='resolved'")
  done_fixed_count=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug' AND status='done' AND resolution='fixed'")
  [ "$resolved_count" = "$done_fixed_count" ]
}

@test "migration: idempotent — second run does not duplicate" {
  before=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
  node scripts/migrate-bugs-to-tickets.mjs --apply
  after=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
  [ "$before" = "$after" ]
}
```

- [ ] **Step 2: Verify it fails**

Run: `./tests/runner.sh local -- tests/unit/tickets-migration.bats`
Expected: FAIL — script doesn't exist.

- [ ] **Step 3: Implement migration script**

```javascript
// scripts/migrate-bugs-to-tickets.mjs
import pg from 'pg';

const STATUS_MAP = {
  open:     { status: 'triage',   resolution: null    },
  resolved: { status: 'done',     resolution: 'fixed' },
  archived: { status: 'archived', resolution: 'fixed' },
};

const CATEGORY_TAG = {
  fehler:             'kind:bug',
  verbesserung:       'kind:improvement',
  erweiterungswunsch: 'kind:wish',
};

async function ensureTag(client, name) {
  const r = await client.query(
    `INSERT INTO tickets.tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    [name]);
  return r.rows[0].id;
}

async function migrate(client, dryRun) {
  const bugs = (await client.query(`
    SELECT ticket_id, category, reporter_email, description, url, brand,
           status, created_at, resolved_at, resolution_note,
           screenshots_json, fixed_in_pr, fixed_at
      FROM bugs.bug_tickets
     ORDER BY created_at`)).rows;

  let inserted = 0, skipped = 0;
  for (const b of bugs) {
    const exists = await client.query(
      `SELECT id FROM tickets.tickets WHERE external_id = $1`, [b.ticket_id]);
    if (exists.rowCount > 0) { skipped++; continue; }

    if (dryRun) { inserted++; continue; }

    const m = STATUS_MAP[b.status] ?? STATUS_MAP.open;
    const ins = await client.query(
      `INSERT INTO tickets.tickets
         (external_id, type, brand, title, description, url, reporter_email,
          status, resolution, created_at, done_at, archived_at)
       VALUES
         ($1, 'bug', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [b.ticket_id, b.brand,
       b.description.slice(0, 200),
       b.description,
       b.url, b.reporter_email,
       m.status, m.resolution, b.created_at,
       m.status === 'done'     ? (b.resolved_at ?? b.fixed_at) : null,
       m.status === 'archived' ? (b.fixed_at    ?? b.resolved_at) : null]);
    const newId = ins.rows[0].id;

    if (b.category && CATEGORY_TAG[b.category]) {
      const tagId = await ensureTag(client, CATEGORY_TAG[b.category]);
      await client.query(
        `INSERT INTO tickets.ticket_tags (ticket_id, tag_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`, [newId, tagId]);
    }

    if (b.resolution_note) {
      await client.query(
        `INSERT INTO tickets.ticket_comments
           (ticket_id, author_label, kind, body, visibility, created_at)
         VALUES ($1, 'migration', 'status_change', $2, 'internal', $3)`,
        [newId, b.resolution_note, b.resolved_at ?? b.created_at]);
    }

    inserted++;
  }
  return { inserted, skipped };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.TRACKING_DB_URL ?? process.env.WEBSITE_DB_URL
    ?? 'postgres://postgres:postgres@localhost:5432/website';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (apply) await client.query('BEGIN');
    const r = await migrate(client, !apply);
    if (apply) await client.query('COMMIT');
    console.log(JSON.stringify({ ...r, mode: apply ? 'apply' : 'dry-run' }));
  } catch (err) {
    if (apply) await client.query('ROLLBACK').catch(() => {});
    console.error(err.message);
    process.exit(1);
  } finally { await client.end(); }
}
main();
```

- [ ] **Step 4: Run tests, verify pass**

Run: `./tests/runner.sh local -- tests/unit/tickets-migration.bats`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-bugs-to-tickets.mjs tests/unit/tickets-migration.bats
git commit -m "feat(tickets): migration script bugs.bug_tickets -> tickets.tickets"
```

---

## Task 8: Migrate comments + screenshots + fixed_in_pr

**Files:**
- Modify: `scripts/migrate-bugs-to-tickets.mjs`

- [ ] **Step 1: Extend `migrate()` to also copy comments, attachments, and PR links**

Insert just before `inserted++;` at the end of the per-bug loop:

```javascript
    // comments
    const comments = (await client.query(
      `SELECT author, kind, body, created_at FROM bugs.bug_ticket_comments
        WHERE ticket_id = $1 ORDER BY created_at`, [b.ticket_id])).rows;
    for (const c of comments) {
      await client.query(
        `INSERT INTO tickets.ticket_comments
           (ticket_id, author_label, kind, body, visibility, created_at)
         VALUES ($1, $2, $3, $4, 'internal', $5)`,
        [newId, c.author, c.kind, c.body, c.created_at]);
    }

    // screenshots → attachments (kept as data_url for back-compat)
    if (b.screenshots_json && Array.isArray(b.screenshots_json)) {
      let i = 0;
      for (const dataUrl of b.screenshots_json) {
        const m = String(dataUrl).match(/^data:([^;]+);/);
        await client.query(
          `INSERT INTO tickets.ticket_attachments
             (ticket_id, filename, data_url, mime_type)
           VALUES ($1, $2, $3, $4)`,
          [newId, `screenshot-${++i}`, dataUrl, m ? m[1] : 'application/octet-stream']);
      }
    }

    // fixed_in_pr → ticket_links (self-link with kind=fixes + pr_number, matching transitionTicket convention)
    if (b.fixed_in_pr) {
      await client.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number)
         VALUES ($1, $1, 'fixes', $2) ON CONFLICT DO NOTHING`,
        [newId, b.fixed_in_pr]);
    }
```

- [ ] **Step 2: Add a verification test**

Append to `tests/unit/tickets-migration.bats`:

```bash
@test "migration: comments are copied" {
  expected=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_ticket_comments")
  actual=$(psql "$PGURL" -t -A -c "
    SELECT count(*) FROM tickets.ticket_comments tc
    JOIN tickets.tickets t ON t.id = tc.ticket_id
    WHERE t.type = 'bug' AND tc.kind <> 'system'")
  [ "$actual" -ge "$expected" ]
}

@test "migration: fixed_in_pr → ticket_links" {
  expected=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM bugs.bug_tickets WHERE fixed_in_pr IS NOT NULL")
  actual=$(psql "$PGURL" -t -A -c "
    SELECT count(*) FROM tickets.ticket_links WHERE kind='fixes' AND pr_number IS NOT NULL")
  [ "$actual" = "$expected" ]
}
```

- [ ] **Step 3: Run, verify pass**

Run: `./tests/runner.sh local -- tests/unit/tickets-migration.bats`
Expected: 5 PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-bugs-to-tickets.mjs tests/unit/tickets-migration.bats
git commit -m "feat(tickets): migrate comments, screenshots, and fixed_in_pr links"
```

---

## Task 9: Replace `bugs.bug_tickets` with a backward-compat view

**Files:**
- Modify: `scripts/migrate-bugs-to-tickets.mjs`

The two known external readers are:
1. `website/src/lib/website-db.ts:88` — joins on `fixed_in_pr` for the `bugs_fixed` count on the Kore homepage timeline.
2. `website/src/components/kore/KoreBugs.astro:24` — only contains a hint string `"live aus bugs.bug_tickets"`; safe to leave as text.

The view must expose `ticket_id` (TEXT) and `fixed_in_pr` (INT) so reader #1 keeps working unchanged.

- [ ] **Step 1: Add view-creation step at the end of `migrate()` (after the loop)**

```javascript
  // Replace bugs.bug_tickets with a back-compat view (run only after data is in tickets.tickets)
  if (!dryRun) {
    await client.query(`ALTER TABLE IF EXISTS bugs.bug_tickets RENAME TO bug_tickets_legacy`);
    await client.query(`ALTER TABLE IF EXISTS bugs.bug_ticket_comments RENAME TO bug_ticket_comments_legacy`);
    await client.query(`
      CREATE OR REPLACE VIEW bugs.bug_tickets AS
      SELECT
        t.external_id      AS ticket_id,
        t.brand            AS brand,
        t.url              AS url,
        t.description      AS description,
        t.reporter_email   AS reporter_email,
        CASE t.status
          WHEN 'triage' THEN 'open' WHEN 'backlog' THEN 'open'
          WHEN 'in_progress' THEN 'open' WHEN 'in_review' THEN 'open'
          WHEN 'blocked' THEN 'open'
          WHEN 'done' THEN 'resolved' WHEN 'archived' THEN 'archived'
        END                AS status,
        t.created_at       AS created_at,
        t.done_at          AS resolved_at,
        (SELECT pr_number FROM tickets.ticket_links
          WHERE from_id = t.id AND kind = 'fixes' AND pr_number IS NOT NULL
          ORDER BY created_at DESC LIMIT 1) AS fixed_in_pr,
        (SELECT created_at FROM tickets.ticket_links
          WHERE from_id = t.id AND kind = 'fixes' AND pr_number IS NOT NULL
          ORDER BY created_at DESC LIMIT 1) AS fixed_at
      FROM tickets.tickets t
      WHERE t.type = 'bug'
    `);
  }
```

- [ ] **Step 2: Verify the existing `bugs_fixed` JOIN still works**

After running migration:
```bash
PGPASSWORD=$(...) psql -h localhost -U postgres -d website -c "
  SELECT fixed_in_pr AS pr, COUNT(*)::int AS n
    FROM bugs.bug_tickets
   WHERE fixed_in_pr = ANY('{1,2,3}'::int[])
  GROUP BY fixed_in_pr"
```
Expected: query runs without error (rows may be 0; that's fine).

- [ ] **Step 3: Smoke-test the Kore timeline endpoint**

Run: `curl -s https://web.mentolder.de/api/timeline | jq '.[] | select(.bugs_fixed > 0) | {pr: .pr_number, bugs_fixed}' | head`
Expected: same shape as before migration. If empty, no bugs were ever PR-fixed before — that's also fine.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-bugs-to-tickets.mjs
git commit -m "feat(tickets): replace bugs.bug_tickets with back-compat view"
```

---

## Task 10: Wire `/api/bug-report` to write into `tickets.tickets`

**Files:**
- Modify: `website/src/pages/api/bug-report.ts`
- Modify: `website/src/lib/website-db.ts` (rewrite `insertBugTicket`)

- [ ] **Step 1: Rewrite `insertBugTicket` in website-db.ts**

Find the existing `insertBugTicket` function (around line 605). Replace its body with:

```typescript
export async function insertBugTicket(params: {
  ticketId: string;
  category: string;
  reporterEmail: string;
  description: string;
  url?: string;
  brand: string;
  screenshots?: string[];
}): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO tickets.tickets
       (external_id, type, brand, title, description, url, reporter_email, status)
     VALUES ($1, 'bug', $2, $3, $4, $5, $6, 'triage')
     ON CONFLICT (external_id) DO NOTHING
     RETURNING id`,
    [params.ticketId, params.brand,
     params.description.slice(0, 200),
     params.description, params.url ?? null, params.reporterEmail]
  );
  if (rows.length === 0) return 0;
  const newId = rows[0].id;

  // Categorize as tag
  const tagName = `kind:${params.category}`;
  await pool.query(
    `INSERT INTO tickets.tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
    [tagName]);
  await pool.query(
    `INSERT INTO tickets.ticket_tags (ticket_id, tag_id)
     SELECT $1, id FROM tickets.tags WHERE name = $2 ON CONFLICT DO NOTHING`,
    [newId, tagName]);

  // Inline screenshots
  for (const [idx, dataUrl] of (params.screenshots ?? []).entries()) {
    const m = dataUrl.match(/^data:([^;]+);/);
    await pool.query(
      `INSERT INTO tickets.ticket_attachments (ticket_id, filename, data_url, mime_type)
       VALUES ($1, $2, $3, $4)`,
      [newId, `screenshot-${idx + 1}`, dataUrl, m ? m[1] : 'application/octet-stream']);
  }
  return 1;
}
```

- [ ] **Step 2: Add reporter→customer auto-link in bug-report.ts**

Modify `website/src/pages/api/bug-report.ts`. Add to the imports near the top:

```typescript
import { linkReporterByEmail } from '../../lib/tickets/reporter-link';
```

After the existing `await insertBugTicket({...})` call (around line 83), add:

```typescript
    await linkReporterByEmail(email).catch(err =>
      console.error('[bug-report] reporter-link failed:', err));
```

- [ ] **Step 3: Local smoke**

Start dev: `task website:dev` (different terminal). Then:
```bash
curl -X POST http://localhost:4321/api/bug-report \
  -F 'description=test from plan' \
  -F 'email=plan-test@example.com' \
  -F 'category=fehler'
```
Expected: `{"success":true,"ticketId":"BR-..."}`. Check DB:
```bash
psql "$PGURL" -c "SELECT external_id, type, status, reporter_email FROM tickets.tickets ORDER BY created_at DESC LIMIT 1"
```
Expected: one row with the BR-ID, type=bug, status=triage.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/bug-report.ts website/src/lib/website-db.ts
git commit -m "feat(tickets): bug-report API writes to tickets.tickets directly"
```

---

## Task 11: Rewire reader functions in website-db.ts

The reader functions (`listBugTickets`, `getBugTicketStatus`, `getBugTicketWithComments`, `appendBugTicketComment`) are called by `/admin/bugs`, `/admin/bugs/[id]`, and the inbox. They keep their signatures but read from `tickets.*`.

**Files:**
- Modify: `website/src/lib/website-db.ts`

- [ ] **Step 1: Rewrite `listBugTickets` (around line 2688)**

Replace the body with:

```typescript
export async function listBugTickets(filters: {
  status?: string;
  category?: string;
  brand?: string;
  q?: string;
}): Promise<BugTicketRow[]> {
  const where: string[] = [`t.type = 'bug'`];
  const vals: unknown[] = [];
  if (filters.brand) {
    vals.push(filters.brand);
    where.push(`t.brand = $${vals.length}`);
  }
  if (filters.status) {
    // Map legacy filter values back to new status set
    const map: Record<string, string[]> = {
      open:     ['triage','backlog','in_progress','in_review','blocked'],
      resolved: ['done'],
      archived: ['archived'],
    };
    const list = map[filters.status] ?? [filters.status];
    vals.push(list);
    where.push(`t.status = ANY($${vals.length}::text[])`);
  }
  if (filters.category) {
    vals.push(`kind:${filters.category}`);
    where.push(`EXISTS (SELECT 1 FROM tickets.ticket_tags tt
                          JOIN tickets.tags g ON g.id = tt.tag_id
                         WHERE tt.ticket_id = t.id AND g.name = $${vals.length})`);
  }
  if (filters.q) {
    vals.push(filters.q);
    where.push(`(t.description ILIKE '%' || $${vals.length} || '%'
                 OR t.reporter_email ILIKE '%' || $${vals.length} || '%')`);
  }
  const sql = `
    SELECT t.external_id   AS "ticketId",
           COALESCE(SPLIT_PART(g.name, ':', 2), '') AS category,
           t.reporter_email AS "reporterEmail",
           t.description,
           t.url,
           t.brand,
           CASE t.status WHEN 'done' THEN 'resolved'
                         WHEN 'archived' THEN 'archived' ELSE 'open' END AS status,
           t.created_at    AS "createdAt",
           t.done_at       AS "resolvedAt",
           NULL            AS "resolutionNote",
           (SELECT pr_number FROM tickets.ticket_links
              WHERE from_id = t.id AND kind = 'fixes' AND pr_number IS NOT NULL
              ORDER BY created_at DESC LIMIT 1) AS "fixedInPr",
           (SELECT created_at FROM tickets.ticket_links
              WHERE from_id = t.id AND kind = 'fixes' AND pr_number IS NOT NULL
              ORDER BY created_at DESC LIMIT 1) AS "fixedAt"
      FROM tickets.tickets t
      LEFT JOIN tickets.ticket_tags tt ON tt.ticket_id = t.id
      LEFT JOIN tickets.tags g ON g.id = tt.tag_id AND g.name LIKE 'kind:%'
     WHERE ${where.join(' AND ')}
     ORDER BY t.created_at DESC`;
  const r = await pool.query(sql, vals);
  return r.rows;
}
```

- [ ] **Step 2: Rewrite `getBugTicketStatus`, `getBugTicketWithComments`, and `appendBugTicketComment`**

For `getBugTicketStatus` (around line 660):

```typescript
export async function getBugTicketStatus(ticketId: string): Promise<BugTicketStatus | null> {
  const r = await pool.query(
    `SELECT external_id AS "ticketId",
            CASE status WHEN 'done' THEN 'resolved'
                        WHEN 'archived' THEN 'archived' ELSE 'open' END AS status,
            (SELECT SPLIT_PART(g.name, ':', 2)
               FROM tickets.ticket_tags tt JOIN tickets.tags g ON g.id = tt.tag_id
              WHERE tt.ticket_id = t.id AND g.name LIKE 'kind:%' LIMIT 1) AS category,
            created_at AS "createdAt",
            done_at AS "resolvedAt",
            NULL AS "resolutionNote",
            (SELECT pr_number FROM tickets.ticket_links
              WHERE from_id = t.id AND kind = 'fixes' AND pr_number IS NOT NULL
              ORDER BY created_at DESC LIMIT 1) AS "fixedInPr",
            (SELECT created_at FROM tickets.ticket_links
              WHERE from_id = t.id AND kind = 'fixes' AND pr_number IS NOT NULL
              ORDER BY created_at DESC LIMIT 1) AS "fixedAt"
       FROM tickets.tickets t
      WHERE t.type = 'bug' AND t.external_id = $1`,
    [ticketId]);
  return r.rows[0] ?? null;
}
```

For `getBugTicketWithComments` (around line 684) — replace the SQL inside with a `tickets.*` query of the same shape, and the comments fetch with `SELECT id, $1::text AS "ticketId", author_label AS author, kind, body, created_at AS "createdAt" FROM tickets.ticket_comments WHERE ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = $1) ORDER BY created_at ASC`.

For `appendBugTicketComment`:

```typescript
export async function appendBugTicketComment(params: {
  ticketId: string;
  author: string;
  body: string;
  kind?: 'comment' | 'status_change' | 'system';
}): Promise<BugTicketComment> {
  const r = await pool.query(
    `INSERT INTO tickets.ticket_comments
       (ticket_id, author_label, kind, body, visibility)
     SELECT id, $2, $3, $4, 'internal' FROM tickets.tickets
      WHERE type = 'bug' AND external_id = $1
     RETURNING id, $1::text AS "ticketId", author_label AS author, kind, body, created_at AS "createdAt"`,
    [params.ticketId, params.author, params.kind ?? 'comment', params.body]);
  return r.rows[0];
}
```

- [ ] **Step 3: Rewrite `resolveBugTicket`, `archiveBugTicket`, `reopenBugTicket` to delegate to `transitionTicket()`**

```typescript
import { transitionTicket } from './tickets/transition';

async function ticketIdByExternal(externalId: string): Promise<string | null> {
  const r = await pool.query(
    `SELECT id FROM tickets.tickets WHERE type = 'bug' AND external_id = $1`,
    [externalId]);
  return r.rows[0]?.id ?? null;
}

export async function resolveBugTicket(ticketId: string, resolutionNote: string,
                                       actor: { id?: string; label: string } = { label: 'admin' }
): Promise<void> {
  const id = await ticketIdByExternal(ticketId);
  if (!id) throw new Error(`bug ${ticketId} not found`);
  await transitionTicket(id, {
    status: 'done', resolution: 'fixed',
    note: resolutionNote, noteVisibility: 'public',
    actor,
  });
  await pool.query(
    `UPDATE inbox_items SET status = 'actioned', actioned_at = NOW()
      WHERE bug_ticket_id = $1 AND status = 'pending'`, [ticketId]);
}

export async function archiveBugTicket(ticketId: string,
                                       actor: { id?: string; label: string } = { label: 'admin' }
): Promise<void> {
  const id = await ticketIdByExternal(ticketId);
  if (!id) return;
  await transitionTicket(id, {
    status: 'archived', resolution: 'obsolete', actor,
  });
  await pool.query(
    `UPDATE inbox_items SET status = 'archived', actioned_at = NOW()
      WHERE bug_ticket_id = $1 AND status = 'pending'`, [ticketId]);
}

export async function reopenBugTicket(ticketId: string, author: string,
                                      reason?: string): Promise<void> {
  const id = await ticketIdByExternal(ticketId);
  if (!id) throw new Error(`ticket ${ticketId} not found`);
  // Manual reopen → backlog (per spec §6)
  await transitionTicket(id, {
    status: 'backlog',
    note: reason,
    actor: { label: author },
  });
}
```

- [ ] **Step 4: Drop `initBugTicketsTable()` and `initBugTicketCommentsTable()` invocations**

Search for `initBugTicketsTable` and `initBugTicketCommentsTable` calls — replace each with `await initTicketsSchema()`. Add the import:

```typescript
import { initTicketsSchema } from './tickets-db';
```

- [ ] **Step 5: Type-check**

Run: `cd website && npx tsc --noEmit`
Expected: clean (or only pre-existing errors unrelated to your changes).

- [ ] **Step 6: Smoke**

```bash
curl -s 'https://web.mentolder.de/admin/bugs?status=resolved' -b "$ADMIN_COOKIE" | grep -c 'BR-'
```
Expected: ≥ count of resolved bugs in the system.

- [ ] **Step 7: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(tickets): rewire bug reader/writer functions to tickets.tickets"
```

---

## Task 12: Rewire `/api/admin/bugs/resolve.ts`

**Files:**
- Modify: `website/src/pages/api/admin/bugs/resolve.ts`

- [ ] **Step 1: Replace the resolve call with explicit actor passing**

The existing handler already calls `resolveBugTicket(ticketId, resolutionNote)`. After Task 11, that already routes through `transitionTicket`, but the actor label defaults to `'admin'`. Pass the real session user:

Replace lines 51-57 in `website/src/pages/api/admin/bugs/resolve.ts`:

```typescript
  try {
    await resolveBugTicket(ticketId, resolutionNote,
      { label: session.preferred_username });
    // status_change comment is now created by transitionTicket; remove the duplicate append below.
  } catch (err) { /* unchanged */ }
```

Delete the now-redundant `appendBugTicketComment` block below `resolveBugTicket`.

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/api/admin/bugs/resolve.ts
git commit -m "fix(tickets): admin bug-resolve passes session user to transitionTicket"
```

---

## Task 13: Rewire inbox `resolve_bug` action — the broken email path

**Files:**
- Modify: `website/src/pages/api/admin/inbox/[id]/action.ts`

- [ ] **Step 1: Locate and replace the `resolve_bug` case**

Find the case beginning at around line 200 (`case 'resolve_bug':` or similar — search for `info@${p.brand}`). Replace the entire case body with:

```typescript
      case 'resolve_bug': {
        if (!resolveNote) {
          return new Response(JSON.stringify({ error: 'Bitte geben Sie eine Notiz an.' }), { status: 400 });
        }
        if (resolveNote.length > 500) {
          return new Response(JSON.stringify({ error: 'Max. 500 Zeichen.' }), { status: 400 });
        }
        const p = item.payload as { ticketId: string; reporterEmail: string; brand: string };
        await resolveBugTicket(p.ticketId, resolveNote,
          { label: session.preferred_username });
        // No manual sendEmail() here — transitionTicket() handles the close-mail.
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true }),
          { headers: { 'Content-Type': 'application/json' } });
      }
```

- [ ] **Step 2: Remove now-unused `sendEmail` import if it was only used here**

Check `grep -n 'sendEmail\|PROD_DOMAIN' website/src/pages/api/admin/inbox/[id]/action.ts`. If those are only used by the old resolve_bug path, remove them.

- [ ] **Step 3: Smoke**

Resolve a test bug from the inbox UI on `/admin/inbox`, then check Mailpit:
```bash
kubectl --context mentolder -n workspace port-forward svc/mailpit 8025:8025 &
PFP=$!
sleep 2
curl -s http://localhost:8025/api/v1/messages | jq '.messages[0] | {to: .To, subject: .Subject}'
kill $PFP
```
Expected: `to[0].Address == "rep-test@example.com"` (the reporter), `subject` starts with `[BR-`. **This is the fix verification — the reporter is now in the To: line.**

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/admin/inbox/[id]/action.ts
git commit -m "fix(tickets): inbox resolve_bug emails reporter (was: info@brand, reporter only in Reply-To)"
```

---

## Task 14: Rewire `scripts/track-pr.mjs` — auto-close goes through `transitionTicket()`

**Files:**
- Modify: `scripts/track-pr.mjs`

- [ ] **Step 1: Replace the `bugs.bug_tickets` UPDATE block**

Find lines 74-81 (the `for (const ticketId of row.bug_refs)` loop). Replace with:

```javascript
  // Map external_id (BR-...) → ticket UUID, then transition through the unified service.
  // We do this with raw SQL because track-pr.mjs runs as a Node script outside the website
  // process, so we can't import the TypeScript transitionTicket directly. The CHECK constraint
  // on (status, resolution) plus the audit trigger keep the result equivalent.
  for (const externalId of row.bug_refs) {
    const r = await pgClient.query(
      `SELECT id, status, reporter_email FROM tickets.tickets
        WHERE type = 'bug' AND external_id = $1`, [externalId]);
    if (r.rowCount === 0) {
      console.log(`skip ${externalId}: not found in tickets.tickets`);
      continue;
    }
    const t = r.rows[0];
    if (t.status === 'done' || t.status === 'archived') {
      // already closed — just record the link
      await pgClient.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number)
         VALUES ($1, $1, 'fixes', $2) ON CONFLICT DO NOTHING`,
        [t.id, row.pr_number]);
      continue;
    }
    await pgClient.query('BEGIN');
    try {
      await pgClient.query(`SELECT set_config('app.user_label', 'github-bot', true)`);
      await pgClient.query(
        `UPDATE tickets.tickets SET status = 'done', resolution = 'fixed' WHERE id = $1`,
        [t.id]);
      await pgClient.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number)
         VALUES ($1, $1, 'fixes', $2) ON CONFLICT DO NOTHING`,
        [t.id, row.pr_number]);
      await pgClient.query('COMMIT');
    } catch (e) {
      await pgClient.query('ROLLBACK').catch(() => {});
      throw e;
    }
    // Reporter notification — call the website API so the email pipeline runs in-process.
    if (t.reporter_email) {
      const apiUrl = process.env.WEBSITE_API_URL ?? 'https://web.mentolder.de';
      try {
        await fetch(`${apiUrl}/api/internal/tickets/notify-close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',
                     'X-Internal-Token': process.env.INTERNAL_API_TOKEN ?? '' },
          body: JSON.stringify({ externalId, resolution: 'fixed' }),
        });
      } catch (e) {
        console.error(`notify-close failed for ${externalId}: ${e.message}`);
      }
    }
  }
```

- [ ] **Step 2: Add the internal notify endpoint**

Create `website/src/pages/api/internal/tickets/notify-close.ts`:

```typescript
import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';
import { sendBugCloseEmail } from '../../../../lib/tickets/email-templates';

const TOKEN = process.env.INTERNAL_API_TOKEN ?? '';

export const POST: APIRoute = async ({ request }) => {
  if (!TOKEN || request.headers.get('x-internal-token') !== TOKEN) {
    return new Response('forbidden', { status: 403 });
  }
  const body = await request.json() as { externalId: string; resolution: string };
  const r = await pool.query(
    `SELECT external_id, reporter_email FROM tickets.tickets
      WHERE type = 'bug' AND external_id = $1`, [body.externalId]);
  if (r.rowCount === 0) return new Response('not found', { status: 404 });
  const t = r.rows[0];
  if (!t.reporter_email) return new Response(JSON.stringify({ ok: true, skipped: true }),
    { headers: { 'Content-Type': 'application/json' } });
  const sent = await sendBugCloseEmail({
    externalId: t.external_id,
    reporterEmail: t.reporter_email,
    resolution: body.resolution,
  });
  return new Response(JSON.stringify({ ok: true, sent }),
    { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3: Add `INTERNAL_API_TOKEN` to env**

Append to `environments/.secrets/mentolder.yaml` (gitignored):
```yaml
INTERNAL_API_TOKEN: <generate with `openssl rand -hex 32`>
```
Then: `task env:seal ENV=mentolder` and same for korczewski.

Add `INTERNAL_API_TOKEN` to the env list in `environments/schema.yaml` so `env:validate` accepts it.
Add it to the website Deployment env-from-secret in `k3d/website.yaml` (Sealed Secret block).

- [ ] **Step 4: Verify the test for track-pr still passes**

Run: `node scripts/track-pr.test.mjs` (existing test at `scripts/track-pr.test.mjs`)
Expected: PASS. Update test fixtures if it explicitly asserts the old `bugs.bug_tickets` UPDATE.

- [ ] **Step 5: Commit**

```bash
git add scripts/track-pr.mjs website/src/pages/api/internal/tickets/notify-close.ts \
  environments/sealed-secrets/mentolder.yaml environments/sealed-secrets/korczewski.yaml \
  environments/schema.yaml k3d/website.yaml
git commit -m "fix(tickets): PR-merge auto-close transitions to done (not archived) and notifies reporter"
```

---

## Task 15: End-to-end test — bug-report → admin resolve → reporter receives email

**Files:**
- Create: `tests/e2e/specs/fa-bugs-notifications.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
// tests/e2e/specs/fa-bugs-notifications.spec.ts
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://web.mentolder.de';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'patrick';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS!;

test('FA-bug-notify: reporter receives close-mail when admin resolves ticket', async ({ page, request }) => {
  const reporter = `e2e-${Date.now()}@example.com`;

  // 1. Submit public bug report
  const create = await request.post(`${BASE}/api/bug-report`, {
    multipart: {
      description: 'E2E notification test',
      email: reporter,
      category: 'fehler',
      url: '/test',
    },
  });
  expect(create.ok()).toBeTruthy();
  const { ticketId } = await create.json();
  expect(ticketId).toMatch(/^BR-/);

  // 2. Admin login + resolve
  await page.goto(`${BASE}/auth/login?next=/admin/bugs`);
  await page.fill('input[name=username]', ADMIN_USER);
  await page.fill('input[name=password]', ADMIN_PASS);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/admin\/bugs/);

  await page.goto(`${BASE}/admin/bugs/${ticketId}`);
  await page.fill('textarea[name=resolutionNote]', 'fixed in plan E2E');
  await page.click('button:has-text("Erledigt")');
  await page.waitForLoadState('networkidle');

  // 3. Verify reporter received the email (Mailpit)
  await new Promise(r => setTimeout(r, 1500));
  const mail = await request.get(`${MAILPIT}/api/v1/search?query=to:${reporter}`);
  const data = await mail.json() as { messages: Array<{ Subject: string; To: Array<{ Address: string }> }> };
  expect(data.messages.length).toBeGreaterThan(0);
  const m = data.messages[0];
  expect(m.Subject).toContain(ticketId);
  expect(m.To.some(t => t.Address === reporter)).toBeTruthy();
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/specs/fa-bugs-notifications.spec.ts`
Expected: 1 PASS. The spec depends on Mailpit being reachable from the test runner — for prod tests, port-forward Mailpit first or set `MAILPIT_URL` to the in-cluster URL via a kubectl proxy.

- [ ] **Step 3: Add to test runner registry**

Open `tests/runner.sh` — find the test ID registry block. Add: `FA-BUG-NOTIFY|fa-bugs-notifications.spec.ts|Bug close-notification email reaches reporter`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/fa-bugs-notifications.spec.ts tests/runner.sh
git commit -m "test(tickets): E2E bug-report -> admin resolve -> reporter receives email"
```

---

## Task 16: Deploy + production smoke

**Files:** none

- [ ] **Step 1: Deploy**

```bash
task website:deploy ENV=mentolder
task website:deploy ENV=korczewski
```
Expected: both pods healthy after deploy.

- [ ] **Step 2: Run migration on prod (mentolder first)**

```bash
task workspace:port-forward ENV=mentolder &
PFP=$!
sleep 3
TRACKING_DB_URL="postgres://postgres:$(kubectl --context mentolder -n workspace get secret workspace-secrets -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)@localhost:5432/website" \
  node scripts/migrate-bugs-to-tickets.mjs --apply
kill $PFP
```
Expected output: `{"inserted":N,"skipped":0,"mode":"apply"}` where N = current bug count.

Repeat for korczewski:
```bash
task workspace:port-forward ENV=korczewski &
# … same as above, --context korczewski, password from korczewski cluster
```

- [ ] **Step 3: Smoke `/admin/bugs` on both brands**

Open `https://web.mentolder.de/admin/bugs` and `https://web.korczewski.de/admin/bugs`. Expected: same ticket count + same filters as before deploy.

- [ ] **Step 4: Smoke the close-mail with a real reporter**

Submit a test bug at `https://web.mentolder.de` (use a personal email you can check). Resolve it from `/admin/bugs/[id]`. Verify the email arrives in your inbox within ~1 minute.

- [ ] **Step 5: Run the offline test bundle**

```bash
task test:all
```
Expected: all passing.

- [ ] **Step 6: Open the PR**

```bash
git push -u origin <branch>
gh pr create --title "feat(tickets): unify bug reports into tickets schema (PR1/5)" --body "$(cat <<'EOF'
## Summary
- Stand up new `tickets` Postgres schema with full ticket model from spec §5.
- Migrate `bugs.bug_tickets` → `tickets.tickets` (type=`bug`); old table → backward-compat view.
- Add `transitionTicket()` service — single writer of `status`. All three close paths (admin resolve, inbox resolve, PR-merge auto-close) now route through it.
- **Fixes the missed-reporter-notification bug**: reporters are now emailed on ticket close. The inbox path used to email `info@<brand>` with the reporter only in `Reply-To`; the admin-resolve and PR-merge paths sent no email at all.
- Auto-link `reporter_email` → `customers.id` when a Keycloak-linked customer exists.

Spec: `docs/superpowers/specs/2026-05-08-unified-ticketing-design.md`
Plan: `docs/superpowers/plans/2026-05-08-unified-ticketing-pr1.md`

## Test plan
- [ ] BATS migration tests pass (row counts, idempotency, comment + link copy)
- [ ] BATS transition state-machine tests pass
- [ ] Playwright `fa-bugs-notifications.spec.ts` passes (reporter receives email)
- [ ] `/admin/bugs` lists same tickets pre/post deploy on both brands
- [ ] Public bug-report form still mints BR-IDs and stores screenshots
- [ ] Manual: real close-mail arrives at reporter inbox

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage check (against `docs/superpowers/specs/2026-05-08-unified-ticketing-design.md` §9 PR1):**
- ✅ Create `tickets` schema with all tables — Tasks 1-3
- ✅ DB triggers (cycle prevention, lifecycle timestamps, audit log) — Tasks 2, 3
- ✅ Migrate `bugs.bug_tickets` → `tickets.tickets` — Task 7
- ✅ Migrate `bugs.bug_ticket_comments` → `tickets.ticket_comments` — Task 8
- ✅ Inline screenshots → `tickets.ticket_attachments` — Task 8
- ✅ Reporter→customer auto-link batch — Task 4 + invocation in Task 10 + migration in Task 7
- ✅ `transitionTicket()` service — Task 6
- ✅ Rewire `/api/admin/bugs/resolve.ts` — Task 12
- ✅ Rewire inbox `resolve_bug` action — Task 13
- ✅ Rewire `track-pr.mjs` ingest — Task 14
- ✅ Close-mail To=reporter, BCC=`info@<brand>` — Task 5 + Task 13 verification
- ✅ `/admin/bugs` keeps working visually identical — Task 11 (signature-preserving rewrites)
- ✅ `bugs.bug_tickets` becomes a SQL view — Task 9
- ✅ BATS migration verification — Tasks 7, 8
- ✅ Playwright bug-report → resolve → email E2E — Task 15

**Type consistency:** `transitionTicket()` signature matches across Tasks 6, 11, 12, 13. `TicketStatus` and `TicketResolution` types used consistently. `linkReporterByEmail()` signature matches across Tasks 4, 7, 10. `sendBugCloseEmail()` parameters match across Tasks 5, 14.

**Placeholder scan:** No "TBD"/"TODO"/"implement later" markers; every code-changing step has a code block; every test step has expected output; every migration step has a verifiable post-condition.

**Risk callouts:**
- Task 9 (table rename + view) is the irreversible step. The migration script is idempotent for inserts but the rename only runs once. Take a `task workspace:backup` before running on prod.
- Task 11's reader-function rewrites are signature-preserving but the underlying SQL changed dramatically — exercise the admin/bugs page visually before promoting from mentolder to korczewski.
- Task 14 introduces an `INTERNAL_API_TOKEN` that the GitHub-Actions ingest cron must have. Make sure the `tracking-import` CronJob's env-from-secret includes it.
