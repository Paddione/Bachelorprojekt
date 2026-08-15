import { describe, it, expect } from 'vitest';
import { computeScores } from './compute-scores';
import type { QDimension, QAnswerOption } from './questionnaire-db/types';

const dim = (
  id: string,
  name: string,
  position: number,
  multi = 1,
  mid: number | null = null,
  high: number | null = null,
): QDimension => ({
  id,
  template_id: 'tpl-test',
  name,
  position,
  score_multiplier: multi,
  threshold_mid: mid,
  threshold_high: high,
  created_at: '2024-01-01T00:00:00Z',
});

const opt = (
  dimension_id: string,
  question_id: string,
  option_key: string,
  weight: number,
): QAnswerOption => ({
  id: `${dimension_id}-${question_id}-${option_key}`,
  dimension_id,
  question_id,
  option_key,
  label: option_key,
  weight,
});

describe('computeScores', () => {
  it('returns empty array for no dimensions', () => {
    expect(computeScores([], [], [])).toEqual([]);
  });

  it('aggregates numeric option_key * weight for selected options', () => {
    const d = dim('d1', 'Self-Awareness', 1, 1, null, null);
    const o1 = opt('d1', 'q1', '2', 3);
    const o2 = opt('d1', 'q2', '3', 2);
    const o3 = opt('d1', 'q3', '1', 4);
    const out = computeScores([d], [o1, o2, o3], [
      { question_id: 'q1', option_key: '2' },
      { question_id: 'q2', option_key: '3' },
      { question_id: 'q3', option_key: '99' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].raw_score).toBe(12);
    expect(out[0].final_score).toBe(12);
    expect(out[0].level).toBeNull();
  });

  it('uses option_key as weight for non-numeric keys', () => {
    const d = dim('d1', 'X', 1, 1);
    const o = opt('d1', 'q1', 'yes', 5);
    const out = computeScores([d], [o], [{ question_id: 'q1', option_key: 'yes' }]);
    expect(out[0].raw_score).toBe(5);
  });

  it('ignores options for other dimensions', () => {
    const d1 = dim('d1', 'A', 1, 1);
    const d2 = dim('d2', 'B', 2, 1);
    const o1 = opt('d1', 'q1', '1', 4);
    const o2 = opt('d2', 'q1', '2', 99);
    const out = computeScores([d1, d2], [o1, o2], [
      { question_id: 'q1', option_key: '2' },
    ]);
    expect(out[0].raw_score).toBe(0);
    expect(out[1].raw_score).toBe(198);
  });

  it('applies score_multiplier (numeric option_key * weight * multiplier)', () => {
    const d = dim('d1', 'M', 1, 2.5);
    const o = opt('d1', 'q1', '2', 4);
    const out = computeScores([d], [o], [{ question_id: 'q1', option_key: '2' }]);
    expect(out[0].raw_score).toBe(8);
    expect(out[0].final_score).toBe(20);
  });

  it('classifies levels against thresholds (raw < mid, mid <= raw < high, raw >= high)', () => {
    const d1 = dim('low', 'low', 1, 1, 5, 10);
    const d2 = dim('mid', 'mid', 2, 1, 5, 10);
    const d3 = dim('high', 'high', 3, 1, 5, 10);
    const out = computeScores(
      [d1, d2, d3],
      [
        { id: 'o-low', dimension_id: 'low', question_id: 'q-low', option_key: '1', label: '1', weight: 1 },
        { id: 'o-mid', dimension_id: 'mid', question_id: 'q-mid', option_key: '6', label: '6', weight: 1 },
        { id: 'o-high', dimension_id: 'high', question_id: 'q-high', option_key: '10', label: '10', weight: 1 },
      ],
      [
        { question_id: 'q-low', option_key: '1' },
        { question_id: 'q-mid', option_key: '6' },
        { question_id: 'q-high', option_key: '10' },
      ],
    );
    expect(out[0].final_score).toBe(1);
    expect(out[0].level).toBe('förderlich');
    expect(out[1].final_score).toBe(6);
    expect(out[1].level).toBe('mittel');
    expect(out[2].final_score).toBe(10);
    expect(out[2].level).toBe('kritisch');
  });

  it('sorts the result by position', () => {
    const d1 = dim('a', 'A', 3, 1);
    const d2 = dim('b', 'B', 1, 1);
    const d3 = dim('c', 'C', 2, 1);
    const out = computeScores([d1, d2, d3], [], []);
    expect(out.map((d) => d.name)).toEqual(['B', 'C', 'A']);
  });

  it('skips the threshold check when mid/high are null', () => {
    const d = dim('d', 'X', 1, 1, null, null);
    const o = opt('d', 'q1', '1', 100);
    const out = computeScores([d], [o], [{ question_id: 'q1', option_key: '1' }]);
    expect(out[0].level).toBeNull();
    expect(out[0].threshold_mid).toBeNull();
    expect(out[0].threshold_high).toBeNull();
  });
});
