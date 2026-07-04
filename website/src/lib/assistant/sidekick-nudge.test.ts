// Unit tests for the pure Sidekick-nudge helpers (no DOM, no fetch).
import { describe, it, expect } from 'vitest';
import { parseNavigateEvent } from './sidekick-nudge';

describe('parseNavigateEvent', () => {
  it('returns null for non-object / missing detail', () => {
    expect(parseNavigateEvent(undefined)).toBeNull();
    expect(parseNavigateEvent(null)).toBeNull();
    expect(parseNavigateEvent('x')).toBeNull();
  });
  it('returns null for an unknown view', () => {
    expect(parseNavigateEvent({ view: 'nope', jumpTo: 'ag-goal-x' })).toBeNull();
  });
  it('returns null for a now-removed view (tickets/inbox/pipeline/grilling)', () => {
    expect(parseNavigateEvent({ view: 'tickets' })).toBeNull();
    expect(parseNavigateEvent({ view: 'inbox' })).toBeNull();
    expect(parseNavigateEvent({ view: 'pipeline' })).toBeNull();
    // grilling was replaced by terminal in T001565
    expect(parseNavigateEvent({ view: 'grilling' })).toBeNull();
  });
  it('accepts a known view and optional jumpTo', () => {
    expect(parseNavigateEvent({ view: 'agent-guide', jumpTo: 'ag-tool-superpowers' }))
      .toEqual({ view: 'agent-guide', jumpTo: 'ag-tool-superpowers' });
    expect(parseNavigateEvent({ view: 'home' }))
      .toEqual({ view: 'home', jumpTo: null });
  });
  it('coerces a non-string jumpTo to null', () => {
    expect(parseNavigateEvent({ view: 'agent-guide', jumpTo: 123 }))
      .toEqual({ view: 'agent-guide', jumpTo: null });
  });
  it('accepts terminal and mediaviewer views', () => {
    // terminal replaced grilling in T001565
    expect(parseNavigateEvent({ view: 'terminal' })).toEqual({ view: 'terminal', jumpTo: null });
    expect(parseNavigateEvent({ view: 'mediaviewer' })).toEqual({ view: 'mediaviewer', jumpTo: null });
  });
  it('accepts the ai-quality view', () => {
    expect(parseNavigateEvent({ view: 'ai-quality', jumpTo: null })).toEqual({ view: 'ai-quality', jumpTo: null });
  });
});
