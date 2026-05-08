import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock keycloak admin module BEFORE importing the seed (which imports
// `../keycloak` for setUserPassword). The mocked module only needs to
// expose what auth-only touches.
vi.mock('../keycloak', () => ({
  setUserPassword: vi.fn().mockResolvedValue(true),
}));

import authOnly from './auth-only';
import type { SeedContext } from '../systemtest/seed-context';
import { pool } from '../website-db';
import { ensureSystemtestSchema } from '../systemtest/db';

const dbAvailable = !!(
  process.env.DATABASE_URL ||
  process.env.WEBSITE_DATABASE_URL ||
  process.env.SESSIONS_DATABASE_URL
);

describe.skipIf(!dbAvailable)('auth-only seed', () => {
  beforeAll(async () => {
    await ensureSystemtestSchema(pool);
  });

  it('creates a Keycloak user, sets a password, mints a magic-link, and tracks the user fixture', async () => {
    const tracked: Array<{ table: string; id: string }> = [];
    const client = await pool.connect();
    const createUserMock = vi.fn().mockResolvedValue({ success: true, userId: '00000000-0000-0000-0000-000000000abc' });
    const deleteUserMock = vi.fn().mockResolvedValue(true);

    const ctx: SeedContext = {
      assignmentId: '11111111-1111-1111-1111-111111111111',
      questionId:   '22222222-2222-2222-2222-222222222222',
      attempt: 0,
      role: 'customer',
      db: client,
      keycloak: {
        createUser: createUserMock,
        deleteUser: deleteUserMock,
      },
      track: async (table, id) => { tracked.push({ table, id }); },
    };

    try {
      await client.query('BEGIN');
      const result = await authOnly(ctx);
      expect(result.testUser.email).toMatch(/^test-11111111-0@systemtest\.local$/);
      expect(result.testUser.password).toMatch(/^T3st!11111111_0$/);
      expect(result.testUser.id).toBe('00000000-0000-0000-0000-000000000abc');
      expect(result.magicLink).toMatch(/\/api\/auth\/magic\?token=[0-9a-f]{64}$/);
      expect(tracked).toEqual([{ table: 'keycloak.users', id: '00000000-0000-0000-0000-000000000abc' }]);
      expect(createUserMock).toHaveBeenCalledWith({
        email: 'test-11111111-0@systemtest.local',
        firstName: 'Systemtest',
        lastName: 'test-11111111-0',
      });

      await client.query('ROLLBACK');

      // mintMagicLink writes via the shared pool, not the test transaction
      // client, so the row is visible regardless of the rollback above.
      const r = await pool.query(
        `SELECT keycloak_user_id, redirect_uri FROM systemtest_magic_tokens
         WHERE keycloak_user_id = $1`,
        [result.testUser.id],
      );
      expect(r.rows.length).toBe(1);
      expect(r.rows[0].redirect_uri).toBe('/admin/fragebogen/11111111-1111-1111-1111-111111111111');
      // Clean up — the row was created outside the test tx so we delete it
      // explicitly to keep the table tidy across test runs.
      await pool.query(`DELETE FROM systemtest_magic_tokens WHERE keycloak_user_id = $1`, [result.testUser.id]);
    } finally {
      client.release();
    }
  });

  it('cleans up the Keycloak user when password setting fails', async () => {
    const { setUserPassword } = await import('../keycloak');
    vi.mocked(setUserPassword).mockResolvedValueOnce(false);

    const client = await pool.connect();
    const createUserMock = vi.fn().mockResolvedValue({ success: true, userId: 'kc-fail-uid' });
    const deleteUserMock = vi.fn().mockResolvedValue(true);

    const ctx: SeedContext = {
      assignmentId: '33333333-3333-3333-3333-333333333333',
      questionId:   '44444444-4444-4444-4444-444444444444',
      attempt: 0,
      role: 'customer',
      db: client,
      keycloak: {
        createUser: createUserMock,
        deleteUser: deleteUserMock,
      },
      track: async () => {},
    };

    try {
      await client.query('BEGIN');
      await expect(authOnly(ctx)).rejects.toThrow(/setUserPassword/i);
      expect(deleteUserMock).toHaveBeenCalledWith('kc-fail-uid');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('surfaces Keycloak createUser errors', async () => {
    const client = await pool.connect();
    const createUserMock = vi.fn().mockResolvedValue({ success: false, error: 'duplicate email' });

    const ctx: SeedContext = {
      assignmentId: '55555555-5555-5555-5555-555555555555',
      questionId:   '66666666-6666-6666-6666-666666666666',
      attempt: 0,
      role: 'customer',
      db: client,
      keycloak: {
        createUser: createUserMock,
        deleteUser: vi.fn(),
      },
      track: async () => {},
    };

    try {
      await client.query('BEGIN');
      await expect(authOnly(ctx)).rejects.toThrow(/duplicate email/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
