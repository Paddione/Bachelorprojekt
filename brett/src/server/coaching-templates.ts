import type { MockPoolLike } from './db';
import type { Pool } from 'pg';

type AnyPool = Pool | MockPoolLike;

export interface CoachingTemplate {
  id: string;
  brand: string;
  name: string;
  description: string | null;
  steps: string[];
  isSystem: boolean;
}

function parseSteps(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  return [];
}

function rowToTemplate(row: Record<string, unknown>): CoachingTemplate {
  return {
    id: row.id as string,
    brand: row.brand as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    steps: parseSteps(row.steps),
    isSystem: row.is_system === true,
  };
}

export async function listCoachingTemplates(pool: AnyPool, brand: string): Promise<CoachingTemplate[]> {
  const { rows } = await pool.query(
    `SELECT id, brand, name, description, steps, is_system
       FROM brett.coaching_templates
      WHERE brand = $1 AND is_active = true
      ORDER BY is_system DESC, name`,
    [brand],
  );
  return rows.map(rowToTemplate);
}

export async function getCoachingTemplate(pool: AnyPool, id: string): Promise<CoachingTemplate | null> {
  const { rows } = await pool.query(
    `SELECT id, brand, name, description, steps, is_system
       FROM brett.coaching_templates
      WHERE id = $1 AND is_active = true`,
    [id],
  );
  return rows[0] ? rowToTemplate(rows[0]) : null;
}
