// website/src/lib/coaching-project-db.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  findOrCreateProject,
  getProject,
  listProjects,
  updateProject,
} from './coaching-project-db';

let pool: Pool;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeAll(async () => {
  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  db.public.none(`
    CREATE TABLE customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT,
      customer_number TEXT
    );
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.projects (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand           TEXT NOT NULL,
      client_id       UUID REFERENCES customers(id),
      customer_number TEXT NOT NULL,
      display_alias   TEXT,
      ki_context      TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX coaching_projects_brand_client_idx
      ON coaching.projects (brand, client_id);
    CREATE TABLE coaching.sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand TEXT NOT NULL DEFAULT 'mentolder',
      client_id UUID,
      project_id UUID REFERENCES coaching.projects(id),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      mode TEXT NOT NULL DEFAULT 'live',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      archived_at TIMESTAMPTZ
    );
  `);
  const { Pool: PgMemPool } = db.adapters.createPg();
  pool = new PgMemPool() as unknown as Pool;
});

describe('findOrCreateProject', () => {
  it('legt Projekt an wenn keins existiert', async () => {
    const clientR = await pool.query(
      `INSERT INTO customers (name, customer_number) VALUES ('Müller GmbH', 'K-0001') RETURNING id`,
    );
    const clientId = clientR.rows[0].id as string;
    const p = await findOrCreateProject(pool, 'mentolder', clientId);
    expect(p.id).toMatch(UUID_REGEX);
    expect(p.customerNumber).toBe('K-0001');
    expect(p.clientId).toBe(clientId);
    expect(p.brand).toBe('mentolder');
  });

  it('gibt bestehendes Projekt zurück beim zweiten Aufruf', async () => {
    const clientR = await pool.query(
      `INSERT INTO customers (name, customer_number) VALUES ('Meier AG', 'K-0002') RETURNING id`,
    );
    const clientId = clientR.rows[0].id as string;
    const p1 = await findOrCreateProject(pool, 'mentolder', clientId);
    const p2 = await findOrCreateProject(pool, 'mentolder', clientId);
    expect(p1.id).toBe(p2.id);
  });

  it('fällt auf client_id zurück wenn customer_number fehlt', async () => {
    const clientR = await pool.query(
      `INSERT INTO customers (name) VALUES ('Ohne Nummer') RETURNING id`,
    );
    const clientId = clientR.rows[0].id as string;
    const p = await findOrCreateProject(pool, 'mentolder', clientId);
    expect(p.customerNumber).toBe(clientId);
  });
});

describe('getProject', () => {
  it('gibt null zurück für unbekannte ID', async () => {
    const r = await getProject(pool, '00000000-0000-4000-8000-000000000000');
    expect(r).toBeNull();
  });

  it('gibt Projekt mit session_count zurück', async () => {
    const clientR = await pool.query(
      `INSERT INTO customers (name, customer_number) VALUES ('Schmidt', 'K-0010') RETURNING id`,
    );
    const clientId = clientR.rows[0].id as string;
    const proj = await findOrCreateProject(pool, 'mentolder', clientId);
    await pool.query(
      `INSERT INTO coaching.sessions (brand, client_id, project_id, title, created_by)
       VALUES ('mentolder', $1, $2, 'Session A', 'coach')`,
      [clientId, proj.id],
    );
    const r = await getProject(pool, proj.id);
    expect(r).not.toBeNull();
    expect(r!.sessionCount).toBe(1);
  });
});

describe('listProjects', () => {
  it('gibt ListProjectsResult zurück', async () => {
    const r = await listProjects(pool, 'mentolder');
    expect(r).toHaveProperty('projects');
    expect(r).toHaveProperty('total');
    expect(r).toHaveProperty('page');
    expect(r).toHaveProperty('pageSize');
    expect(Array.isArray(r.projects)).toBe(true);
  });

  it('filtert nach Kundennummer via q', async () => {
    // Kunden mit einzigartigen Kundennummern anlegen
    const brand = 'test-search-brand';
    const c1 = await pool.query(`INSERT INTO customers (name, customer_number) VALUES ('Such-A', 'SEARCH-001') RETURNING id`);
    const c2 = await pool.query(`INSERT INTO customers (name, customer_number) VALUES ('Such-B', 'SEARCH-002') RETURNING id`);
    await findOrCreateProject(pool, brand, c1.rows[0].id as string);
    await findOrCreateProject(pool, brand, c2.rows[0].id as string);
    const r = await listProjects(pool, brand, { q: 'SEARCH-001' });
    expect(r.total).toBe(1);
    expect(r.projects[0].customerNumber).toBe('SEARCH-001');
  });
});

describe('updateProject', () => {
  it('aktualisiert ki_context und notes', async () => {
    const clientR = await pool.query(
      `INSERT INTO customers (name, customer_number) VALUES ('Update-Test', 'K-0020') RETURNING id`,
    );
    const clientId = clientR.rows[0].id as string;
    const proj = await findOrCreateProject(pool, 'mentolder', clientId);
    const updated = await updateProject(pool, proj.id, {
      kiContext: 'Klient K-0020 befindet sich in Phase 2.',
      notes: 'Interne Notiz',
    });
    expect(updated?.kiContext).toBe('Klient K-0020 befindet sich in Phase 2.');
    expect(updated?.notes).toBe('Interne Notiz');
  });

  it('gibt null zurück für unbekannte ID', async () => {
    const r = await updateProject(pool, '00000000-0000-4000-8000-000000000000', { notes: 'x' });
    expect(r).toBeNull();
  });
});
