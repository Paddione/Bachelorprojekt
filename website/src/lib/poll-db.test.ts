import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POLL_TEMPLATES, buildResultsBotMessage } from './poll-db.js';

test('POLL_TEMPLATES: has 5 entries', () => {
  assert.equal(POLL_TEMPLATES.length, 5);
});

test('POLL_TEMPLATES: all MC templates have >= 2 options', () => {
  for (const t of POLL_TEMPLATES) {
    if (t.kind === 'multiple_choice') {
      assert.ok(
        Array.isArray(t.options) && t.options.length >= 2,
        `${t.label} must have >= 2 options`,
      );
    }
  }
});

test('POLL_TEMPLATES: text template has null options', () => {
  const text = POLL_TEMPLATES.find(t => t.kind === 'text');
  assert.ok(text, 'should have at least one text template');
  assert.equal(text.options, null);
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
  assert.ok(msg.includes('Wie geht es?'), 'should include question');
  assert.ok(msg.includes('Gut: 5'), 'should include Gut count');
  assert.ok(msg.includes('Mittel: 2'), 'should include Mittel count');
  assert.ok(msg.includes('https://web.example.com/poll/abc/results'), 'should include URL');
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
  assert.ok(msg.includes('Was nehmen Sie mit?'), 'should include question');
  assert.ok(msg.includes('4 Antworten'), 'should include total count');
  assert.ok(msg.includes('https://web.example.com/poll/xyz/results'), 'should include URL');
  assert.ok(!msg.includes('Fokus: 3'), 'should NOT list individual text answers');
});
