import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('cockpitStore', () => {
  it('starts with no selected feature and no selected tickets', async () => {
    const m = await import('./cockpitStore');
    const s = get(m.cockpitStore);
    expect(s.selectedFeature).toBeNull();
    expect(s.selectedTickets.size).toBe(0);
  });
  it('selectFeature sets selectedFeature and persists to localStorage', async () => {
    const m = await import('./cockpitStore');
    m.selectFeature('F-AUTH');
    expect(get(m.cockpitStore).selectedFeature).toBe('F-AUTH');
    expect(localStorage.getItem('cockpit:feature')).toBe('F-AUTH');
  });
  it('selectFeature(null) clears the persisted value', async () => {
    const m = await import('./cockpitStore');
    m.selectFeature('F-AUTH');
    m.selectFeature(null);
    expect(get(m.cockpitStore).selectedFeature).toBeNull();
    expect(localStorage.getItem('cockpit:feature')).toBeNull();
  });
  it('toggles ticket selection', async () => {
    const m = await import('./cockpitStore');
    m.clearSelection();
    m.toggleTicketSelection('T1');
    expect(get(m.cockpitStore).selectedTickets.has('T1')).toBe(true);
    m.toggleTicketSelection('T1');
    expect(get(m.cockpitStore).selectedTickets.has('T1')).toBe(false);
  });
  it('caps ticket selection at 10', async () => {
    const m = await import('./cockpitStore');
    m.clearSelection();
    for (let i = 0; i < 10; i++) {
      m.toggleTicketSelection(`T${i}`);
    }
    expect(get(m.cockpitStore).selectedTickets.size).toBe(10);
    // Try adding the 11th ticket
    m.toggleTicketSelection('T10');
    expect(get(m.cockpitStore).selectedTickets.size).toBe(10);
    expect(get(m.cockpitStore).selectedTickets.has('T10')).toBe(false);
    // Can still remove an existing ticket
    m.toggleTicketSelection('T0');
    expect(get(m.cockpitStore).selectedTickets.size).toBe(9);
    expect(get(m.cockpitStore).selectedTickets.has('T0')).toBe(false);
  });
  it('applies + rolls back optimistic edits', async () => {
    const m = await import('./cockpitStore');
    const rollback = m.applyOptimistic('T1', 'status', 'done', 'open');
    expect(get(m.cockpitStore).optimistic['T1:status'].newValue).toBe('done');
    rollback();
    expect(get(m.cockpitStore).optimistic['T1:status']).toBeUndefined();
  });
});
