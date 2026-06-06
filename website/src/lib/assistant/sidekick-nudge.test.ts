// Unit tests for the pure Sidekick-nudge helpers (no DOM, no fetch).
import { describe, it, expect } from 'vitest';
import { decideBanner, parseNavigateEvent, shouldShowLearnDot } from './sidekick-nudge';

describe('decideBanner', () => {
  it('returns null when summary is null (fail-soft: no banner)', () => {
    expect(decideBanner(null)).toBeNull();
  });
  it('returns null when total is 0 (no canonical items)', () => {
    expect(decideBanner({ done: 0, total: 0 })).toBeNull();
  });
  it('start state when done === 0', () => {
    expect(decideBanner({ done: 0, total: 28 })).toEqual({
      kind: 'start', label: 'Starte deinen Lernpfad', done: 0, total: 28, cta: true,
    });
  });
  it('continue state when 0 < done < total', () => {
    expect(decideBanner({ done: 7, total: 28 })).toEqual({
      kind: 'continue', label: 'Weiter lernen · 7/28', done: 7, total: 28, cta: true,
    });
  });
  it('done state when done === total (no CTA)', () => {
    expect(decideBanner({ done: 28, total: 28 })).toEqual({
      kind: 'done', label: '✓ Lernpfad abgeschlossen', done: 28, total: 28, cta: false,
    });
  });
});

describe('parseNavigateEvent', () => {
  it('returns null for non-object / missing detail', () => {
    expect(parseNavigateEvent(undefined)).toBeNull();
    expect(parseNavigateEvent(null)).toBeNull();
    expect(parseNavigateEvent('x')).toBeNull();
  });
  it('returns null for an unknown view', () => {
    expect(parseNavigateEvent({ view: 'nope', jumpTo: 'ag-goal-x' })).toBeNull();
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
});

describe('shouldShowLearnDot', () => {
  it('false outside the portal context', () => {
    expect(shouldShowLearnDot({ done: 1, total: 28 }, 'website', false)).toBe(false);
  });
  it('false when a numeric badge already occupies the FAB', () => {
    expect(shouldShowLearnDot({ done: 1, total: 28 }, 'portal', true)).toBe(false);
  });
  it('false (fail-soft) when summary is null', () => {
    expect(shouldShowLearnDot(null, 'portal', false)).toBe(false);
  });
  it('false when total is 0 (no canonical items)', () => {
    expect(shouldShowLearnDot({ done: 0, total: 0 }, 'portal', false)).toBe(false);
  });
  it('true when 0 <= done < total in the portal with no badge', () => {
    expect(shouldShowLearnDot({ done: 0, total: 28 }, 'portal', false)).toBe(true);
    expect(shouldShowLearnDot({ done: 7, total: 28 }, 'portal', false)).toBe(true);
  });
  it('false when everything is learned (done === total)', () => {
    expect(shouldShowLearnDot({ done: 28, total: 28 }, 'portal', false)).toBe(false);
  });
});
