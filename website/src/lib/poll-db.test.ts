import { test, expect } from 'vitest';
import { POLL_TEMPLATES, buildResultsBotMessage } from './poll-db';

test('POLL_TEMPLATES: has 5 entries', () => {
  expect(POLL_TEMPLATES.length).toBe(5);
});

test('POLL_TEMPLATES: all MC templates have >= 2 options', () => {
  for (const t of POLL_TEMPLATES) {
    if (t.kind === 'multiple_choice') {
      expect(Array.isArray(t.options) && t.options.length >= 2).toBe(true);
    }
  }
});

test('POLL_TEMPLATES: text template has null options', () => {
  const text = POLL_TEMPLATES.find(t => t.kind === 'text');
  expect(text).toBeTruthy();
  expect(text!.options).toBe(null);
});

test('buildResultsBotMessage: MC format includes question, counts, and URL', () => {
  const results = {
    poll: {
      id: 'abc', question: 'Wie geht es?', kind: 'multiple_choice' as const,
      options: ['Gut', 'Mittel'], status: 'locked' as const,
      room_tokens: [], created_at: new Date(), locked_at: new Date(),
    },
    total: 7,
    counts: [{ answer: 'Gut', count: 5 }, { answer: 'Mittel', count: 2 }],
  };
  const msg = buildResultsBotMessage(results, 'https://web.example.com/poll/abc/results');
  expect(msg).toContain('Wie geht es?');
  expect(msg).toContain('Gut: 5');
  expect(msg).toContain('Mittel: 2');
  expect(msg).toContain('https://web.example.com/poll/abc/results');
});

test('buildResultsBotMessage: text format includes total and URL, not option breakdown', () => {
  const results = {
    poll: {
      id: 'xyz', question: 'Was nehmen Sie mit?', kind: 'text' as const,
      options: null, status: 'locked' as const,
      room_tokens: [], created_at: new Date(), locked_at: new Date(),
    },
    total: 4,
    counts: [{ answer: 'Fokus', count: 3 }, { answer: 'Pausen', count: 1 }],
  };
  const msg = buildResultsBotMessage(results, 'https://web.example.com/poll/xyz/results');
  expect(msg).toContain('Was nehmen Sie mit?');
  expect(msg).toContain('4 Antworten');
  expect(msg).toContain('https://web.example.com/poll/xyz/results');
  expect(msg).not.toContain('Fokus: 3');
});
