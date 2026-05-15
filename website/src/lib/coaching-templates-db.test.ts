import { describe, it, expect, beforeAll } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  listStepTemplates,
  getStepTemplate,
  upsertStepTemplate,
  deleteStepTemplate,
  buildPromptFromTemplate,
} from './coaching-templates-db';

let pool: Pool;

beforeAll(async () => {
  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  db.public.none(`
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.step_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand TEXT NOT NULL,
      step_number INT NOT NULL,
      step_name TEXT NOT NULL,
      phase TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      user_prompt_tpl TEXT NOT NULL,
      input_schema JSONB NOT NULL DEFAULT '[]',
      keywords TEXT[] NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (brand, step_number)
    );
  `);
  const { Pool: PgMemPool } = db.adapters.createPg();
  pool = new PgMemPool() as unknown as Pool;
});

describe('upsertStepTemplate + listStepTemplates', () => {
  it('erstellt und listet ein Template', async () => {
    const t = await upsertStepTemplate(pool, {
      brand: 'mentolder',
      stepNumber: 1,
      stepName: 'Erstanamnese',
      phase: 'problem_ziel',
      systemPrompt: 'System prompt',
      userPromptTpl: 'User template {anlass}',
      inputSchema: [{ key: 'anlass', label: 'Anlass', required: true }],
      keywords: ['anamnese'],
      isActive: true,
      sortOrder: 0,
    });
    expect(t.id).toBeTruthy();
    expect(t.stepName).toBe('Erstanamnese');
    const list = await listStepTemplates(pool, 'mentolder');
    expect(list).toHaveLength(1);
  });

  it('aktualisiert bestehendes Template bei Konflikt (UPSERT)', async () => {
    await upsertStepTemplate(pool, {
      brand: 'mentolder',
      stepNumber: 1,
      stepName: 'Erstanamnese Updated',
      phase: 'problem_ziel',
      systemPrompt: 'Updated system',
      userPromptTpl: 'Updated tpl',
      inputSchema: [],
      keywords: [],
      isActive: true,
      sortOrder: 0,
    });
    const t = await getStepTemplate(pool, 'mentolder', 1);
    expect(t?.stepName).toBe('Erstanamnese Updated');
  });
});

describe('deleteStepTemplate', () => {
  it('löscht ein Template nach id', async () => {
    const list = await listStepTemplates(pool, 'mentolder');
    await deleteStepTemplate(pool, list[0].id);
    const after = await listStepTemplates(pool, 'mentolder');
    expect(after).toHaveLength(0);
  });
});

describe('buildPromptFromTemplate', () => {
  it('ersetzt Platzhalter {key} mit Inputs', () => {
    const tpl = {
      id: 'x', brand: 'mentolder', stepNumber: 1, stepName: 'T', phase: 'p',
      systemPrompt: 's', userPromptTpl: 'Anlass: {anlass}, Ziel: {ziel}',
      inputSchema: [], keywords: [], isActive: true, sortOrder: 0, createdAt: new Date(),
    };
    const result = buildPromptFromTemplate(tpl, { anlass: 'Stress', ziel: 'Entspannung' });
    expect(result).toBe('Anlass: Stress, Ziel: Entspannung');
  });

  it('ersetzt fehlende Keys mit Fallback —', () => {
    const tpl = {
      id: 'x', brand: 'mentolder', stepNumber: 1, stepName: 'T', phase: 'p',
      systemPrompt: 's', userPromptTpl: 'Wert: {missing}',
      inputSchema: [], keywords: [], isActive: true, sortOrder: 0, createdAt: new Date(),
    };
    const result = buildPromptFromTemplate(tpl, {});
    expect(result).toBe('Wert: —');
  });
});
