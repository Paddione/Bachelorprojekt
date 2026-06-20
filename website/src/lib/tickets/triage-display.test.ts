import { describe, it, expect } from 'vitest';
import {
  parseTriageComment,
  renderTriageSuggestionHTML,
  buildConfirmActionPayload,
  type TriageSuggestion
} from './triage-display.js';

describe('Triage Display Helpers', () => {
  describe('parseTriageComment', () => {
    it('should parse valid triage comments', () => {
      const comment = '## Vorgeschlagene Severity: critical (Confidence: 95%)';
      const result = parseTriageComment(comment);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.confidence).toBe(0.95);
    });

    it('should parse high severity with lower confidence case insensitively', () => {
      const comment = 'Vorgeschlagene Severity: HIGH (Confidence: 75%)';
      const result = parseTriageComment(comment);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('high');
      expect(result!.confidence).toBe(0.75);
    });

    it('should return null for invalid comments', () => {
      const comment = 'This is a regular comment about a bug.';
      const result = parseTriageComment(comment);
      expect(result).toBeNull();
    });
  });

  describe('renderTriageSuggestionHTML', () => {
    it('should render HTML with correct attributes and confidence percent', () => {
      const suggestion: TriageSuggestion = {
        severity: 'high',
        confidence: 0.85,
        reasoning: '',
        auto_apply: false,
        comment_id: 'comment-123'
      };
      const html = renderTriageSuggestionHTML(suggestion);
      expect(html).toContain('data-severity="high"');
      expect(html).toContain('Confidence: 85%');
      expect(html).toContain('class="triage-confirm-btn"');
    });
  });

  describe('buildConfirmActionPayload', () => {
    it('should build the correct payload', () => {
      const suggestion: TriageSuggestion = {
        severity: 'medium',
        confidence: 0.60,
        reasoning: '',
        auto_apply: false,
        comment_id: 'comment-456'
      };
      const payload = buildConfirmActionPayload(suggestion, 'T000992');
      expect(payload).toEqual({
        ticketId: 'T000992',
        severity: 'medium',
        resolveCommentId: 'comment-456'
      });
    });
  });
});
