import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Mock auth before importing the route under test. Mirrors the pattern used
// by sibling admin endpoint tests (see billing/datev-export.test.ts).
vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

import { getSession, isAdmin } from '../../../../lib/auth';
import { POST } from './upload';
import { pool } from '../../../../lib/website-db';
import { ensureSystemtestSchema } from '../../../../lib/systemtest/db';

const dbAvailable = !!(
  process.env.DATABASE_URL ||
  process.env.WEBSITE_DATABASE_URL ||
  process.env.SESSIONS_DATABASE_URL
);

const mockSession = { sub: 'admin', preferred_username: 'admin' };

function makeReq(body: unknown): Request {
  return new Request('http://test/api/admin/evidence/upload', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'workspace_session=test',
    },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('POST /api/admin/evidence/upload', () => {
  beforeAll(async () => {
    await ensureSystemtestSchema(pool);
  });

  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession as any);
    vi.mocked(isAdmin).mockReturnValue(true);
  });

  it('rejects when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST({ request: makeReq({}) } as any);
    expect(res.status).toBe(401);
  });

  it('rejects non-UUID assignmentId', async () => {
    const res = await POST({ request: makeReq({
      assignmentId: 'not-a-uuid', questionId: 'also-not', attempt: 0,
      chunk: { events: [], chunkIndex: 0, isFinal: true },
    }) } as any);
    expect(res.status).toBe(400);
  });

  it('creates evidence row from a chunked rrweb upload', async () => {
    const tplId = (await pool.query(
      `INSERT INTO questionnaire_templates (title, is_system_test) VALUES ('t', true) RETURNING id`,
    )).rows[0].id;
    const qId = (await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text)
       VALUES ($1, 1, 'q') RETURNING id`,
      [tplId],
    )).rows[0].id;
    const aId = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status)
       VALUES (gen_random_uuid(), $1, 'in_progress') RETURNING id`,
      [tplId],
    )).rows[0].id;

    const res = await POST({ request: makeReq({
      assignmentId: aId,
      questionId: qId,
      attempt: 0,
      chunk: { events: [{ type: 0, data: {}, timestamp: 1 }], chunkIndex: 0, isFinal: true },
      consoleLog: [],
      networkLog: [],
    }) } as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.evidenceId).toMatch(/^[0-9a-f-]{36}$/i);

    const row = await pool.query(
      `SELECT replay_path, partial FROM questionnaire_test_evidence WHERE id = $1`,
      [json.evidenceId],
    );
    expect(row.rows[0].partial).toBe(false);
    expect(row.rows[0].replay_path).toMatch(/\.rrweb$/);
  });
});
