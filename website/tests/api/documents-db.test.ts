import { describe, it, expect, beforeEach } from 'vitest';
import { type IMemoryDb, newDb, DataType } from 'pg-mem';
import type { SignatureData } from '../../src/lib/signing/types';

describe('documents-db signing functions', () => {
  let db: IMemoryDb;

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
});
