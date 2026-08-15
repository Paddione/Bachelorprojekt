import { describe, it, expect } from 'vitest';
import {
  ALL_PRIORITIES, WORKFLOW_STATUSES, ACTIVE_STATUSES,
  STATUS_LABELS,
  statusLabel, priorityLabel, typeLabel, resolutionLabel,
  defaultResolutionFor, isTerminal, nextTransitions,
} from './cockpit-labels';

describe('cockpit-labels', () => {
  it('ALL_PRIORITIES includes kritisch', () => {
    expect(ALL_PRIORITIES).toContain('kritisch');
  });
  it('labels known enums and falls back to the raw value', () => {
    expect(statusLabel('in_progress')).toBe('In Arbeit');
    expect(priorityLabel('hoch')).toBe('Hoch');
    expect(typeLabel('bug')).toBe('Bug');
    expect(resolutionLabel('fixed')).toBe('Behoben');
    expect(statusLabel('weird_unknown')).toBe('weird_unknown');
  });
  it('defaultResolutionFor picks fixed for bugs, shipped otherwise', () => {
    expect(defaultResolutionFor('bug')).toBe('fixed');
    expect(defaultResolutionFor('feature')).toBe('shipped');
    expect(defaultResolutionFor('task')).toBe('shipped');
  });
  it('isTerminal marks done/archived but not active states', () => {
    expect(isTerminal('done')).toBe(true);
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('in_progress')).toBe(false);
    expect(ACTIVE_STATUSES).not.toContain('done');
    expect(ACTIVE_STATUSES).toContain('in_progress');
  });
  it('nextTransitions excludes current and offers done/blocked for active', () => {
    const next = nextTransitions('in_progress');
    expect(next).toContain('done');
    expect(next).toContain('blocked');
    expect(next).not.toContain('in_progress');
  });
  it('nextTransitions offers reopen for terminal', () => {
    expect(nextTransitions('done')).toContain('in_progress');
  });
  it('WORKFLOW_STATUSES are real, non-empty', () => {
    expect(WORKFLOW_STATUSES.length).toBeGreaterThan(0);
    expect(WORKFLOW_STATUSES).toContain('done');
  });
  it('awaiting_deploy has a display label', () => {
    expect(STATUS_LABELS.awaiting_deploy).toBe('Wartet auf Deploy');
  });
  it('awaiting_deploy is a workflow status in the table dropdown', () => {
    expect(WORKFLOW_STATUSES).toContain('awaiting_deploy');
  });
});
