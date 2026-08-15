import type { MockPoolLike } from './db';
import type { Pool } from 'pg';

type AnyPool = Pool | MockPoolLike;

export interface BoardTemplate {
  id: string;
  brand: string;
  name: string;
  description: string | null;
  category: string | null;
  is_system: boolean;
  created_by_user: string | null;
  created_at: string;
}

export interface BoardTemplateWithState extends BoardTemplate {
  state: any;
}

export async function listBoardTemplates(pool: AnyPool, brand: string): Promise<BoardTemplate[]> {
  const { rows } = await pool.query(
    `SELECT id, brand, name, description, category, is_system, created_by_user, created_at
       FROM brett.board_templates
      WHERE brand = $1
      ORDER BY is_system DESC, created_at DESC`,
    [brand],
  );
  return rows;
}

export async function getBoardTemplate(pool: AnyPool, id: string): Promise<BoardTemplateWithState | null> {
  const { rows } = await pool.query(
    `SELECT id, brand, name, description, category, state, is_system, created_by_user, created_at
       FROM brett.board_templates
      WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createBoardTemplate(
  pool: AnyPool,
  opts: { brand: string; name: string; description?: string; category?: string; state: any; userId: string },
): Promise<{ id: string }> {
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt
       FROM brett.board_templates
      WHERE brand = $1 AND created_by_user = $2 AND is_system = false`,
    [opts.brand, opts.userId],
  );
  if ((countRows[0]?.cnt ?? 0) >= 50) {
    throw new Error('limit-reached');
  }
  const { rows } = await pool.query(
    `INSERT INTO brett.board_templates (brand, name, description, category, state, created_by_user)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [opts.brand, opts.name, opts.description ?? null, opts.category ?? null, opts.state, opts.userId],
  );
  return { id: rows[0].id };
}

export async function deleteBoardTemplate(
  pool: AnyPool,
  id: string,
  opts: { userId: string; isAdmin: boolean },
): Promise<{ deleted: boolean; reason?: string }> {
  const { rows } = await pool.query(
    `SELECT id, is_system, created_by_user
       FROM brett.board_templates
      WHERE id = $1`,
    [id],
  );
  if (!rows[0]) return { deleted: false, reason: 'not-found' };
  if (rows[0].is_system) return { deleted: false, reason: 'is-system' };
  if (!opts.isAdmin && rows[0].created_by_user !== opts.userId) {
    return { deleted: false, reason: 'forbidden' };
  }
  await pool.query(`DELETE FROM brett.board_templates WHERE id = $1`, [id]);
  return { deleted: true };
}
