import type { Pool } from 'pg';

export interface StepTemplate {
  id: string;
  brand: string;
  stepNumber: number;
  stepName: string;
  phase: string;
  systemPrompt: string;
  userPromptTpl: string;
  inputSchema: Array<{ key: string; label: string; required: boolean; placeholder?: string }>;
  keywords: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface UpsertTemplateArgs {
  brand: string;
  stepNumber: number;
  stepName: string;
  phase: string;
  systemPrompt: string;
  userPromptTpl: string;
  inputSchema: StepTemplate['inputSchema'];
  keywords: string[];
  isActive: boolean;
  sortOrder: number;
}

function rowToTemplate(row: Record<string, unknown>): StepTemplate {
  return {
    id: row.id as string,
    brand: row.brand as string,
    stepNumber: row.step_number as number,
    stepName: row.step_name as string,
    phase: row.phase as string,
    systemPrompt: row.system_prompt as string,
    userPromptTpl: row.user_prompt_tpl as string,
    inputSchema: row.input_schema as StepTemplate['inputSchema'],
    keywords: (Array.isArray(row.keywords) ? row.keywords : JSON.parse(row.keywords as string)) as string[],
    isActive: row.is_active as boolean,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as Date,
  };
}

export async function listStepTemplates(pool: Pool, brand: string): Promise<StepTemplate[]> {
  const r = await pool.query(
    `SELECT * FROM coaching.step_templates WHERE brand = $1 ORDER BY sort_order, step_number`,
    [brand],
  );
  return r.rows.map(rowToTemplate);
}

export async function getStepTemplate(
  pool: Pool,
  brand: string,
  stepNumber: number,
): Promise<StepTemplate | null> {
  const r = await pool.query(
    `SELECT * FROM coaching.step_templates WHERE brand = $1 AND step_number = $2 AND is_active = true`,
    [brand, stepNumber],
  );
  return r.rows[0] ? rowToTemplate(r.rows[0]) : null;
}

export async function upsertStepTemplate(
  pool: Pool,
  args: UpsertTemplateArgs,
): Promise<StepTemplate> {
  const r = await pool.query(
    `INSERT INTO coaching.step_templates
       (brand, step_number, step_name, phase, system_prompt, user_prompt_tpl,
        input_schema, keywords, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (brand, step_number) DO UPDATE SET
       step_name       = EXCLUDED.step_name,
       phase           = EXCLUDED.phase,
       system_prompt   = EXCLUDED.system_prompt,
       user_prompt_tpl = EXCLUDED.user_prompt_tpl,
       input_schema    = EXCLUDED.input_schema,
       keywords        = EXCLUDED.keywords,
       is_active       = EXCLUDED.is_active,
       sort_order      = EXCLUDED.sort_order
     RETURNING *`,
    [
      args.brand, args.stepNumber, args.stepName, args.phase,
      args.systemPrompt, args.userPromptTpl,
      JSON.stringify(args.inputSchema), args.keywords,
      args.isActive, args.sortOrder,
    ],
  );
  return rowToTemplate(r.rows[0]);
}

export async function deleteStepTemplate(pool: Pool, id: string): Promise<void> {
  await pool.query(`DELETE FROM coaching.step_templates WHERE id = $1`, [id]);
}

export function buildPromptFromTemplate(
  tpl: StepTemplate,
  inputs: Record<string, string>,
): string {
  return tpl.userPromptTpl.replace(/\{(\w+)\}/g, (_, k) => inputs[k] ?? '—');
}
