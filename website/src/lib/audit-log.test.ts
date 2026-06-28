import { describe, it, expect, beforeAll, vi } from 'vitest';
import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import { recordAudit, clientIpFromRequest } from './audit-log';
import * as loggerModule from './logger';

let pool: Pool;

beforeAll(async () => {
  const db = newDb();
  db.public.none(`
    CREATE SCHEMA audit;
    CREATE TABLE audit.audit_log (
      id          bigserial PRIMARY KEY,
      actor_id    text,
      actor_email text,
      action      text NOT NULL,
      target_type text,
      target_id   text,
      ip          inet,
      ts          timestamptz NOT NULL DEFAULT now(),
      metadata    jsonb
    );
  `);
  const { Pool: PgMemPool } = db.adapters.createPg();
  pool = new PgMemPool() as unknown as Pool;
});

describe('recordAudit', () => {
  it('schreibt Eintrag mit allen Pflichtfeldern (Read-back)', async () => {
    await recordAudit(pool, {
      actor_id: 'user-1',
      actor_email: 'test@example.com',
      action: 'test.action',
      target_type: 'ticket',
      target_id: 'T000001',
      ip: '10.0.0.1',
      metadata: { reason: 'test' },
    });

    const rows = await pool.query(
      'SELECT * FROM audit.audit_log WHERE action = $1 ORDER BY id',
      ['test.action'],
    );
    expect(rows.rows).toHaveLength(1);
    const r = rows.rows[0];
    expect(r.actor_id).toBe('user-1');
    expect(r.actor_email).toBe('test@example.com');
    expect(r.action).toBe('test.action');
    expect(r.target_type).toBe('ticket');
    expect(r.target_id).toBe('T000001');
    expect(r.ip).toBe('10.0.0.1');
    expect(r.metadata).toEqual({ reason: 'test' });
    expect(r.ts).toBeTruthy();
  });

  it('schreibt Eintrag mit nur Pflichtfeldern (Rest null)', async () => {
    await recordAudit(pool, { action: 'minimal.action' });
    const rows = await pool.query(
      "SELECT * FROM audit.audit_log WHERE action = 'minimal.action'",
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].action).toBe('minimal.action');
    expect(rows.rows[0].actor_id).toBeNull();
    expect(rows.rows[0].ip).toBeNull();
    expect(rows.rows[0].metadata).toBeNull();
  });

  it('ist fail-soft: Insert-Fehler bricht nicht den Aufrufer', async () => {
    const warnSpy = vi.spyOn(loggerModule.logger, 'warn').mockReturnValue(undefined as any);
    await pool.query('DROP TABLE audit.audit_log CASCADE');
    await expect(
      recordAudit(pool, { action: 'fail.action' }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      expect.stringContaining('[audit] recordAudit failed'),
    );
    warnSpy.mockRestore();
  });
});

describe('clientIpFromRequest', () => {
  it('parst ersten Hop aus x-forwarded-for', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '10.0.0.1, 192.168.1.1, 172.16.0.1' },
    });
    expect(clientIpFromRequest(req)).toBe('10.0.0.1');
  });

  it('gibt null bei fehlendem Header zurück', () => {
    const req = new Request('http://localhost/');
    expect(clientIpFromRequest(req)).toBeNull();
  });

  it('gibt single-IP zurück', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '192.168.1.100' },
    });
    expect(clientIpFromRequest(req)).toBe('192.168.1.100');
  });

  it('trimmt Whitespace um IP', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': ' 10.0.0.1 , 192.168.1.1' },
    });
    expect(clientIpFromRequest(req)).toBe('10.0.0.1');
  });
});
