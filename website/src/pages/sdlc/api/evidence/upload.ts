import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';
import { getSession, isAdmin } from '../../../../lib/auth';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const EVIDENCE_ROOT = process.env.EVIDENCE_ROOT ?? '/var/evidence';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UploadBody {
  assignmentId: string;
  questionId: string;
  attempt: number;
  chunk: {
    events: unknown[];
    chunkIndex: number;
    isFinal: boolean;
  };
  consoleLog?: unknown[];
  networkLog?: unknown[];
  partial?: boolean;
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: UploadBody;
  try {
    body = await request.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const { assignmentId, questionId, attempt, chunk, consoleLog, networkLog, partial } = body;

  // Reject non-UUID inputs (joined into filesystem path).
  if (!UUID_RE.test(assignmentId) || !UUID_RE.test(questionId)) {
    return new Response('bad ids', { status: 400 });
  }
  if (!Number.isInteger(attempt) || attempt < 0 || attempt > 1000) {
    return new Response('bad attempt', { status: 400 });
  }
  if (!chunk || !Array.isArray(chunk.events)) {
    return new Response('bad chunk', { status: 400 });
  }

  // Find or create the evidence row + file path.
  const existing = await pool.query(
    `SELECT id, replay_path FROM questionnaire_test_evidence
     WHERE assignment_id=$1 AND question_id=$2 AND attempt=$3`,
    [assignmentId, questionId, attempt],
  );

  let id: string;
  let replayPath: string;
  if (existing.rows.length === 0) {
    const dir = path.join(EVIDENCE_ROOT, assignmentId, questionId);
    // Belt-and-suspenders: even though the UUID regex above already prevents
    // traversal, double-check the resolved directory stays under EVIDENCE_ROOT
    // so this remains safe if the regex is ever loosened.
    const resolvedRoot = path.resolve(EVIDENCE_ROOT);
    const resolvedDir = path.resolve(dir);
    if (!resolvedDir.startsWith(resolvedRoot + path.sep) && resolvedDir !== resolvedRoot) {
      return new Response('bad path', { status: 400 });
    }
    await fs.mkdir(dir, { recursive: true });
    replayPath = path.join(dir, `${attempt}.rrweb`);
    const ins = await pool.query(
      `INSERT INTO questionnaire_test_evidence
        (assignment_id, question_id, attempt, replay_path, recorded_from)
       VALUES ($1, $2, $3, $4, now()) RETURNING id`,
      [assignmentId, questionId, attempt, replayPath],
    );
    id = ins.rows[0].id;
  } else {
    id = existing.rows[0].id;
    replayPath = existing.rows[0].replay_path;
  }

  // Append events as NDJSON (one JSON-encoded event per line).
  if (chunk.events.length > 0) {
    const lines = chunk.events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await fs.appendFile(replayPath, lines);
  }

  if (chunk.isFinal) {
    // COALESCE so an absent `partial` field doesn't clobber a previously-set
    // true (e.g. an earlier non-final chunk that already marked the row).
    await pool.query(
      `UPDATE questionnaire_test_evidence
         SET recorded_to = now(),
             console_log = $2,
             network_log = $3,
             partial = COALESCE($4, partial)
       WHERE id = $1`,
      [
        id,
        JSON.stringify(consoleLog ?? []),
        JSON.stringify(networkLog ?? []),
        typeof partial === 'boolean' ? partial : null,
      ],
    );
  }

  return new Response(JSON.stringify({ evidenceId: id }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
