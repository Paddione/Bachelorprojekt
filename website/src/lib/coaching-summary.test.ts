// coaching-summary.test.ts — T002653
//
// Session-Zusammenfassungen: baut den Prompt aus ai_response + coach_notes
// aller Schritte, generiert ueber den DSGVO-geguardeten Session-Agent-Pfad
// (OpenAICompatibleSessionAgent) und persistiert llm_summary/llm_summary_at.
//
// Pruefmodus: Verhaltensverifikation. Die Agent-Schicht wird mit dem
// Mock-OpenAI-Muster aus coaching-data-residency.test.ts gemockt — mockCreate
// zaehlt, ob der Provider-Call ankam. Die DB-Schicht laeuft gegen pg-mem.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import type { KiConfig } from './coaching-ki-config-db.ts';

const { mockCreate, clientConfigs, mockOpenAIClass } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const clientConfigs: unknown[] = [];
  class MockOpenAI {
    constructor(config: unknown) { clientConfigs.push(config); }
    chat = { completions: { create: mockCreate } };
  }
  return { mockCreate, clientConfigs, mockOpenAIClass: MockOpenAI };
});
const getProviderByNameMock = vi.hoisted(() => vi.fn());
const getActiveProviderMock = vi.hoisted(() => vi.fn());
const getKiProviderByIdMock = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({ default: mockOpenAIClass }));
vi.mock('./session-tools', () => ({ searchCoachingKnowledgeTool: vi.fn().mockResolvedValue([]) }));
vi.mock('./provider-config', () => ({ getProviderByName: getProviderByNameMock }));
vi.mock('./coaching-ki-config-db', () => ({
  getActiveProvider: getActiveProviderMock,
  getKiProviderById: getKiProviderByIdMock,
}));

const { buildSummaryInput, generateSessionSummary } = await import('./coaching-summary');

const SESSION_ID = '11111111-1111-1111-1111-111111111111';

const baseConfig = (overrides: Partial<KiConfig> = {}): KiConfig => ({
  id: 1, brand: 'mentolder', provider: 'local-cluster', isActive: true,
  modelName: 'bge-3', displayName: 'Lokal', createdAt: new Date(),
  apiEndpoint: null, apiKey: null, maxTokens: 800, temperature: 0.2,
  topP: null, systemPrompt: null, notes: null, topK: null,
  thinkingMode: false, presencePenalty: null, frequencyPenalty: null,
  safePrompt: false, randomSeed: null, organizationId: null,
  euEndpoint: false, enabledFields: null,
  ...overrides,
});

let pool: Pool;

beforeAll(async () => {
  const db = newDb({ noAstCoverageCheck: true });
  db.public.none(`
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.sessions (
      id UUID PRIMARY KEY,
      brand TEXT NOT NULL DEFAULT 'mentolder',
      client_id UUID,
      client_name TEXT,
      project_id UUID,
      ki_config_id INT,
      mode TEXT NOT NULL DEFAULT 'live',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ,
      is_test_data BOOLEAN NOT NULL DEFAULT false,
      llm_summary TEXT,
      llm_summary_at TIMESTAMPTZ
    );
    CREATE TABLE coaching.session_steps (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES coaching.sessions(id) ON DELETE CASCADE,
      step_number INT NOT NULL,
      step_name TEXT NOT NULL,
      phase TEXT NOT NULL,
      coach_inputs JSONB NOT NULL DEFAULT '{}',
      ai_prompt TEXT,
      ai_response TEXT,
      coach_notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      generated_at TIMESTAMPTZ,
      UNIQUE (session_id, step_number)
    );
  `);
  const { Pool: PgMemPool } = db.adapters.createPg();
  pool = new PgMemPool() as unknown as Pool;
});

beforeEach(async () => {
  mockCreate.mockReset();
  clientConfigs.length = 0;
  getProviderByNameMock.mockReset();
  getActiveProviderMock.mockReset();
  getKiProviderByIdMock.mockReset().mockResolvedValue(null);
  await pool.query(`DELETE FROM coaching.session_steps`);
  await pool.query(`DELETE FROM coaching.sessions`);
});

async function seedSession(overrides: Record<string, unknown> = {}) {
  await pool.query(
    `INSERT INTO coaching.sessions
       (id, brand, title, status, created_by)
     VALUES ($1, 'mentolder', 'Sitzung 1', 'completed', 'tester')`,
    [SESSION_ID],
  );
  if (overrides.llm_summary !== undefined || overrides.llm_summary_at !== undefined) {
    await pool.query(
      `UPDATE coaching.sessions SET llm_summary = $2, llm_summary_at = $3 WHERE id = $1`,
      [SESSION_ID, overrides.llm_summary ?? null, overrides.llm_summary_at ?? null],
    );
  }
}

