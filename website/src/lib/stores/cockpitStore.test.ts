import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('cockpitStore', () => {
  it('defaults to ueberblick/karten', async () => {
    const m = await import('./cockpitStore');
    const s = get(m.cockpitStore);
    expect(s.lens).toBe('ueberblick');
    expect(s.mode).toBe('karten');
  });
  it('setLens persists to localStorage', async () => {
    const m = await import('./cockpitStore');
    m.setLens('werkbank');
    expect(get(m.cockpitStore).lens).toBe('werkbank');
    expect(localStorage.getItem('cockpit:lens')).toBe('werkbank');
  });
  it('hydrates from URL params', async () => {
    const m = await import('./cockpitStore');
    m.initStoreFromUrl(new URLSearchParams('lens=werkbank&mode=tabelle&produkt=ABC'));
    const s = get(m.cockpitStore);
    expect(s.lens).toBe('werkbank');
    expect(s.mode).toBe('tabelle');
    expect(s.currentProduct).toBe('ABC');
  });
  it('toggles ticket selection', async () => {
    const m = await import('./cockpitStore');
    m.toggleTicketSelection('T1');
    expect(get(m.cockpitStore).selectedTickets.has('T1')).toBe(true);
    m.toggleTicketSelection('T1');
    expect(get(m.cockpitStore).selectedTickets.has('T1')).toBe(false);
  });
  it('applies + rolls back optimistic edits', async () => {
    const m = await import('./cockpitStore');
    const rollback = m.applyOptimistic('T1', 'status', 'done', 'open');
    expect(get(m.cockpitStore).optimistic['T1:status'].newValue).toBe('done');
    rollback();
    expect(get(m.cockpitStore).optimistic['T1:status']).toBeUndefined();
  });
});
