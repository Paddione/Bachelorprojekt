import { pool } from './website-db';
import { ensureFolder } from './nextcloud-files';

export const DEFAULT_FOLDERS = [
  '01_Vertrag',
  '02_Rechnungen',
  '03_Dokumente',
  '04_Assets',
  '05_Kommunikation',
] as const;

export const MAX_FOLDERS = 50;
export const MAX_SEGMENT_LENGTH = 100;
export const FOLDER_PATH_RE = /^[A-Za-z0-9 _.\/-]+$/;

export interface FolderTemplate {
  id: string;
  brand: string;
  name: string;
  structure: { folders: string[] };
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export function validateStructure(input: unknown): { ok: boolean; error?: string; folders?: string[] } {
  if (!Array.isArray(input)) return { ok: false, error: 'Ordnerliste muss ein Array sein.' };
  if (input.length === 0) return { ok: false, error: 'Mindestens ein Ordner erforderlich.' };
  if (input.length > MAX_FOLDERS) return { ok: false, error: `Maximal ${MAX_FOLDERS} Ordner erlaubt.` };

  const seen = new Set<string>();
  for (let i = 0; i < input.length; i++) {
    const folder = input[i];
    if (typeof folder !== 'string') return { ok: false, error: `Ordner #${i + 1} muss ein String sein.` };
    const trimmed = folder.trim();
    if (trimmed.length === 0) return { ok: false, error: `Ordner #${i + 1} darf nicht leer sein.` };
    if (trimmed.startsWith('/')) return { ok: false, error: `Ordner #${i + 1} darf nicht mit / beginnen.` };
    if (trimmed.includes('..')) return { ok: false, error: `Ordner #${i + 1} enthält ungültiges "..".` };
    if (!FOLDER_PATH_RE.test(trimmed)) return { ok: false, error: `Ordner #${i + 1} enthält ungültige Zeichen.` };

    const segments = trimmed.split('/');
    for (const seg of segments) {
      if (seg.length > MAX_SEGMENT_LENGTH) {
        return { ok: false, error: `Ordnername #${i + 1} überschreitet ${MAX_SEGMENT_LENGTH} Zeichen.` };
      }
    }

    if (seen.has(trimmed)) return { ok: false, error: `Ordner "${trimmed}" ist doppelt vorhanden.` };
    seen.add(trimmed);
  }

  return { ok: true, folders: input.map(f => String(f).trim()) };
}

export async function listTemplates(brand: string): Promise<FolderTemplate[]> {
  const { rows } = await pool.query(
    `SELECT id, brand, name, structure, is_default, created_at, updated_at
     FROM public.folder_templates WHERE brand = $1 ORDER BY name`,
    [brand],
  );
  return rows as FolderTemplate[];
}

export async function getTemplate(brand: string, id: string): Promise<FolderTemplate | null> {
  const { rows } = await pool.query(
    `SELECT id, brand, name, structure, is_default, created_at, updated_at
     FROM public.folder_templates WHERE brand = $1 AND id = $2`,
    [brand, id],
  );
  return (rows[0] as FolderTemplate) ?? null;
}

export async function getDefaultTemplate(brand: string): Promise<FolderTemplate | null> {
  const { rows } = await pool.query(
    `SELECT id, brand, name, structure, is_default, created_at, updated_at
     FROM public.folder_templates WHERE brand = $1 AND is_default = true LIMIT 1`,
    [brand],
  );
  return (rows[0] as FolderTemplate) ?? null;
}

export async function createTemplate(params: {
  brand: string;
  name: string;
  folders: string[];
  isDefault?: boolean;
}): Promise<FolderTemplate> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (params.isDefault) {
      await client.query(
        `UPDATE public.folder_templates SET is_default = false WHERE brand = $1 AND is_default = true`,
        [params.brand],
      );
    }
    const { rows } = await client.query(
      `INSERT INTO public.folder_templates (brand, name, structure, is_default)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (brand, name) DO UPDATE SET structure = $3, is_default = $4, updated_at = now()
       RETURNING id, brand, name, structure, is_default, created_at, updated_at`,
      [params.brand, params.name, JSON.stringify({ folders: params.folders }), params.isDefault ?? false],
    );
    await client.query('COMMIT');
    return rows[0] as FolderTemplate;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateTemplate(
  brand: string,
  id: string,
  params: { name?: string; folders?: string[]; isDefault?: boolean },
): Promise<FolderTemplate | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (params.isDefault) {
      await client.query(
        `UPDATE public.folder_templates SET is_default = false WHERE brand = $1 AND is_default = true AND id != $2`,
        [brand, id],
      );
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (params.name !== undefined) {
      vals.push(params.name);
      sets.push(`name = $${vals.length}`);
    }
    if (params.folders !== undefined) {
      vals.push(JSON.stringify({ folders: params.folders }));
      sets.push(`structure = $${vals.length}`);
    }
    if (params.isDefault !== undefined) {
      vals.push(params.isDefault);
      sets.push(`is_default = $${vals.length}`);
    }
    sets.push('updated_at = now()');
    vals.push(brand);
    vals.push(id);
    const { rows } = await client.query(
      `UPDATE public.folder_templates SET ${sets.join(', ')}
       WHERE brand = $${vals.length - 1} AND id = $${vals.length}
       RETURNING id, brand, name, structure, is_default, created_at, updated_at`,
      vals,
    );
    await client.query('COMMIT');
    return (rows[0] as FolderTemplate) ?? null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteTemplate(brand: string, id: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT is_default FROM public.folder_templates WHERE brand = $1 AND id = $2`,
      [brand, id],
    );
    if (existing.rows.length === 0) return false;
    if (existing.rows[0].is_default) {
      const defaults = await client.query(
        `SELECT COUNT(*) as cnt FROM public.folder_templates WHERE brand = $1 AND is_default = true`,
        [brand],
      );
      if (parseInt(defaults.rows[0].cnt) <= 1) return false;
    }
    await client.query(
      `DELETE FROM public.folder_templates WHERE brand = $1 AND id = $2`,
      [brand, id],
    );
    return true;
  } finally {
    client.release();
  }
}

export interface MaterializeResult {
  created: string[];
  failed: { folder: string; error: string }[];
}

export async function materializeTemplate(projectId: string, folders: string[]): Promise<MaterializeResult> {
  const created: string[] = [];
  const failed: { folder: string; error: string }[] = [];
  for (const folder of folders) {
    const path = `Projects/${projectId}/${folder}`;
    try {
      await ensureFolder(path);
      created.push(folder);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ folder, error: msg });
    }
  }
  return { created, failed };
}
