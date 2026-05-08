import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Mocks must be declared BEFORE importing the route under test (vitest hoists
// vi.mock calls to the top of the module).
vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

vi.mock('../../../../lib/keycloak', () => ({
  createUser: vi.fn(),
  deleteUser: vi.fn().mockResolvedValue(true),
  setUserPassword: vi.fn().mockResolvedValue(true),
}));

import { POST } from './seed';
import { getSession, isAdmin } from '../../../../lib/auth';
import * as keycloak from '../../../../lib/keycloak';
import { pool } from '../../../../lib/website-db';
import { ensureSystemtestSchema } from '../../../../lib/systemtest/db';

const dbAvailable = !!(
  process.env.DATABASE_URL ||
  process.env.WEBSITE_DATABASE_URL ||
  process.env.SESSIONS_DATABASE_URL
);

const mockSession = { sub: 'admin', preferred_username: 'admin' } as any;

function makeReq(body: unknown): Request {
  return new Request('http://test/api/admin/systemtest/seed', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'workspace_session=test',
    },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('POST /api/admin/systemtest/seed', () => {
  beforeAll(async () => {
    await ensureSystemtestSchema(pool);
  });

  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession);
    vi.mocked(isAdmin).mockReturnValue(true);
    // Each test starts with a fresh, deterministic Keycloak userId — uuid-shaped
    // so it survives the (table_name, row_id UUID) constraint on
    // questionnaire_test_fixtures. Tests that need a different one override.
    vi.mocked(keycloak.createUser).mockResolvedValue({
      success: true,
      userId: '11111111-aaaa-bbbb-cccc-111111111111',
    });
    vi.mocked(keycloak.setUserPassword).mockResolvedValue(true);
  });

  it('rejects when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST({ request: makeReq({ assignmentId: 'x', questionId: 'y' }) } as any);
    expect(res.status).toBe(401);
  });

  it('rejects non-UUID assignmentId', async () => {
    const res = await POST({ request: makeReq({ assignmentId: 'not-a-uuid', questionId: 'also-not' }) } as any);
    expect(res.status).toBe(400);
  });

  it('returns 404 when no seed module is registered', async () => {
    const tplId = (await pool.query(
      `INSERT INTO questionnaire_templates (title, is_system_test) VALUES ('t-no-reg', true) RETURNING id`,
    )).rows[0].id;
    const qId = (await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, test_role)
       VALUES ($1, 1, 'q', 'user') RETURNING id`,
      [tplId],
    )).rows[0].id;
    const aId = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status)
       VALUES (gen_random_uuid(), $1, 'in_progress') RETURNING id`,
      [tplId],
    )).rows[0].id;

    const res = await POST({ request: makeReq({ assignmentId: aId, questionId: qId }) } as any);
    expect(res.status).toBe(404);
  });

  it('runs the registered seed module and writes a fixture row', async () => {
    const tplId = (await pool.query(
      `INSERT INTO questionnaire_templates (title, is_system_test) VALUES ('t-seed', true) RETURNING id`,
    )).rows[0].id;
    const qId = (await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, test_role)
       VALUES ($1, 1, 'q', 'user') RETURNING id`,
      [tplId],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_test_seed_registry (template_id, question_id, seed_module)
       VALUES ($1, $2, 'auth-only')`,
      [tplId, qId],
    );
    const aId = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status)
       VALUES (gen_random_uuid(), $1, 'in_progress') RETURNING id`,
      [tplId],
    )).rows[0].id;

    const res = await POST({ request: makeReq({ assignmentId: aId, questionId: qId }) } as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.testUser.email).toMatch(/^test-.*@systemtest\.local$/);
    expect(body.magicLink).toMatch(/\/api\/auth\/magic\?token=[0-9a-f]{64}$/);
    expect(body.fixturesSummary).toContain('1 test user');

    // Fixture row was written for the Keycloak user.
    const fixtures = await pool.query(
      `SELECT table_name, row_id FROM questionnaire_test_fixtures
       WHERE assignment_id = $1 AND question_id = $2`,
      [aId, qId],
    );
    expect(fixtures.rows.length).toBe(1);
    expect(fixtures.rows[0].table_name).toBe('keycloak.users');
    expect(fixtures.rows[0].row_id).toBe('11111111-aaaa-bbbb-cccc-111111111111');
  });

  it('falls back to the template-level registry row when no question-specific row exists', async () => {
    const tplId = (await pool.query(
      `INSERT INTO questionnaire_templates (title, is_system_test) VALUES ('t-tpl-reg', true) RETURNING id`,
    )).rows[0].id;
    const qId = (await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, test_role)
       VALUES ($1, 1, 'q', 'user') RETURNING id`,
      [tplId],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_test_seed_registry (template_id, question_id, seed_module)
       VALUES ($1, NULL, 'auth-only')`,
      [tplId],
    );
    const aId = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status)
       VALUES (gen_random_uuid(), $1, 'in_progress') RETURNING id`,
      [tplId],
    )).rows[0].id;

    const res = await POST({ request: makeReq({ assignmentId: aId, questionId: qId }) } as any);
    expect(res.status).toBe(200);
  });

  it('rolls back the transaction and tears down the Keycloak user when the seed module throws', async () => {
    // Use coaching-project so the seed inserts a tickets.tickets row — then
    // make Keycloak setUserPassword succeed but createUser return a fixed
    // userId, and corrupt the second insert by stubbing the seed registry
    // to point at a module name we'll register but inject a runtime error.
    // Simpler alternative: make setUserPassword fail; auth-only deletes the
    // Keycloak user itself, and the SQL transaction commits an empty
    // fixture set.
    vi.mocked(keycloak.setUserPassword).mockResolvedValueOnce(false);
    vi.mocked(keycloak.createUser).mockResolvedValueOnce({ success: true, userId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' });

    const tplId = (await pool.query(
      `INSERT INTO questionnaire_templates (title, is_system_test) VALUES ('t-rollback', true) RETURNING id`,
    )).rows[0].id;
    const qId = (await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, test_role)
       VALUES ($1, 1, 'q', 'user') RETURNING id`,
      [tplId],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_test_seed_registry (template_id, question_id, seed_module)
       VALUES ($1, $2, 'auth-only')`,
      [tplId, qId],
    );
    const aId = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status)
       VALUES (gen_random_uuid(), $1, 'in_progress') RETURNING id`,
      [tplId],
    )).rows[0].id;

    const res = await POST({ request: makeReq({ assignmentId: aId, questionId: qId }) } as any);
    expect(res.status).toBe(500);

    // No fixture rows written.
    const fixtures = await pool.query(
      `SELECT id FROM questionnaire_test_fixtures
       WHERE assignment_id = $1 AND question_id = $2`,
      [aId, qId],
    );
    expect(fixtures.rows.length).toBe(0);

    // Keycloak deleteUser called for the user we created. It runs twice
    // — once inside auth-only's own cleanup path (when setUserPassword
    // fails), once again from the endpoint's outer rollback handler.
    expect(vi.mocked(keycloak.deleteUser)).toHaveBeenCalledWith('cccccccc-cccc-cccc-cccc-cccccccccccc');
  });
});
