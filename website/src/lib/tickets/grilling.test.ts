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
