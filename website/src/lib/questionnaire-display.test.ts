import { describe, it, expect } from 'vitest';
import { getDisplayScores } from './questionnaire-display';

// Mock the DB modules used by getDisplayScores so the pure function can be
// exercised without spinning up Postgres. The mock setup is intentionally
// minimal — we only cover the branch transitions in getDisplayScores itself.

type ScoreSnapshot = {
  dimension_id: string;
  dimension_name: string;
  final_score: number;
  threshold_mid: number | null;
  threshold_high: number | null;
  level: 'förderlich' | 'mittel' | 'kritisch' | null;
};

vi.mock('./questionnaire-db/queries', () => ({
  listQDimensions: async (templateId: string) => [
    { id: 'd1', name: 'D1', position: 1, score_multiplier: 1, threshold_mid: 5, threshold_high: 10 },
  ],
  listQAnswerOptionsForTemplate: async (_templateId: string) => [],
  listQAnswers: async (_assignmentId: string) => [],
}));

vi.mock('./questionnaire-db/scoring', () => ({
  listArchivedScores: async (assignmentId: string): Promise<ScoreSnapshot[]> => {
    if (assignmentId === 'archived-1') {
      return [
        {
          dimension_id: 'd1',
          dimension_name: 'Snapshot Dimension',
          final_score: 4,
          threshold_mid: 5,
          threshold_high: 10,
          level: 'förderlich',
        },
      ];
    }
    return [];
  },
}));

describe('getDisplayScores', () => {
  it('returns the archived snapshot for an archived assignment', async () => {
    const out = await getDisplayScores({
      id: 'archived-1',
      template_id: 't1',
      status: 'archived',
    } as never);
    expect(out).toHaveLength(1);
    expect(out[0].dimension_id).toBe('d1');
    expect(out[0].name).toBe('Snapshot Dimension');
    expect(out[0].raw_score).toBe(4);
    expect(out[0].final_score).toBe(4);
    expect(out[0].level).toBe('förderlich');
    expect(out[0].position).toBe(0);
  });

  it('returns computed scores for a non-archived assignment', async () => {
    const out = await getDisplayScores({
      id: 'live-1',
      template_id: 't1',
      status: 'in_progress',
    } as never);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('D1');
    expect(out[0].raw_score).toBe(0);
    expect(out[0].final_score).toBe(0);
    expect(out[0].level).toBe('förderlich');
    expect(out[0].position).toBe(1);
  });
});