async function seedStep(stepNumber: number, stepName: string, aiResponse: string | null, coachNotes: string | null) {
  await pool.query(
    `INSERT INTO coaching.session_steps
       (id, session_id, step_number, step_name, phase, ai_response, coach_notes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [`22222222-2222-2222-2222-2222222222${String(stepNumber).padStart(2, '0')}`, SESSION_ID, stepNumber, stepName, `Phase-${stepNumber}`, aiResponse, coachNotes, 'generated'],
  );
}

describe('buildSummaryInput', () => {
  it('baut den Input aus ai_response und coach_notes und ueberspringt leere Schritte', () => {
    const input = buildSummaryInput([
      { stepNumber: 1, stepName: 'Anliegen', phase: 'Phase-1', aiResponse: 'Der Klient moechte Klarheit.', coachNotes: 'Beobachtung: Druck auf Karriere.' },
      { stepNumber: 2, stepName: 'Ressourcen', phase: 'Phase-2', aiResponse: '', coachNotes: '' },
      { stepNumber: 3, stepName: 'Bilanz', phase: 'Phase-3', aiResponse: 'Naechste Schritte definiert.', coachNotes: null },
    ]);
    expect(input).toContain('Anliegen');
    expect(input).toContain('Der Klient moechte Klarheit.');
    expect(input).toContain('Beobachtung: Druck auf Karriere.');
    expect(input).toContain('Bilanz');
    // Schritt 2 ist leer und darf im Input nicht auftauchen.
    expect(input).not.toContain('Ressourcen');
  });
});

describe('generateSessionSummary', () => {
  it('ist idempotent: vorhandene llm_summary_at ohne force verursacht keinen Provider-Call', async () => {
    await seedSession({ llm_summary: 'Alte Zusammenfassung', llm_summary_at: new Date('2026-08-01T10:00:00Z') });
    await seedStep(1, 'Anliegen', 'Text A', 'Notiz A');

    const result = await generateSessionSummary(pool, { sessionId: SESSION_ID, brand: 'mentolder' });

    expect(result.summary).toBe('Alte Zusammenfassung');
    expect(result.cached).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(getActiveProviderMock).not.toHaveBeenCalled();
  });

  it('force=1 ueberschreibt eine vorhandene Zusammenfassung', async () => {
    await seedSession({ llm_summary: 'Alte Zusammenfassung', llm_summary_at: new Date('2026-08-01T10:00:00Z') });
    await seedStep(1, 'Anliegen', 'Text A', 'Notiz A');
    getActiveProviderMock.mockResolvedValue(baseConfig());
    getProviderByNameMock.mockResolvedValue({
      provider: 'local-cluster', modelId: 'bge-3', baseUrl: null, apiKey: 'sk-local',
      contextWindow: null, contextBudget: null, dataResidency: 'on_premises',
    });
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'Neue Zusammenfassung' } }] });

    const result = await generateSessionSummary(pool, { sessionId: SESSION_ID, brand: 'mentolder', force: true });

    expect(result.summary).toBe('Neue Zusammenfassung');
    expect(result.cached).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('DataResidencyError bei externem Provider — der Call wird NICHT gesendet', async () => {
    await seedSession();
    await seedStep(1, 'Anliegen', 'Text A', 'Notiz A');
    getActiveProviderMock.mockResolvedValue(baseConfig({ provider: 'deepseek', modelName: 'deepseek-chat' }));
    getProviderByNameMock.mockResolvedValue({
      provider: 'deepseek', modelId: 'deepseek-chat', baseUrl: null, apiKey: 'sk-ext',
      contextWindow: null, contextBudget: null, dataResidency: 'external',
    });

    await expect(
      generateSessionSummary(pool, { sessionId: SESSION_ID, brand: 'mentolder' }),
    ).rejects.toThrow(/on-premises/);

    expect(mockCreate).not.toHaveBeenCalled();
    // Positiv-Anker: der Client wurde gar nicht erst gebaut.
    expect(clientConfigs).toHaveLength(0);
  });

  it('Happy Path: generiert, persistiert llm_summary und liefert die Metadaten', async () => {
    await seedSession();
    await seedStep(1, 'Anliegen', 'Der Klient moechte Klarheit ueber den Berufswechsel.', 'Erster Schritt gut gelaufen.');
    await seedStep(2, 'Ressourcen', 'Staerken liegen in der Vernetzung.', null);
    getActiveProviderMock.mockResolvedValue(baseConfig());
    getProviderByNameMock.mockResolvedValue({
      provider: 'local-cluster', modelId: 'bge-3', baseUrl: null, apiKey: 'sk-local',
      contextWindow: null, contextBudget: null, dataResidency: 'on_premises',
    });
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'Zusammenfassung der Sitzung.' } }] });

    const result = await generateSessionSummary(pool, { sessionId: SESSION_ID, brand: 'mentolder' });

    expect(result.summary).toBe('Zusammenfassung der Sitzung.');
    expect(result.provider).toBe('local-cluster');
    expect(result.cached).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // Der System-Prompt ist die Zusammenfassungs-Anweisung, der User-Prompt der
    // gebaute Input — beide erreichen den Provider.
    const call = mockCreate.mock.calls[0][0] as { messages: { role: string; content: string }[] };
    expect(call.messages[0].role).toBe('system');
    expect(call.messages[0].content).toContain('Zusammenfassung');
    expect(call.messages.at(-1)?.content).toContain('Der Klient moechte Klarheit');
    // Persistenz: die Session traegt jetzt die Zusammenfassung.
    const { rows } = await pool.query(`SELECT llm_summary, llm_summary_at FROM coaching.sessions WHERE id = $1`, [SESSION_ID]);
    expect(rows[0].llm_summary).toBe('Zusammenfassung der Sitzung.');
    expect(rows[0].llm_summary_at).not.toBeNull();
    // Und ein zweiter Aufruf ohne force ist jetzt idempotent (cached).
    const second = await generateSessionSummary(pool, { sessionId: SESSION_ID, brand: 'mentolder' });
    expect(second.cached).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('wirft, wenn die Session nicht existiert oder keine Schritt-Inhalte vorliegen', async () => {
    await expect(
      generateSessionSummary(pool, { sessionId: '99999999-9999-9999-9999-999999999999', brand: 'mentolder' }),
    ).rejects.toThrow(/nicht gefunden/);

    await seedSession();
    await seedStep(1, 'Anliegen', null, null);
    getActiveProviderMock.mockResolvedValue(baseConfig());
    await expect(
      generateSessionSummary(pool, { sessionId: SESSION_ID, brand: 'mentolder' }),
    ).rejects.toThrow(/Schritt|Inhalt/);
  });
});
