import type { Pool } from 'pg';

export interface Session {
  id: string;
  brand: string;
  clientId: string | null;
  clientName: string | null;
  kiConfigId: number | null;
  mode: 'live' | 'prep';
  title: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  archivedAt: Date | null;
  steps: SessionStep[];
}

export interface AuditEntry {
  id: string;
  sessionId: string;
  eventType: 'status_change' | 'field_change' | 'ai_request' | 'notes_change';
  actor: string;
  stepNumber: number | null;
  payload: Record<string, unknown>;
  changedAt: Date;
}

export interface ListSessionsOpts {
  q?: string;
  status?: string[];
  archived?: boolean;
  sort?: 'title' | 'client_name' | 'created_at' | 'status';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ListSessionsResult {
  sessions: Session[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionStep {
  id: string;
  sessionId: string;
  stepNumber: number;
  stepName: string;
  phase: string;
  coachInputs: Record<string, string>;
  aiPrompt: string | null;
  aiResponse: string | null;
  coachNotes: string | null;
  status: 'pending' | 'generated' | 'accepted' | 'skipped';
  generatedAt: Date | null;
}

export interface CreateSessionArgs {
  brand: string;
  clientId?: string | null;
  kiConfigId?: number | null;
  mode: 'live' | 'prep';
  title: string;
  createdBy: string;
}

export interface UpsertStepArgs {
  sessionId: string;
  stepNumber: number;
  stepName: string;
  phase: string;
  coachInputs?: Record<string, string>;
  aiPrompt?: string | null;
  aiResponse?: string | null;
  coachNotes?: string | null;
  status?: 'pending' | 'generated' | 'accepted' | 'skipped';
}

function rowToSession(row: Record<string, unknown>, steps: SessionStep[] = []): Session {
  return {
    id: row.id as string,
    brand: row.brand as string,
    clientId: (row.client_id as string | null) ?? null,
    clientName: (row.client_name as string | null) ?? null,
    kiConfigId: (row.ki_config_id as number | null) ?? null,
    mode: row.mode as 'live' | 'prep',
    title: row.title as string,
    status: row.status as Session['status'],
    createdBy: row.created_by as string,
    createdAt: row.created_at as Date,
    completedAt: (row.completed_at as Date | null) ?? null,
    archivedAt: (row.archived_at as Date | null) ?? null,
    steps,
  };
}

function rowToStep(row: Record<string, unknown>): SessionStep {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    stepNumber: row.step_number as number,
    stepName: row.step_name as string,
    phase: row.phase as string,
    coachInputs: (row.coach_inputs as Record<string, string>) ?? {},
    aiPrompt: (row.ai_prompt as string | null) ?? null,
    aiResponse: (row.ai_response as string | null) ?? null,
    coachNotes: (row.coach_notes as string | null) ?? null,
    status: row.status as SessionStep['status'],
    generatedAt: (row.generated_at as Date | null) ?? null,
  };
}

export async function createSession(pool: Pool, args: CreateSessionArgs): Promise<Session> {
  const r = await pool.query(
    `INSERT INTO coaching.sessions (brand, client_id, ki_config_id, mode, title, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [args.brand, args.clientId ?? null, args.kiConfigId ?? null, args.mode, args.title, args.createdBy],
  );
  return rowToSession(r.rows[0]);
}

export async function getSession(pool: Pool, id: string): Promise<Session | null> {
  const [sessionRes, stepsRes] = await Promise.all([
    pool.query(`SELECT * FROM coaching.sessions WHERE id = $1`, [id]),
    pool.query(`SELECT * FROM coaching.session_steps WHERE session_id = $1 ORDER BY step_number`, [id]),
  ]);
  if (!sessionRes.rows[0]) return null;
  return rowToSession(sessionRes.rows[0], stepsRes.rows.map(rowToStep));
}

export async function listSessions(
  pool: Pool,
  brand: string,
  opts: ListSessionsOpts = {},
): Promise<ListSessionsResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const showArchived = opts.archived ?? false;

  const sortColMap: Record<string, string> = {
    title: 's.title',
    client_name: 's.client_name',
    status: 's.status',
    created_at: 's.created_at',
  };
  const sortCol = sortColMap[opts.sort ?? 'created_at'] ?? 's.created_at';
  const sortDir = opts.order === 'asc' ? 'ASC' : 'DESC';

  const statusFilter = (opts.status ?? []).length > 0 ? opts.status! : null;
  const escapedQ = opts.q?.replace(/[%_\\]/g, c => `\\${c}`);
  const searchPattern = escapedQ ? `%${escapedQ}%` : null;

  // Build WHERE clauses dynamically to avoid ANY(null) which pg-mem doesn't support
  const whereParts: string[] = [`s.brand = $1`];
  const baseParams: unknown[] = [brand];

  let p = 2;
  if (!showArchived) {
    whereParts.push(`s.archived_at IS NULL`);
  }
  if (searchPattern) {
    whereParts.push(`(s.title ILIKE $${p} ESCAPE '\\\\' OR s.client_name ILIKE $${p} ESCAPE '\\\\')`);
    baseParams.push(searchPattern);
    p++;
  }
  if (statusFilter) {
    whereParts.push(`s.status = ANY($${p})`);
    baseParams.push(statusFilter);
    p++;
  }
  const whereClause = whereParts.join(' AND ');

  // Count separately for pg-mem compatibility (window functions may not be supported)
  const countR = await pool.query(
    `SELECT COUNT(*) AS total FROM coaching.sessions s WHERE ${whereClause}`,
    baseParams,
  );
  const total = Number(countR.rows[0]?.total ?? 0);

  const dataParams = [...baseParams, pageSize, offset];
  const limitIdx = p;
  const offsetIdx = p + 1;

  const r = await pool.query(
    `SELECT s.*
     FROM coaching.sessions s
     WHERE ${whereClause}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    dataParams,
  );

  return { sessions: r.rows.map(row => rowToSession(row)), total, page, pageSize };
}

export async function upsertStep(pool: Pool, args: UpsertStepArgs): Promise<SessionStep> {
  const r = await pool.query(
    `INSERT INTO coaching.session_steps
       (session_id, step_number, step_name, phase, coach_inputs, ai_prompt, ai_response, coach_notes, status, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (session_id, step_number) DO UPDATE SET
       coach_inputs  = EXCLUDED.coach_inputs,
       ai_prompt     = CASE WHEN EXCLUDED.ai_prompt IS NOT NULL THEN EXCLUDED.ai_prompt ELSE coaching.session_steps.ai_prompt END,
       ai_response   = CASE WHEN EXCLUDED.ai_response IS NOT NULL THEN EXCLUDED.ai_response ELSE coaching.session_steps.ai_response END,
       coach_notes   = CASE WHEN EXCLUDED.coach_notes IS NOT NULL THEN EXCLUDED.coach_notes ELSE coaching.session_steps.coach_notes END,
       status        = EXCLUDED.status,
       generated_at  = CASE WHEN EXCLUDED.generated_at IS NOT NULL THEN EXCLUDED.generated_at ELSE coaching.session_steps.generated_at END
     RETURNING *`,
    [
      args.sessionId, args.stepNumber, args.stepName, args.phase,
      JSON.stringify(args.coachInputs ?? {}),
      args.aiPrompt ?? null, args.aiResponse ?? null, args.coachNotes ?? null,
      args.status ?? 'pending',
      args.aiResponse ? new Date() : null,
    ],
  );
  return rowToStep(r.rows[0]);
}

export async function getStep(pool: Pool, sessionId: string, stepNumber: number): Promise<SessionStep | null> {
  const r = await pool.query(
    `SELECT * FROM coaching.session_steps WHERE session_id = $1 AND step_number = $2`,
    [sessionId, stepNumber],
  );
  return r.rows[0] ? rowToStep(r.rows[0]) : null;
}

export async function completeSession(pool: Pool, sessionId: string, reportMarkdown: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE coaching.sessions SET status = 'completed', completed_at = now() WHERE id = $1`,
      [sessionId],
    );
    await client.query(
      `INSERT INTO coaching.session_steps
         (session_id, step_number, step_name, phase, coach_inputs, ai_prompt, ai_response, coach_notes, status, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (session_id, step_number) DO UPDATE SET
         coach_inputs  = EXCLUDED.coach_inputs,
         ai_prompt     = CASE WHEN EXCLUDED.ai_prompt IS NOT NULL THEN EXCLUDED.ai_prompt ELSE coaching.session_steps.ai_prompt END,
         ai_response   = CASE WHEN EXCLUDED.ai_response IS NOT NULL THEN EXCLUDED.ai_response ELSE coaching.session_steps.ai_response END,
         coach_notes   = CASE WHEN EXCLUDED.coach_notes IS NOT NULL THEN EXCLUDED.coach_notes ELSE coaching.session_steps.coach_notes END,
         status        = EXCLUDED.status,
         generated_at  = CASE WHEN EXCLUDED.generated_at IS NOT NULL THEN EXCLUDED.generated_at ELSE coaching.session_steps.generated_at END`,
      [
        sessionId, 0, 'Abschlussbericht', 'umsetzung',
        JSON.stringify({}),
        null, reportMarkdown, null,
        'accepted',
        new Date(),
      ],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function appendAuditLog(
  pool: Pool,
  entry: Omit<AuditEntry, 'id' | 'changedAt'>,
): Promise<void> {
  await pool.query(
    `INSERT INTO coaching.session_audit_log
       (session_id, event_type, actor, step_number, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [entry.sessionId, entry.eventType, entry.actor, entry.stepNumber ?? null, entry.payload],
  );
}

export async function updateSessionStatus(
  pool: Pool,
  id: string,
  newStatus: Session['status'],
  actor: string,
): Promise<Session | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT status FROM coaching.sessions WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const fromStatus = current.rows[0].status as string;
    if (fromStatus === 'completed' && newStatus === 'active') {
      await client.query('ROLLBACK');
      return null;
    }
    const r = await client.query(
      `UPDATE coaching.sessions SET status = $2 WHERE id = $1 RETURNING *`,
      [id, newStatus],
    );
    await client.query(
      `INSERT INTO coaching.session_audit_log (session_id, event_type, actor, step_number, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, 'status_change', actor, null, JSON.stringify({ from: fromStatus, to: newStatus })],
    );
    await client.query('COMMIT');
    return rowToSession(r.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function updateSessionFields(
  pool: Pool,
  id: string,
  fields: Partial<{ title: string; clientId: string | null; clientName: string | null; kiConfigId: number | null }>,
  actor: string,
): Promise<Session | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(`SELECT * FROM coaching.sessions WHERE id = $1`, [id]);
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const row = current.rows[0];
    const stepsRes = await client.query(
      `SELECT * FROM coaching.session_steps WHERE session_id = $1 ORDER BY step_number`, [id],
    );
    const steps = stepsRes.rows.map(rowToStep);

    const sets: string[] = [];
    const vals: unknown[] = [id];
    const changedFields: { field: string; from: unknown; to: unknown }[] = [];

    if (fields.title !== undefined && fields.title !== row.title) {
      vals.push(fields.title);
      sets.push(`title = $${vals.length}`);
      changedFields.push({ field: 'title', from: row.title, to: fields.title });
    }
    if (fields.clientId !== undefined && fields.clientId !== row.client_id) {
      vals.push(fields.clientId);
      sets.push(`client_id = $${vals.length}`);
      changedFields.push({ field: 'client_id', from: row.client_id, to: fields.clientId });
    }
    if (fields.clientName !== undefined && fields.clientName !== row.client_name) {
      vals.push(fields.clientName);
      sets.push(`client_name = $${vals.length}`);
      changedFields.push({ field: 'client_name', from: row.client_name, to: fields.clientName });
    }
    if (fields.kiConfigId !== undefined && fields.kiConfigId !== row.ki_config_id) {
      vals.push(fields.kiConfigId);
      sets.push(`ki_config_id = $${vals.length}`);
      changedFields.push({ field: 'ki_config_id', from: row.ki_config_id, to: fields.kiConfigId });
    }
    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return rowToSession(row, steps);
    }

    const r = await client.query(
      `UPDATE coaching.sessions SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      vals,
    );
    for (const f of changedFields) {
      await client.query(
        `INSERT INTO coaching.session_audit_log (session_id, event_type, actor, step_number, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, 'field_change', actor, null, JSON.stringify(f)],
      );
    }
    await client.query('COMMIT');
    return rowToSession(r.rows[0], steps);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function archiveSession(pool: Pool, id: string, actor: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE coaching.sessions SET archived_at = now() WHERE id = $1`,
      [id],
    );
    await client.query(
      `INSERT INTO coaching.session_audit_log (session_id, event_type, actor, step_number, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, 'status_change', actor, null, JSON.stringify({ action: 'archived' })],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function unarchiveSession(pool: Pool, id: string, actor: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE coaching.sessions SET archived_at = null WHERE id = $1`,
      [id],
    );
    await client.query(
      `INSERT INTO coaching.session_audit_log (session_id, event_type, actor, step_number, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, 'status_change', actor, null, JSON.stringify({ action: 'unarchived' })],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getAuditLog(pool: Pool, sessionId: string, limit = 50): Promise<AuditEntry[]> {
  const r = await pool.query(
    `SELECT * FROM coaching.session_audit_log WHERE session_id = $1
     ORDER BY changed_at DESC LIMIT $2`,
    [sessionId, limit],
  );
  return r.rows.map(row => ({
    id: row.id as string,
    sessionId: row.session_id as string,
    eventType: row.event_type as AuditEntry['eventType'],
    actor: row.actor as string,
    stepNumber: (row.step_number as number | null) ?? null,
    payload: row.payload as Record<string, unknown>,
    changedAt: row.changed_at as Date,
  }));
}
