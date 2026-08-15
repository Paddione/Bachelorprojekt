import assert from 'node:assert/strict';
import { computeScores } from '../src/lib/compute-scores.ts';

// Helper: build minimal dimension
const dim = (id, tMid, tHigh, mult = 1) => ({
  id, name: id, position: 0, template_id: 't1',
  threshold_mid: tMid, threshold_high: tHigh,
  score_multiplier: mult, created_at: '',
});

// Helper: build answer option
const opt = (questionId, optionKey, dimensionId, weight = 1) => ({
  id: `opt-${questionId}-${optionKey}`, question_id: questionId,
  option_key: optionKey, label: '', dimension_id: dimensionId, weight,
});

// Test 1: A/B choice — A maps to dim1, B maps to dim2
{
  const dims = [dim('dim1', null, null), dim('dim2', null, null)];
  const options = [
    opt('q1', 'A', 'dim1'), opt('q1', 'B', 'dim2'),
    opt('q2', 'A', 'dim2'), opt('q2', 'B', 'dim1'),
  ];
  const answers = [
    { question_id: 'q1', option_key: 'A' },
    { question_id: 'q2', option_key: 'A' },
  ];
  const result = computeScores(dims, options, answers);
  assert.equal(result.find(r => r.dimension_id === 'dim1').final_score, 1, 'dim1 gets 1 from q1-A');
  assert.equal(result.find(r => r.dimension_id === 'dim2').final_score, 1, 'dim2 gets 1 from q2-A');
}

// Test 2: Ja/Nein — only Ja (dimension_id set) contributes
{
  const dims = [dim('distanz', null, null)];
  const options = [
    opt('q1', 'Ja', 'distanz'), opt('q1', 'Nein', null),
    opt('q2', 'Ja', 'distanz'), opt('q2', 'Nein', null),
  ];
  const answers = [
    { question_id: 'q1', option_key: 'Ja' },
    { question_id: 'q2', option_key: 'Nein' },
  ];
  const result = computeScores(dims, options, answers);
  assert.equal(result[0].final_score, 1, 'only q1 Ja contributes');
}

// Test 3: Likert score = option_key::int × weight, then × score_multiplier
{
  const dims = [dim('perfekt', 60, 80, 2)];
  const options = [
    opt('q1', '1', 'perfekt'), opt('q1', '2', 'perfekt'), opt('q1', '3', 'perfekt'),
    opt('q1', '4', 'perfekt'), opt('q1', '5', 'perfekt'),
    opt('q2', '1', 'perfekt'), opt('q2', '2', 'perfekt'), opt('q2', '3', 'perfekt'),
    opt('q2', '4', 'perfekt'), opt('q2', '5', 'perfekt'),
  ];
  const answers = [
    { question_id: 'q1', option_key: '5' },
    { question_id: 'q2', option_key: '4' },
  ];
  const result = computeScores(dims, options, answers);
  // raw = 5+4=9, final = 9×2=18
  assert.equal(result[0].final_score, 18, 'Likert with multiplier: (5+4)×2=18');
}

// Test 4: threshold level classification
{
  const dims = [dim('d', 60, 80, 1)];
  const options = [opt('q1', 'A', 'd')];

  const r1 = computeScores(dims, options, [{ question_id: 'q1', option_key: 'A' }]);
  assert.equal(r1[0].level, 'förderlich', '1 < 60 → förderlich');
}

// Test 5: no threshold → level is null
{
  const dims = [dim('d', null, null)];
  const options = [opt('q1', 'A', 'd')];
  const result = computeScores(dims, options, [{ question_id: 'q1', option_key: 'A' }]);
  assert.equal(result[0].level, null, 'no threshold → level null');
}

console.log('All compute-scores tests passed.');
