// Unit tests for src/lib/appointments-db.ts.
//
// appointments-db.ts imports the module-level `pool` singleton from
// ./db-pool (a real pg.Pool constructed at import time), so — following the
// pattern in documents-db.test.ts / website-db-init-hotpath.test.ts — we
// swap `pg` for a pg-mem-backed Pool BEFORE anything imports db-pool, and
// stub `dns` (db-pool.ts imports it for a custom `lookup`).
//
// `initTicketsSchema` (from ./tickets-schema) runs a large multi-statement
// DDL graph (triggers, CHECK constraints, advisory locks) that pg-mem can't
// fully execute, so we stub it to a no-op and hand-create the minimal
// `tickets.tickets` / `customers` / `meetings` shape appointments-db.ts
// actually queries.

// isSlotInAnyWindow reads local getHours()/getMinutes(); pin TZ=UTC so our
// fixture Date objects (constructed from naive local-time strings) line up
// deterministically with the HH:MM window boundaries stored in Postgres.
process.env.TZ = 'UTC';

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('pg', () => {
  const { newDb, DataType } = require('pg-mem') as typeof import('pg-mem');
  const mem = newDb();
  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    },
  });

  // pg-mem implements very few native functions — getFreeTimeWindows() uses
  // to_char(date/time, fmt) to format YYYY-MM-DD / HH24:MI strings. Provide a
  // minimal implementation covering the two formats this module actually uses.
  const toCharImpl = (value: unknown, fmt: string) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    if (fmt === 'YYYY-MM-DD') {
      const d = new Date(value as string | Date);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    if (fmt === 'HH24:MI') {
      // pg-mem represents `time` columns as "HH:MM:SS(.sss)" strings, not Dates.
      if (typeof value === 'string') {
        const [h, m] = value.split(':');
        return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
      }
      const d = new Date(value as Date);
      return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    }
    return String(value);
  };
  mem.public.registerFunction({
    name: 'to_char',
    args: [DataType.date, DataType.text],
    returns: DataType.text,
    implementation: toCharImpl,
  });
  mem.public.registerFunction({
    name: 'to_char',
    args: [DataType.time, DataType.text],
    returns: DataType.text,
    implementation: toCharImpl,
  });

  mem.public.none(`
    CREATE TABLE public.brands (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    INSERT INTO public.brands (id, name) VALUES ('mentolder', 'mentolder'), ('korczewski', 'korczewski');

    CREATE TABLE customers (
      id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name  TEXT,
      email TEXT
    );

    CREATE SCHEMA tickets;
    CREATE TABLE tickets.tickets (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type        TEXT NOT NULL,
      parent_id   UUID,
      brand       TEXT NOT NULL REFERENCES public.brands(id),
      title       TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'triage',
      priority    TEXT NOT NULL DEFAULT 'mittel',
      customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
      start_date  DATE,
      due_date    DATE
    );

    CREATE TABLE meetings (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id     UUID NOT NULL REFERENCES customers(id),
      meeting_type    TEXT NOT NULL,
      scheduled_at    TIMESTAMPTZ,
      talk_room_token TEXT,
      status          TEXT NOT NULL DEFAULT 'scheduled'
    );

    -- Pre-seeded here (pg-mem's AST-coverage check rejects the production
    -- CREATE TABLE for these — composite PK + column-level REFERENCES ... ON
    -- UPDATE CASCADE ON DELETE RESTRICT trips an unsupported-syntax check).
    -- The matching production init*Table() calls are swallowed as no-ops by
    -- DdlSkippingPool below.
    CREATE TABLE booking_project_links (
      caldav_uid   TEXT NOT NULL,
      brand        TEXT NOT NULL,
      project_id   UUID,
      leistung_key TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (caldav_uid, brand)
    );

    CREATE TABLE booking_invoice_links (
      caldav_uid     TEXT NOT NULL,
      brand          TEXT NOT NULL,
      invoice_id     TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      amount         NUMERIC(10,2) NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (caldav_uid, brand)
    );

    CREATE TABLE slot_whitelist (
      brand      TEXT NOT NULL,
      slot_start TIMESTAMPTZ NOT NULL,
      slot_end   TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (brand, slot_start)
    );

    CREATE TABLE free_time_windows (
      id         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      brand      TEXT NOT NULL,
      date       DATE NOT NULL,
      win_start  TIME NOT NULL,
      win_end    TIME NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (id)
    );
  `);

  const { Pool: MemPool } = mem.adapters.createPg();
  const PRESEEDED_TABLES = ['booking_project_links', 'booking_invoice_links', 'slot_whitelist', 'free_time_windows'];

  // The production init*Table() helpers in appointments-db.ts send a single
  // multi-statement query: `CREATE TABLE IF NOT EXISTS ...; DO $$ ... $$;`
  // (the DO block adds a FK constraint NOT VALID, guarded by a pg_constraint
  // existence check). pg-mem has no plpgsql support and its AST-coverage
  // check also rejects the composite-PK-plus-column-REFERENCES CREATE TABLE
  // shape these helpers use — so we swallow the whole statement for tables we
  // already pre-seeded above, and otherwise just strip the DO block (harmless
  // no-op FK addition) before executing.
  class DdlSkippingPool extends (MemPool as unknown as new (...a: unknown[]) => {
    query(t: unknown, v?: unknown): Promise<unknown>;
  }) {
    override query(textOrConfig: unknown, values?: unknown): Promise<unknown> {
      if (typeof textOrConfig === 'string') {
        if (PRESEEDED_TABLES.some((t) => new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`, 'i').test(textOrConfig))) {
          return Promise.resolve({ rows: [], rowCount: 0 });
        }
        if (/DO \$\$/i.test(textOrConfig)) {
          const stripped = textOrConfig.replace(/DO \$\$[\s\S]*?END \$\$;?/gi, '');
          if (stripped.trim() === '') return Promise.resolve({ rows: [], rowCount: 0 });
          return super.query(stripped, values as never);
        }
      }
      return super.query(textOrConfig, values as never);
    }
  }

  return { default: { Pool: DdlSkippingPool }, Pool: DdlSkippingPool };
});

vi.mock('dns', () => ({ default: { resolve4: vi.fn() }, resolve4: vi.fn() }));

// initTicketsSchema does complex multi-statement DDL pg-mem can't execute;
// the tables it would create already exist above, so make it a no-op.
vi.mock('./tickets-schema', () => ({
  initTicketsSchema: vi.fn().mockResolvedValue(undefined),
}));

import { pool } from './db-pool';
import {
  listTasksInMonth,
  listProjectsInMonth,
  listMeetingsInRange,
  setBookingProject,
  getBookingProjects,
  getBookingLeistungen,
  setBookingInvoice,
  getBookingInvoices,
  getWhitelistedSlots,
  addSlotToWhitelist,
  removeSlotFromWhitelist,
  isSlotWhitelisted,
  claimSlot,
  getFreeTimeWindows,
  addFreeTimeWindow,
  removeFreeTimeWindow,
  isSlotInAnyWindow,
} from './appointments-db';

async function seedCustomer(name: string, email: string): Promise<string> {
  const r = await pool.query(`INSERT INTO customers (name, email) VALUES ($1, $2) RETURNING id`, [name, email]);
  return r.rows[0].id as string;
}

async function seedTicket(opts: {
  type: string;
  title: string;
  brand?: string;
  parentId?: string | null;
  status?: string;
  priority?: string;
  customerId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
}): Promise<string> {
  const r = await pool.query(
    `INSERT INTO tickets.tickets (type, title, brand, parent_id, status, priority, customer_id, start_date, due_date)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'triage'), COALESCE($6, 'mittel'), $7, $8::date, $9::date)
     RETURNING id`,
    [
      opts.type,
      opts.title,
      opts.brand ?? 'mentolder',
      opts.parentId ?? null,
      opts.status ?? null,
      opts.priority ?? null,
      opts.customerId ?? null,
      opts.startDate ?? null,
      opts.dueDate ?? null,
    ],
  );
  return r.rows[0].id as string;
}

beforeAll(async () => {
  // Trigger lazy table-init helpers once so beforeEach TRUNCATEs have targets.
  await getWhitelistedSlots('mentolder');
  await getFreeTimeWindows('mentolder');
  await getBookingProjects(['x'], 'mentolder');
  await getBookingInvoices(['x'], 'mentolder');
});

beforeEach(async () => {
  await pool.query(`DELETE FROM tickets.tickets`);
  await pool.query(`DELETE FROM meetings`);
  await pool.query(`DELETE FROM customers`);
  await pool.query(`TRUNCATE slot_whitelist`);
  await pool.query(`TRUNCATE free_time_windows`);
  await pool.query(`TRUNCATE booking_project_links`);
  await pool.query(`TRUNCATE booking_invoice_links`);
});

describe('listTasksInMonth', () => {
  it('returns [] when there are no tasks', async () => {
    expect(await listTasksInMonth(2026, 7)).toEqual([]);
  });

  it('returns tasks due within the month, with project name resolved through parent chain', async () => {
    const project = await seedTicket({ type: 'project', title: 'Root Project' });
    const task = await seedTicket({
      type: 'task',
      title: 'Do the thing',
      parentId: project,
      dueDate: '2026-07-15',
      priority: 'hoch',
    });
    const tasks = await listTasksInMonth(2026, 7);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(task);
    expect(tasks[0].name).toBe('Do the thing');
    expect(tasks[0].projectName).toBe('Root Project');
    expect(tasks[0].priority).toBe('hoch');
    expect(tasks[0].status).toBe('entwurf');
  });

  it('excludes tasks due outside the month', async () => {
    const project = await seedTicket({ type: 'project', title: 'P' });
    await seedTicket({ type: 'task', title: 'Out of range', parentId: project, dueDate: '2026-08-01' });
    expect(await listTasksInMonth(2026, 7)).toEqual([]);
  });

  it('excludes non-task tickets', async () => {
    await seedTicket({ type: 'project', title: 'Just a project', dueDate: '2026-07-15' });
    expect(await listTasksInMonth(2026, 7)).toEqual([]);
  });
});

describe('listProjectsInMonth', () => {
  it('returns [] with no projects', async () => {
    expect(await listProjectsInMonth(2026, 7)).toEqual([]);
  });

  it('returns top-level projects overlapping the month window with customer info', async () => {
    const customerId = await seedCustomer('Acme', 'acme@example.com');
    const p = await seedTicket({
      type: 'project',
      title: 'Website Relaunch',
      customerId,
      startDate: '2026-07-01',
      dueDate: '2026-07-20',
    });
    const projects = await listProjectsInMonth(2026, 7);
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe(p);
    expect(projects[0].customerName).toBe('Acme');
  });

  it('excludes archived/done projects', async () => {
    await seedTicket({ type: 'project', title: 'Done project', status: 'done', dueDate: '2026-07-10' });
    await seedTicket({ type: 'project', title: 'Archived project', status: 'archived', dueDate: '2026-07-10' });
    expect(await listProjectsInMonth(2026, 7)).toEqual([]);
  });

  it('excludes sub-projects (parent_id not null)', async () => {
    const parent = await seedTicket({ type: 'project', title: 'Parent', dueDate: '2026-07-10' });
    await seedTicket({ type: 'project', title: 'Sub', parentId: parent, dueDate: '2026-07-10' });
    const projects = await listProjectsInMonth(2026, 7);
    expect(projects.map((p) => p.name)).toEqual(['Parent']);
  });

  it('filters by brand when provided', async () => {
    await seedTicket({ type: 'project', title: 'Mentolder Project', brand: 'mentolder', dueDate: '2026-07-10' });
    await seedTicket({ type: 'project', title: 'Korczewski Project', brand: 'korczewski', dueDate: '2026-07-10' });
    const filtered = await listProjectsInMonth(2026, 7, 'korczewski');
    expect(filtered.map((p) => p.name)).toEqual(['Korczewski Project']);
  });
});

describe('listMeetingsInRange', () => {
  it('returns [] with no meetings', async () => {
    expect(await listMeetingsInRange('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z')).toEqual([]);
  });

  it('returns meetings within range, excluding cancelled ones', async () => {
    const customerId = await seedCustomer('Bob', 'bob@example.com');
    await pool.query(
      `INSERT INTO meetings (customer_id, meeting_type, scheduled_at, status) VALUES ($1, 'consult', '2026-07-15T10:00:00Z', 'scheduled')`,
      [customerId],
    );
    await pool.query(
      `INSERT INTO meetings (customer_id, meeting_type, scheduled_at, status) VALUES ($1, 'consult', '2026-07-16T10:00:00Z', 'cancelled')`,
      [customerId],
    );
    await pool.query(
      `INSERT INTO meetings (customer_id, meeting_type, scheduled_at, status) VALUES ($1, 'consult', '2026-08-01T10:00:00Z', 'scheduled')`,
      [customerId],
    );
    const meetings = await listMeetingsInRange('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z');
    expect(meetings).toHaveLength(1);
    expect(meetings[0].customerName).toBe('Bob');
  });
});

describe('booking-project links', () => {
  it('getBookingProjects returns empty map for empty uid list', async () => {
    expect(await getBookingProjects([], 'mentolder')).toEqual(new Map());
  });

  it('setBookingProject inserts and getBookingProjects returns it', async () => {
    const projectId = await seedTicket({ type: 'project', title: 'P' });
    await setBookingProject('uid-1@x', projectId, 'mentolder');
    const map = await getBookingProjects(['uid-1@x'], 'mentolder');
    expect(map.get('uid-1@x')).toBe(projectId);
  });

  it('setBookingProject with leistungKey is retrievable via getBookingLeistungen', async () => {
    const projectId = await seedTicket({ type: 'project', title: 'P' });
    await setBookingProject('uid-2@x', projectId, 'mentolder', 'coaching-60');
    const map = await getBookingLeistungen(['uid-2@x'], 'mentolder');
    expect(map.get('uid-2@x')).toBe('coaching-60');
  });

  it('setBookingProject with null projectId deletes the link', async () => {
    const projectId = await seedTicket({ type: 'project', title: 'P' });
    await setBookingProject('uid-3@x', projectId, 'mentolder');
    await setBookingProject('uid-3@x', null, 'mentolder');
    const map = await getBookingProjects(['uid-3@x'], 'mentolder');
    expect(map.has('uid-3@x')).toBe(false);
  });

  it('setBookingProject upserts on conflict', async () => {
    const p1 = await seedTicket({ type: 'project', title: 'P1' });
    const p2 = await seedTicket({ type: 'project', title: 'P2' });
    await setBookingProject('uid-4@x', p1, 'mentolder');
    await setBookingProject('uid-4@x', p2, 'mentolder');
    const map = await getBookingProjects(['uid-4@x'], 'mentolder');
    expect(map.get('uid-4@x')).toBe(p2);
  });
});

describe('booking-invoice links', () => {
  it('getBookingInvoices returns empty map for empty uid list', async () => {
    expect(await getBookingInvoices([], 'mentolder')).toEqual(new Map());
  });

  it('setBookingInvoice inserts and getBookingInvoices returns it with numeric amount', async () => {
    await setBookingInvoice('uid-5@x', 'mentolder', 'inv-1', 'RE-0001', 123.45);
    const map = await getBookingInvoices(['uid-5@x'], 'mentolder');
    const info = map.get('uid-5@x');
    expect(info?.invoiceNumber).toBe('RE-0001');
    expect(info?.amount).toBeCloseTo(123.45);
  });

  it('setBookingInvoice upserts on conflict', async () => {
    await setBookingInvoice('uid-6@x', 'mentolder', 'inv-1', 'RE-0001', 100);
    await setBookingInvoice('uid-6@x', 'mentolder', 'inv-2', 'RE-0002', 200);
    const map = await getBookingInvoices(['uid-6@x'], 'mentolder');
    expect(map.get('uid-6@x')?.invoiceNumber).toBe('RE-0002');
  });
});

describe('slot whitelist', () => {
  it('getWhitelistedSlots returns [] when empty', async () => {
    expect(await getWhitelistedSlots('mentolder')).toEqual([]);
  });

  it('addSlotToWhitelist + getWhitelistedSlots round-trips future slots', async () => {
    const future = new Date(Date.now() + 7 * 86400000);
    const futureEnd = new Date(future.getTime() + 3600000);
    await addSlotToWhitelist('mentolder', future, futureEnd);
    const slots = await getWhitelistedSlots('mentolder');
    expect(slots).toHaveLength(1);
  });

  it('getWhitelistedSlots excludes past slots', async () => {
    const past = new Date(Date.now() - 7 * 86400000);
    const pastEnd = new Date(past.getTime() + 3600000);
    await addSlotToWhitelist('mentolder', past, pastEnd);
    expect(await getWhitelistedSlots('mentolder')).toEqual([]);
  });

  it('isSlotWhitelisted reflects presence, even for past slots', async () => {
    const past = new Date(Date.now() - 7 * 86400000);
    const pastEnd = new Date(past.getTime() + 3600000);
    await addSlotToWhitelist('mentolder', past, pastEnd);
    expect(await isSlotWhitelisted('mentolder', past)).toBe(true);
  });

  it('isSlotWhitelisted returns false for unknown slot', async () => {
    expect(await isSlotWhitelisted('mentolder', new Date())).toBe(false);
  });

  it('removeSlotFromWhitelist deletes the slot', async () => {
    const start = new Date(Date.now() + 86400000);
    const end = new Date(start.getTime() + 3600000);
    await addSlotToWhitelist('mentolder', start, end);
    await removeSlotFromWhitelist('mentolder', start);
    expect(await isSlotWhitelisted('mentolder', start)).toBe(false);
  });

  it('claimSlot atomically removes the slot and returns true when available', async () => {
    const start = new Date(Date.now() + 86400000);
    const end = new Date(start.getTime() + 3600000);
    await addSlotToWhitelist('mentolder', start, end);
    expect(await claimSlot('mentolder', start)).toBe(true);
    expect(await isSlotWhitelisted('mentolder', start)).toBe(false);
  });

  it('claimSlot returns false when the slot does not exist / already claimed', async () => {
    const start = new Date(Date.now() + 86400000);
    expect(await claimSlot('mentolder', start)).toBe(false);
  });

  it('addSlotToWhitelist upserts slot_end on conflict', async () => {
    const start = new Date(Date.now() + 86400000);
    const end1 = new Date(start.getTime() + 1800000);
    const end2 = new Date(start.getTime() + 3600000);
    await addSlotToWhitelist('mentolder', start, end1);
    await addSlotToWhitelist('mentolder', start, end2);
    const slots = await getWhitelistedSlots('mentolder');
    expect(slots).toHaveLength(1);
    expect(slots[0].slotEnd.getTime()).toBe(end2.getTime());
  });
});

describe('free time windows', () => {
  it('getFreeTimeWindows returns [] when empty', async () => {
    expect(await getFreeTimeWindows('mentolder')).toEqual([]);
  });

  it('addFreeTimeWindow + getFreeTimeWindows round-trips', async () => {
    const id = await addFreeTimeWindow('mentolder', '2026-07-10', '09:00', '12:00');
    expect(id).toBeDefined();
    const windows = await getFreeTimeWindows('mentolder');
    expect(windows).toHaveLength(1);
    expect(windows[0].date).toBe('2026-07-10');
    expect(windows[0].winStart).toBe('09:00');
    expect(windows[0].winEnd).toBe('12:00');
  });

  it('getFreeTimeWindows filters by fromDate/toDate', async () => {
    await addFreeTimeWindow('mentolder', '2026-07-05', '09:00', '10:00');
    await addFreeTimeWindow('mentolder', '2026-07-20', '09:00', '10:00');
    const windows = await getFreeTimeWindows('mentolder', '2026-07-10', '2026-07-31');
    expect(windows).toHaveLength(1);
    expect(windows[0].date).toBe('2026-07-20');
  });

  it('removeFreeTimeWindow deletes the window', async () => {
    const id = await addFreeTimeWindow('mentolder', '2026-07-10', '09:00', '12:00');
    await removeFreeTimeWindow('mentolder', id);
    expect(await getFreeTimeWindows('mentolder')).toEqual([]);
  });

  it('isSlotInAnyWindow returns true for a slot fully inside a window', async () => {
    await addFreeTimeWindow('mentolder', '2026-07-10', '09:00', '12:00');
    const slotStart = new Date('2026-07-10T09:30:00');
    const slotEnd = new Date('2026-07-10T10:30:00');
    expect(await isSlotInAnyWindow('mentolder', slotStart, slotEnd)).toBe(true);
  });

  it('isSlotInAnyWindow returns false for a slot outside any window', async () => {
    await addFreeTimeWindow('mentolder', '2026-07-10', '09:00', '12:00');
    const slotStart = new Date('2026-07-10T13:00:00');
    const slotEnd = new Date('2026-07-10T14:00:00');
    expect(await isSlotInAnyWindow('mentolder', slotStart, slotEnd)).toBe(false);
  });
});
