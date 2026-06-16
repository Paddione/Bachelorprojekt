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
