// website/src/lib/sessions/templates.ts
// CRUD logic for brainstorm session templates with hardcoded fallback.

import { pool } from '../website-db';
import { logger } from '../logger';

export interface SessionTemplate {
  id: string;
  slug: string;
  title: string;
  body_markdown: string;
  is_default: boolean;
  owner_id: string | null;
  created_from_template_id: string | null;
}

export const DEFAULT_TEMPLATES: SessionTemplate[] = [
  { id: 'default-feature-intake', slug: 'feature-intake', title: 'Feature-Intake',
    body_markdown: '# Feature-Intake\n\n## Kernproblem\nWelches Problem loest dieses Feature?\n\n## Zielgruppe\nFuer wen ist es relevant?\n\n## Mehrwert\nWelchen Nutzen bringt es?\n\n## Aufwand\nKlein / Mittel / Gross?',
    is_default: true, owner_id: null, created_from_template_id: null },
  { id: 'default-retro', slug: 'retro', title: 'Retro',
    body_markdown: '# Retrospektive\n\n## Was lief gut?\nWelche Dinge funktionierten?\n\n## Was lief schlecht?\nWelche Huerden gab es?\n\n## Was aendern?\nWelche Anpassungen leiten wir ab?\n\n## Aktionspunkte\nWer macht was bis wann?',
    is_default: true, owner_id: null, created_from_template_id: null },
  { id: 'default-grilling', slug: 'grilling', title: 'Grilling',
    body_markdown: '# Grilling-Session\n\n## Anforderungsklaerung\nWas ist das Kernproblem? Welche Acceptance Criteria muessen erfuellt sein?\n\n## Architektur & Design\nWelche Komponenten sind betroffen?\n\n## Risiken & Edge Cases\nWas sind die kritischsten Edge Cases?\n\n## Umsetzung\nWelche Dateien werden geaendert?',
    is_default: true, owner_id: null, created_from_template_id: null },
  { id: 'default-workshop', slug: 'workshop', title: 'Workshop',
    body_markdown: '# Workshop-Planung\n\n## Ziel\nWas soll am Ende stehen?\n\n## Teilnehmer\nWer ist anwesend?\n\n## Agenda\nWelche Bloecke in welcher Reihenfolge?\n\n## Material\nWas wird benoetigt?\n\n## Nachbereitung\nWelche Follow-ups ergeben sich?',
    is_default: true, owner_id: null, created_from_template_id: null },
  { id: 'default-spezifikation', slug: 'spezifikation', title: 'Spezifikation',
    body_markdown: '# Spezifikation\n\n## Kontext\nWelcher Systemteil wird spezifiziert?\n\n## Anforderungen\nWelche funktionalen Anforderungen muessen erfuellt sein?\n\n## Schnittstellen\nWelche APIs sind beteiligt?\n\n## Constraints\nWelche Einschraenkungen gelten?\n\n## Abnahmekriterien\nWann gilt die Spezifikation als umgesetzt?',
    is_default: true, owner_id: null, created_from_template_id: null },
];

interface CloneOverrides {
  title?: string;
  slug?: string;
  body_markdown?: string;
}

export async function listTemplates(ownerId: string): Promise<SessionTemplate[]> {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, title, body_markdown, is_default, owner_id, created_from_template_id
        FROM sessions.templates
        WHERE is_default OR owner_id = $1
        ORDER BY is_default DESC, title ASC`,
      [ownerId]
    );
    
    // Log when we get fewer default templates than expected (indicates data issue)
    if (rows.length < DEFAULT_TEMPLATES.length) {
      logger.warn({ count: rows.length }, '[sessions/templates] Fewer default templates found in DB');
    }
    
    return rows as SessionTemplate[];
  } catch (err) {
    // Log with context and throw to let caller handle the failure
    const error = err instanceof Error ? err : new Error('Unknown database error');
    logger.error({ 
      ownerId, 
      err: error.message, 
      stack: error.stack, 
      code: 'DB_QUERY_FAILED' 
    }, '[sessions/templates] listTemplates DB query failed — returning empty array');
    
    throw new Error(`Failed to load templates: ${error.message}`);
  }
}

export async function cloneTemplate(
  templateId: string,
  ownerId: string,
  overrides: CloneOverrides
): Promise<SessionTemplate> {
  const { rows } = await pool.query(
    `SELECT id, slug, title, body_markdown, is_default, owner_id, created_from_template_id
     FROM sessions.templates WHERE id = $1`,
    [templateId]
  );
  if (rows.length === 0) throw new Error('template not found');

  const source = rows[0] as SessionTemplate;
  const slug = overrides.slug ?? `${source.slug}-copy`;
  const title = overrides.title ?? `${source.title} (Kopie)`;
  const body = overrides.body_markdown ?? source.body_markdown;

  const { rows: inserted } = await pool.query(
    `INSERT INTO sessions.templates (slug, title, body_markdown, is_default, owner_id, created_from_template_id)
     VALUES ($1, $2, $3, false, $4, $5)
     RETURNING id, slug, title, body_markdown, is_default, owner_id, created_from_template_id`,
    [slug, title, body, ownerId, templateId]
  );
  return inserted[0] as SessionTemplate;
}

export async function deleteTemplate(templateId: string, ownerId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, is_default, owner_id FROM sessions.templates WHERE id = $1`,
    [templateId]
  );
  if (rows.length === 0) throw new Error('template not found');
  const tpl = rows[0];
  if (tpl.is_default) throw new Error('cannot delete default template');
  if (tpl.owner_id !== ownerId) throw new Error('not owner');

  await pool.query(`DELETE FROM sessions.templates WHERE id = $1`, [templateId]);
}
