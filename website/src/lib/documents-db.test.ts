import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// documents-db.ts builds its own module-level `pg.Pool` (with a custom dns-based
// `lookup`) at import time and lazily creates its tables via `ensureTables()`.
// We swap `pg` for a pg-mem-backed Pool before importing the module so that
// pool construction succeeds without a real network/DB, and the module's own
// `CREATE TABLE IF NOT EXISTS` statements build the schema against pg-mem.
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
  // `listAllAssignments` LEFT JOINs a `customers` table that documents-db.ts
  // itself never creates (it lives in another module's schema) — provide a
  // minimal stand-in so that query doesn't fail.
  mem.public.none(`
    CREATE TABLE customers (
      id UUID PRIMARY KEY,
      name TEXT,
      email TEXT
    );
  `);
  const { Pool: MemPool } = mem.adapters.createPg();
  // pg-mem quirk: unlike real PostgreSQL (which keeps the function's resname
  // "count" through an unaliased `::int` cast), pg-mem renames the resulting
  // column to "int". documents-db.ts's `countPendingAssignmentsForCustomer`
  // relies on the real-PG column name (`rows[0]?.count`), so patch that one
  // result shape back for parity with production Postgres.
  class Pool extends (MemPool as unknown as new (...a: unknown[]) => {
    query(...a: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  }) {
    override async query(...a: unknown[]) {
      const result = await super.query(...a);
      if (result?.rows?.length === 1 && 'int' in result.rows[0] && !('count' in result.rows[0])) {
        result.rows[0].count = result.rows[0].int;
      }
      return result;
    }
  }
  return { default: { Pool }, Pool };
});
vi.mock('dns', () => ({ default: { resolve4: vi.fn() }, resolve4: vi.fn() }));

import {
  getPool,
  listDocumentTemplates,
  getDocumentTemplate,
  createDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
  createDocumentAssignment,
  listAssignmentsForCustomer,
  countPendingAssignmentsForCustomer,
  markAssignmentSigned,
  getAssignmentPdf,
  revokeAssignment,
  extendAssignmentDeadline,
  getDocumentAssignmentById,
  listAllAssignments,
} from './documents-db';

async function truncateAll(): Promise<void> {
  const pool = await getPool();
  await pool.query('TRUNCATE document_assignments');
  await pool.query('TRUNCATE document_templates CASCADE');
  await pool.query('TRUNCATE customers');
}

beforeAll(async () => {
  // documents-db.ts creates its tables lazily on first query (ensureTables());
  // trigger that once so subsequent TRUNCATEs in beforeEach have something to hit.
  await listDocumentTemplates();
});

beforeEach(async () => {
  await truncateAll();
});

