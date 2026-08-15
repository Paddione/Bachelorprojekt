import { pool } from './website-db';

export type JobStage =
  | 'queued'
  | 'generating'
  | 'rigging'
  | 'uploading'
  | 'done'
  | 'error';

export interface GenerationJob {
  id: string;
  name: string;
  prompt_id: string | null;
  stage: JobStage;
  status: 'pending' | 'running' | 'done' | 'error';
  skin_id: string | null;
  error_msg: string | null;
  created_at: string;
}

export async function insertJob(name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO assets.generation_jobs (name) VALUES ($1) RETURNING id',
    [name],
  );
  return rows[0].id;
}

export async function setJobPromptId(id: string, promptId: string): Promise<void> {
  await pool.query(
    "UPDATE assets.generation_jobs SET prompt_id = $1, status = 'pending' WHERE id = $2",
    [promptId, id],
  );
}

export async function updateJobStatus(
  id: string,
  status: GenerationJob['status'],
  extra: { skin_id?: string; error_msg?: string } = {},
): Promise<void> {
  await pool.query(
    `UPDATE assets.generation_jobs
     SET status = $1, skin_id = COALESCE($2, skin_id), error_msg = COALESCE($3, error_msg)
     WHERE id = $4`,
    [status, extra.skin_id ?? null, extra.error_msg ?? null, id],
  );
}

export async function updateJobStage(
  id: string,
  stage: JobStage,
  extra: { skin_id?: string; error_msg?: string } = {},
): Promise<void> {
  const status =
    stage === 'done' ? 'done' : stage === 'error' ? 'error' : 'pending';
  await pool.query(
    `UPDATE assets.generation_jobs
     SET stage = $1,
         status = $2,
         skin_id = COALESCE($3, skin_id),
         error_msg = COALESCE($4, error_msg)
     WHERE id = $5`,
    [stage, status, extra.skin_id ?? null, extra.error_msg ?? null, id],
  );
}

export async function getJob(id: string): Promise<GenerationJob | null> {
  const { rows } = await pool.query<GenerationJob>(
    'SELECT * FROM assets.generation_jobs WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function listRecentJobs(limit = 10): Promise<GenerationJob[]> {
  const { rows } = await pool.query<GenerationJob>(
    'SELECT * FROM assets.generation_jobs ORDER BY created_at DESC LIMIT $1',
    [limit],
  );
  return rows;
}
