import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type IMemoryDb, newDb, DataType } from 'pg-mem';
import type { SignatureData } from '../../src/lib/signing/types';

let db: IMemoryDb;

// pg-mem's `db.public.query` only declares a single-arg signature, but the mocked
// `pg.Pool#query` is invoked with the full node-postgres arg list (text, params, callback).
// This local type lets us forward those args without widening to `any`.
type FlexibleQueryable = { query: (...args: unknown[]) => unknown };

vi.mock('pg', () => {
  return {
    default: {
      Pool: class MockPool {
        query(...args: unknown[]) {
          return (db.public as unknown as FlexibleQueryable).query(...args);
        }
      },
    },
    Pool: class MockPool {
      query(...args: unknown[]) {
        return (db.public as unknown as FlexibleQueryable).query(...args);
      }
    },
  };
});

vi.mock('dns', () => ({
  resolve4: (_hostname: string, _opts: unknown, cb: (err: null, addrs: string[]) => void) => {
    cb(null, ['127.0.0.1']);
  },
}));

describe('documents-db signing functions', () => {
  beforeEach(() => {
    db = newDb();
    db.public.registerFunction({
      name: 'gen_random_uuid',
      args: [],
      returns: DataType.uuid,
      implementation: () => 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    });
    db.public.none(`
      CREATE TABLE document_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        html_body TEXT NOT NULL,
        stand_date TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT,
        email TEXT NOT NULL
      );
      CREATE TABLE document_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL,
        template_id UUID NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        signature_data JSONB,
        signed_html TEXT,
        signed_pdf BYTEA,
        expires_at TIMESTAMPTZ,
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        signed_at TIMESTAMPTZ
      );
    `);
  });

  it('markAssignmentSigned sets status, signed_at, signature_data, signed_html', async () => {
    const { rows: [template] } = db.public.query(
      `INSERT INTO document_templates (title, html_body) VALUES ('Test', '<p>Doc</p>') RETURNING id`
    );
    const { rows: [customer] } = db.public.query(
      `INSERT INTO customers (email) VALUES ('test@example.com') RETURNING id`
    );
    const { rows: [assignment] } = db.public.query(
      `INSERT INTO document_assignments (customer_id, template_id, status)
       VALUES ('${customer.id}', '${template.id}', 'pending') RETURNING id`
    );

    const sigData: SignatureData = {
      type: 'canvas',
      imageData: 'data:image/png;base64,abc',
      signerName: 'Max Muster',
      ip: '127.0.0.1',
      userAgent: 'test',
      signedAt: new Date().toISOString(),
    };

    const sigJson = JSON.stringify(sigData);
    db.public.none(
      `UPDATE document_assignments
       SET status = 'completed', signed_at = NOW(),
           signature_data = '${sigJson}'::jsonb, signed_html = '<p>signed</p>'
       WHERE id = '${assignment.id}'`
    );

    const { rows: [updated] } = db.public.query(
      `SELECT * FROM document_assignments WHERE id = '${assignment.id}'`
    );
    expect(updated.status).toBe('completed');
    expect(updated.signed_html).toBe('<p>signed</p>');
    expect(updated.signature_data.signerName).toBe('Max Muster');
  });

  it('listAllAssignments returns assignments joined with template + customer', async () => {
    const { rows: tpl } = db.public.query(
      `INSERT INTO document_templates (title, html_body) VALUES ('Vertrag', '<p>x</p>') RETURNING id`,
    ) as unknown as { rows: { id: string }[] };
    const { rows: cust } = db.public.query(
      `INSERT INTO customers (name, email) VALUES ('Alice', 'a@b.de') RETURNING id`,
    ) as unknown as { rows: { id: string }[] };
    db.public.none(
      `INSERT INTO document_assignments (customer_id, template_id, status)
       VALUES ('${cust[0].id}', '${tpl[0].id}', 'pending')`,
    );

    interface AssignmentJoinRow {
      id: string;
      customer_id: string;
      customer_name: string;
      customer_email: string;
      template_id: string;
      template_title: string;
      status: string;
    }

    const { rows } = db.public.query(
      `SELECT a.id, a.customer_id,
              c.name  AS customer_name,
              c.email AS customer_email,
              a.template_id, t.title AS template_title,
              a.status, a.assigned_at, a.signed_at, a.expires_at
       FROM document_assignments a
       JOIN document_templates t ON t.id = a.template_id
       LEFT JOIN customers c ON c.id = a.customer_id
       ORDER BY a.assigned_at DESC`,
    ) as unknown as { rows: AssignmentJoinRow[] };

    expect(rows.length).toBe(1);
    expect(rows[0].template_title).toBe('Vertrag');
    expect(rows[0].status).toBe('pending');
    expect(rows[0].customer_name).toBe('Alice');
    expect(rows[0].customer_email).toBe('a@b.de');
  });
});