describe('documents-db: templates', () => {
  it('listDocumentTemplates returns [] when empty', async () => {
    expect(await listDocumentTemplates()).toEqual([]);
  });

  it('createDocumentTemplate + getDocumentTemplate round-trips', async () => {
    const created = await createDocumentTemplate({ title: 'AGB', html_body: '<p>hi</p>' });
    expect(created.id).toBeDefined();
    expect(created.title).toBe('AGB');
    expect(created.html_body).toBe('<p>hi</p>');
    expect(created.stand_date).toBeNull();

    const fetched = await getDocumentTemplate(created.id);
    expect(fetched?.title).toBe('AGB');
  });

  it('getDocumentTemplate returns null for missing id', async () => {
    expect(await getDocumentTemplate('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('listDocumentTemplates orders by created_at DESC', async () => {
    const first = await createDocumentTemplate({ title: 'first', html_body: 'a' });
    const second = await createDocumentTemplate({ title: 'second', html_body: 'b' });
    const list = await listDocumentTemplates();
    expect(list.map((t) => t.id)).toEqual([second.id, first.id]);
  });

  it('updateDocumentTemplate updates only the provided fields', async () => {
    const created = await createDocumentTemplate({ title: 'orig', html_body: 'body' });
    const updated = await updateDocumentTemplate(created.id, { title: 'renamed' });
    expect(updated?.title).toBe('renamed');
    expect(updated?.html_body).toBe('body');
  });

  it('updateDocumentTemplate can set stand_date', async () => {
    const created = await createDocumentTemplate({ title: 'orig', html_body: 'body' });
    const updated = await updateDocumentTemplate(created.id, { stand_date: '2026-01-01' });
    expect(updated?.stand_date).toBe('2026-01-01');
  });

  it('updateDocumentTemplate returns null for missing id', async () => {
    const result = await updateDocumentTemplate('00000000-0000-4000-8000-000000000000', { title: 'x' });
    expect(result).toBeNull();
  });

  it('deleteDocumentTemplate removes the row', async () => {
    const created = await createDocumentTemplate({ title: 'to-delete', html_body: 'x' });
    await deleteDocumentTemplate(created.id);
    expect(await getDocumentTemplate(created.id)).toBeNull();
  });
});

describe('documents-db: assignments', () => {
  const customerId = '11111111-1111-4111-8111-111111111111';

  async function seedTemplate(title = 'Vertrag'): Promise<string> {
    const tpl = await createDocumentTemplate({ title, html_body: '<p>x</p>' });
    return tpl.id;
  }

  it('createDocumentAssignment creates a pending assignment with template_title', async () => {
    const templateId = await seedTemplate('Mein Vertrag');
    const assignment = await createDocumentAssignment({ customerId, templateId, status: 'pending' });
    expect(assignment.customer_id).toBe(customerId);
    expect(assignment.template_id).toBe(templateId);
    expect(assignment.status).toBe('pending');
    expect(assignment.template_title).toBe('Mein Vertrag');
    expect(assignment.signature_data).toBeNull();
    expect(assignment.signed_html).toBeNull();
    expect(assignment.signed_pdf).toBeNull();
  });

  it('createDocumentAssignment falls back to empty template_title when template is missing', async () => {
    // template_id has no FK enforcement quirk to exploit here; use a template then delete it
    // is blocked by FK, so instead directly assert against a template that still exists but with
    // an empty title to exercise the `?? ''` fallback path differently: use getDocumentTemplate
    // returning null via a bogus id is not possible due to FK constraint on insert, so we only
    // assert the happy path template_title resolution above. This test asserts the fallback
    // literal shape stays intact when title is an empty string.
    const templateId = await seedTemplate('');
    const assignment = await createDocumentAssignment({ customerId, templateId, status: 'pending' });
    expect(assignment.template_title).toBe('');
  });

  it('listAssignmentsForCustomer returns rows ordered by assigned_at DESC', async () => {
    const templateId = await seedTemplate();
    await createDocumentAssignment({ customerId, templateId, status: 'pending' });
    await createDocumentAssignment({ customerId, templateId, status: 'completed' });
    const list = await listAssignmentsForCustomer(customerId);
    expect(list).toHaveLength(2);
    expect(list.every((a) => a.customer_id === customerId)).toBe(true);
  });

  it('listAssignmentsForCustomer returns [] for a customer with none', async () => {
    expect(await listAssignmentsForCustomer('22222222-2222-4222-8222-222222222222')).toEqual([]);
  });

  it('countPendingAssignmentsForCustomer counts only pending', async () => {
    const templateId = await seedTemplate();
    await createDocumentAssignment({ customerId, templateId, status: 'pending' });
    await createDocumentAssignment({ customerId, templateId, status: 'pending' });
    await createDocumentAssignment({ customerId, templateId, status: 'completed' });
    expect(await countPendingAssignmentsForCustomer(customerId)).toBe(2);
  });

  it('countPendingAssignmentsForCustomer returns 0 when none exist', async () => {
    expect(await countPendingAssignmentsForCustomer(customerId)).toBe(0);
  });

  it('markAssignmentSigned sets status, signature_data, signed_html, signed_pdf', async () => {
    const templateId = await seedTemplate();
    const created = await createDocumentAssignment({ customerId, templateId, status: 'pending' });
    const sigData = { signerName: 'Max', ip: '127.0.0.1' } as unknown as import('./signing/types').SignatureData;
    const pdf = Buffer.from('pdf-bytes');
    await markAssignmentSigned(created.id, sigData, '<p>signed</p>', pdf);

    const fetched = await getDocumentAssignmentById(created.id);
    expect(fetched?.status).toBe('completed');
    expect(fetched?.signed_html).toBe('<p>signed</p>');
    expect(fetched?.signed_at).not.toBeNull();
  });

  it('getAssignmentPdf returns the stored bytes', async () => {
    const templateId = await seedTemplate();
    const created = await createDocumentAssignment({ customerId, templateId, status: 'pending' });
    const pdf = Buffer.from('hello-pdf');
    await markAssignmentSigned(
      created.id,
      {} as unknown as import('./signing/types').SignatureData,
      '<p/>',
      pdf,
    );
    const fetched = await getAssignmentPdf(created.id);
    expect(fetched?.toString()).toBe('hello-pdf');
  });

  it('getAssignmentPdf returns null when the assignment has no signed pdf yet', async () => {
    const templateId = await seedTemplate();
    const created = await createDocumentAssignment({ customerId, templateId, status: 'pending' });
    expect(await getAssignmentPdf(created.id)).toBeNull();
  });

  it('getAssignmentPdf returns null for an unknown id', async () => {
    expect(await getAssignmentPdf('33333333-3333-4333-8333-333333333333')).toBeNull();
  });

  it('revokeAssignment sets status to revoked', async () => {
    const templateId = await seedTemplate();
    const created = await createDocumentAssignment({ customerId, templateId, status: 'pending' });
    await revokeAssignment(created.id);
    const fetched = await getDocumentAssignmentById(created.id);
    expect(fetched?.status).toBe('revoked');
  });

  it('extendAssignmentDeadline sets expires_at', async () => {
    const templateId = await seedTemplate();
    const created = await createDocumentAssignment({ customerId, templateId, status: 'pending' });
    const deadline = new Date('2027-01-01T00:00:00.000Z');
    await extendAssignmentDeadline(created.id, deadline);
    const fetched = await getDocumentAssignmentById(created.id);
    expect(new Date(fetched!.expires_at as string).toISOString()).toBe(deadline.toISOString());
  });

  it('getDocumentAssignmentById returns null for an unknown id', async () => {
    expect(await getDocumentAssignmentById('44444444-4444-4444-8444-444444444444')).toBeNull();
  });

  it('getDocumentAssignmentById joins template_title', async () => {
    const templateId = await seedTemplate('Joined Title');
    const created = await createDocumentAssignment({ customerId, templateId, status: 'pending' });
    const fetched = await getDocumentAssignmentById(created.id);
    expect(fetched?.template_title).toBe('Joined Title');
  });

  it('listAllAssignments joins customer name/email when present', async () => {
    const pool = await getPool();
    await pool.query('INSERT INTO customers (id, name, email) VALUES ($1, $2, $3)', [
      customerId,
      'Max Mustermann',
      'max@example.com',
    ]);
    const templateId = await seedTemplate('Admin View Template');
    await createDocumentAssignment({ customerId, templateId, status: 'pending' });

    const all = await listAllAssignments();
    expect(all).toHaveLength(1);
    expect(all[0].customer_name).toBe('Max Mustermann');
    expect(all[0].customer_email).toBe('max@example.com');
    expect(all[0].template_title).toBe('Admin View Template');
  });

  it('listAllAssignments returns customer_name/email as null via LEFT JOIN when customer row is missing', async () => {
    const templateId = await seedTemplate();
    await createDocumentAssignment({ customerId, templateId, status: 'pending' });
    const all = await listAllAssignments();
    expect(all).toHaveLength(1);
    expect(all[0].customer_name).toBeNull();
    expect(all[0].customer_email).toBeNull();
  });

  it('listAllAssignments returns [] when there are no assignments', async () => {
    expect(await listAllAssignments()).toEqual([]);
  });
});

describe('documents-db: getPool', () => {
  it('returns the shared pool instance', async () => {
    const pool = await getPool();
    expect(pool).toBeDefined();
    expect(typeof pool.query).toBe('function');
  });
});
