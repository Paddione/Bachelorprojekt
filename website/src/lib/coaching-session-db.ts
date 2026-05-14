import type { Pool } from 'pg';

export interface Session {
  id: string;
  brand: string;
  clientId: string | null;
  mode: 'live' | 'prep';
  title: string;
  status: 'active' | 'completed' | 'abandoned';
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  steps: SessionStep[];
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
    mode: row.mode as 'live' | 'prep',
    title: row.title as string,
    status: row.status as Session['status'],
    createdBy: row.created_by as string,
    createdAt: row.created_at as Date,
    completedAt: (row.completed_at as Date | null) ?? null,
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
    `INSERT INTO coaching.sessions (brand, client_id, mode, title, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [args.brand, args.clientId ?? null, args.mode, args.title, args.createdBy],
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

export async function listSessions(pool: Pool, brand: string): Promise<Session[]> {
  const r = await pool.query(
    `SELECT s.*
     FROM coaching.sessions s
     WHERE s.brand = $1
     ORDER BY s.created_at DESC`,
    [brand],
  );
  return r.rows.map(row => rowToSession(row));
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
  await pool.query(
    `UPDATE coaching.sessions SET status = 'completed', completed_at = now() WHERE id = $1`,
    [sessionId],
  );
  await upsertStep(pool, {
    sessionId,
    stepNumber: 0,
    stepName: 'Abschlussbericht',
    phase: 'umsetzung',
    coachInputs: {},
    aiResponse: reportMarkdown,
    status: 'accepted',
  });
}
