import { describe, it, expect } from 'vitest';
import { isBlankAnswer, splitAnswered, type ParsedQuestion } from './grilling';

describe('isBlankAnswer', () => {
  it('treats empty/whitespace/placeholders as blank', () => {
    for (const v of ['', '   ', '\n', '—', '-', 'tbd', 'TBD', '(offen)', 'n/a', 'N/A', null, undefined]) {
      expect(isBlankAnswer(v as string)).toBe(true);
    }
  });
  it('treats real text as not blank', () => {
    expect(isBlankAnswer('Alle zwei Wochen.')).toBe(false);
    expect(isBlankAnswer('no')).toBe(false);
  });
});

import { parseGrillingDoc } from './grilling';

describe('parseGrillingDoc', () => {
  it('parses ## headings with Antwort: markers and frontmatter', () => {
    const doc = [
      '---',
      'questionnaire: gekko-coaching-followup',
      'title: Coaching Follow-up',
      '---',
      '',
      '## Wie oft treffen?',
      'Antwort: Alle zwei Wochen.',
      '',
      '## Welche Themen?',
      '',
      '## Video oder Präsenz? {#format-pref}',
      'A: Video.',
    ].join('\n');
    const r = parseGrillingDoc(doc, 'fallback');
    expect(r.questionnaireId).toBe('gekko-coaching-followup');
    expect(r.title).toBe('Coaching Follow-up');
    expect(r.questions).toHaveLength(3);
    expect(r.questions[0]).toMatchObject({ id: 'q1', prompt: 'Wie oft treffen?', answer: 'Alle zwei Wochen.' });
    expect(r.questions[1]).toMatchObject({ id: 'q2', prompt: 'Welche Themen?' });
    expect(r.questions[1].answer).toBeUndefined();
    expect(r.questions[2]).toMatchObject({ id: 'format-pref', prompt: 'Video oder Präsenz?', answer: 'Video.' });
  });

  it('falls back to fallbackId when frontmatter is absent', () => {
    const r = parseGrillingDoc('## Nur eine Frage?', 'my-file');
    expect(r.questionnaireId).toBe('my-file');
    expect(r.title).toBe('my-file');
    expect(r.questions).toEqual([{ id: 'q1', prompt: 'Nur eine Frage?' }]);
  });

  it('accepts numbered list markers and explicit qN tokens', () => {
    const doc = ['1. Erste Frage?', 'Antwort: Eins.', '2) Zweite Frage?', 'q5. Fünfte Frage?'].join('\n');
    const r = parseGrillingDoc(doc, 'fb');
    expect(r.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q5']);
    expect(r.questions[0].answer).toBe('Eins.');
  });

  it('treats blockquote and following-paragraph as answers; merges multi-line', () => {
    const doc = ['## Frage A?', '> Zeile eins', '> Zeile zwei', '', '## Frage B?', 'Ein Folgeabsatz', 'noch eine Zeile'].join('\n');
    const r = parseGrillingDoc(doc, 'fb');
    expect(r.questions[0].answer).toBe('Zeile eins\nZeile zwei');
    expect(r.questions[1].answer).toBe('Ein Folgeabsatz\nnoch eine Zeile');
  });

  it('treats placeholder answer values as no answer', () => {
    const doc = ['## Frage?', 'Antwort: —'].join('\n');
    const r = parseGrillingDoc(doc, 'fb');
    expect(r.questions[0].answer === undefined || r.questions[0].answer === '—').toBe(true);
  });
});

import {
  resolveQuestions, questionStatus, grillingProgress,
  type GrillingMeta,
} from './grilling';
import { QUESTIONNAIRES } from './grilling';

const QN = 'coaching-sessions-v1';

describe('resolveQuestions', () => {
  it('returns registry questions flattened when no meta', () => {
    const r = resolveQuestions(QN, QUESTIONNAIRES, null);
    expect(r).toHaveLength(23);
    expect(r[0]).toMatchObject({ id: 'q1', section: '1. Die Coaching-Beziehung' });
  });
  it('resolves final-grilling-v1 with 23 questions across 6 sections', () => {
    const r = resolveQuestions('final-grilling-v1', QUESTIONNAIRES, null);
    expect(r).toHaveLength(23);
    expect(r[0]).toMatchObject({ id: 'q1', section: '1. Anforderungsklärung' });
    expect(r[22]).toMatchObject({ id: 'q23', section: '6. Abschluss & Übergabe' });
  });
  it('unions absorbed meta questions (new ids appended, existing ids kept registry-first)', () => {
    const meta: GrillingMeta = {
      [QN]: { questions: [{ id: 'q1', prompt: 'override?' }, { id: 'qX', prompt: 'absorbed?' }], dismissed: [] },
    };
    const r = resolveQuestions(QN, QUESTIONNAIRES, meta);
    expect(r.find((q) => q.id === 'qX')).toMatchObject({ id: 'qX', prompt: 'absorbed?' });
    expect(r.filter((q) => q.id === 'q1')).toHaveLength(1);
  });
  it('returns absorbed-only questions for a questionnaire not in the registry', () => {
    const meta: GrillingMeta = { 'doc-x': { questions: [{ id: 'a', prompt: 'A?' }], dismissed: [] } };
    expect(resolveQuestions('doc-x', QUESTIONNAIRES, meta)).toEqual([{ id: 'a', prompt: 'A?' }]);
  });
});

describe('questionStatus', () => {
  const answers = { [QN]: { q1: 'Ja' } };
  const meta: GrillingMeta = { [QN]: { questions: [], dismissed: ['q2'] } };
  it('answered when non-blank answer present', () => {
    expect(questionStatus('q1', QN, answers, meta)).toBe('answered');
  });
  it('dismissed when in meta.dismissed and not answered', () => {
    expect(questionStatus('q2', QN, answers, meta)).toBe('dismissed');
  });
  it('open otherwise', () => {
    expect(questionStatus('q3', QN, answers, meta)).toBe('open');
  });
  it('answered beats dismissed', () => {
    const a2 = { [QN]: { q2: 'spät beantwortet' } };
    expect(questionStatus('q2', QN, a2, meta)).toBe('answered');
  });
});

describe('grillingProgress', () => {
  it('counts total/answered/dismissed/open over registry ∪ meta', () => {
    const answers = { [QN]: { q1: 'Ja', q2: 'Auch' } };
    const meta: GrillingMeta = { [QN]: { questions: [{ id: 'qX', prompt: 'extra?' }], dismissed: ['q3'] } };
    const p = grillingProgress(QN, QUESTIONNAIRES, answers, meta);
    expect(p.total).toBe(24);
    expect(p.answered).toBe(2);
    expect(p.dismissed).toBe(1);
    expect(p.open).toBe(21);
  });
});

describe('splitAnswered', () => {
  it('splits by answer presence using isBlankAnswer', () => {
    const qs: ParsedQuestion[] = [
      { id: 'q1', prompt: 'A?', answer: 'Ja' },
      { id: 'q2', prompt: 'B?' },
      { id: 'q3', prompt: 'C?', answer: '  ' },
      { id: 'q4', prompt: 'D?', answer: 'tbd' },
    ];
    const { answered, unanswered } = splitAnswered(qs);
    expect(answered.map((q) => q.id)).toEqual(['q1']);
    expect(unanswered.map((q) => q.id)).toEqual(['q2', 'q3', 'q4']);
  });
});

import { getQuestionnaire } from './grilling';

describe('GrillingQuestion.choices', () => {
  it('final-grilling-v1 q13 (Test-Typen) exposes choices', () => {
    const qn = getQuestionnaire('final-grilling-v1')!;
    const q13 = qn.sections.flatMap((s) => s.questions).find((q) => q.id === 'q13')!;
    expect(q13.choices).toEqual(['Unit', 'Integration', 'E2E', 'Unit + E2E', 'Alle drei']);
  });
  it('coaching-sessions-v1 q4 (Rhythmus) exposes choices', () => {
    const qn = getQuestionnaire('coaching-sessions-v1')!;
    const q4 = qn.sections.flatMap((s) => s.questions).find((q) => q.id === 'q4')!;
    expect(q4.choices).toEqual(['Wöchentlich', 'Alle 2 Wochen', 'Monatlich', 'Bedarfsgesteuert']);
  });
  it('a question without choices has choices === undefined', () => {
    const qn = getQuestionnaire('final-grilling-v1')!;
    const q1 = qn.sections.flatMap((s) => s.questions).find((q) => q.id === 'q1')!;
    expect(q1.choices).toBeUndefined();
  });
  it('resolveQuestions surfaces choices for registry questions that have them', () => {
    const resolved = resolveQuestions('final-grilling-v1', QUESTIONNAIRES, null);
    const q13 = resolved.find((q) => q.id === 'q13')!;
    expect(q13.choices).toEqual(['Unit', 'Integration', 'E2E', 'Unit + E2E', 'Alle drei']);
    const q1 = resolved.find((q) => q.id === 'q1')!;
    expect(q1.choices).toBeUndefined();
  });
});
