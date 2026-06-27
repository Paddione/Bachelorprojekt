import { describe, it, expect } from 'vitest';
import {
  parseTriageComment,
  renderTriageSuggestionHTML,
  buildConfirmActionPayload,
} from './triage-display';

describe('parseTriageComment', () => {
  it('parses a critical-with-confidence comment', () => {
    const body = 'Some intro.\nVorgeschlagene Severity: critical (Confidence: 87%)\nMore text.';
    const out = parseTriageComment(body);
    expect(out?.severity).toBe('critical');
    expect(out?.confidence).toBe(0.87);
  });

  it('parses lower-case severities and tolerates extra whitespace', () => {
    const out = parseTriageComment('Vorgeschlagene Severity:    medium   (Confidence: 50%)');
    expect(out?.severity).toBe('medium');
    expect(out?.confidence).toBe(0.5);
  });

  it('returns null for a body that does not contain the marker', () => {
    expect(parseTriageComment('nothing here')).toBeNull();
  });

  it('returns null for an invalid severity', () => {
    expect(parseTriageComment('Vorgeschlagene Severity: banana (Confidence: 50%)')).toBeNull();
  });
});

describe('renderTriageSuggestionHTML', () => {
  it('embeds severity, confidence, and a confirm button', () => {
    const html = renderTriageSuggestionHTML({
      severity: 'high',
      confidence: 0.42,
      reasoning: 'r',
      auto_apply: false,
      comment_id: 'c1',
    });
    expect(html).toContain('data-severity="high"');
    expect(html).toContain('high');
    expect(html).toContain('42%');
    expect(html).toContain('triage-confirm-btn');
  });

  it('rounds confidence to nearest percent', () => {
    const html = renderTriageSuggestionHTML({
      severity: 'low',
      confidence: 0.8765,
      reasoning: '',
      auto_apply: false,
      comment_id: '',
    });
    expect(html).toContain('88%');
  });
});

describe('buildConfirmActionPayload', () => {
  it('produces the wire payload for the confirm endpoint', () => {
    const out = buildConfirmActionPayload(
      { severity: 'high', confidence: 0.9, reasoning: '', auto_apply: false, comment_id: 'c-99' },
      'T000001',
    );
    expect(out).toEqual({ ticketId: 'T000001', severity: 'high', resolveCommentId: 'c-99' });
  });
});
