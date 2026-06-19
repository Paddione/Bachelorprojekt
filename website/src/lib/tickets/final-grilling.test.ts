import { describe, it, expect } from 'vitest';
import { buildGrillingSessionData } from './final-grilling';

const TICKET = {
  external_id: 'T999',
  title: 'Fix grilling widget',
  body: 'Der Visual Companion zeigt keine Vorschläge an.',
  grilling_answers: {
    'final-grilling-v1': { q1: 'Bug fix im Frontend' },
  },
  attachments: [{ filename: 'spec.md', url: '/files/spec.md', mimetype: 'text/markdown' }],
};

describe('buildGrillingSessionData', () => {
  it('returns the correct ticketId and questionnaireId', () => {
    const data = buildGrillingSessionData(TICKET);
    expect(data.ticketId).toBe('T999');
    expect(data.questionnaireId).toBe('final-grilling-v1');
  });

  it('resolves all 23 questions with id, label, and section', () => {
    const data = buildGrillingSessionData(TICKET);
    expect(data.questions).toHaveLength(23);
    for (const q of data.questions) {
      expect(typeof q.id).toBe('string');
      expect(q.id.length).toBeGreaterThan(0);
      expect(typeof q.label).toBe('string');
      expect(q.label.length).toBeGreaterThan(0);
      expect(typeof q.section).toBe('string');
    }
  });

  it('populates hints from ticket body for every question', () => {
    const data = buildGrillingSessionData(TICKET);
    for (const q of data.questions) {
      expect(data.hints[q.id]).toContain('Ticket:');
    }
  });

  it('appends "Bereits beantwortet" to hints for answered questions', () => {
    const data = buildGrillingSessionData(TICKET);
    expect(data.hints['q1']).toContain('Bereits beantwortet: Bug fix im Frontend');
  });

  it('populates suggestions (Visual Companion) for known question IDs', () => {
    const data = buildGrillingSessionData(TICKET);
    // Visual Companion must show chips for standard questions
    expect(Array.isArray(data.suggestions['q1'])).toBe(true);
    expect(data.suggestions['q1'].length).toBeGreaterThan(0);
    expect(data.suggestions['q13']).toContain('Unit-Tests (Vitest)');
    expect(data.suggestions['q17']).toContain('mentolder (prod)');
    expect(data.suggestions['q17']).toContain('korczewski (prod)');
  });

  it('returns no empty suggestion arrays (fail-soft: no key = no card)', () => {
    const data = buildGrillingSessionData(TICKET);
    for (const [, chips] of Object.entries(data.suggestions)) {
      expect(chips.length).toBeGreaterThan(0);
    }
  });

  it('maps attachments to assets correctly', () => {
    const data = buildGrillingSessionData(TICKET);
    expect(data.assets).toHaveLength(1);
    expect(data.assets[0]).toEqual({ name: 'spec.md', url: '/files/spec.md', type: 'text/markdown' });
  });

  it('exposes existingAnswers from the matching questionnaire', () => {
    const data = buildGrillingSessionData(TICKET);
    expect(data.existingAnswers['q1']).toBe('Bug fix im Frontend');
  });

  it('handles ticket without body gracefully', () => {
    const minimal = { external_id: 'T000', title: 'Minimal ticket' };
    const data = buildGrillingSessionData(minimal);
    expect(data.questions).toHaveLength(23);
    // hints fall back to title
    expect(data.hints['q1']).toContain('Ticket: Minimal ticket');
    expect(data.existingAnswers).toEqual({});
    expect(data.assets).toEqual([]);
  });
});
