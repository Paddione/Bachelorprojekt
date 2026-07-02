import { describe, it, expect } from 'vitest';
import { toCockpitExpand } from '../cockpit-expand';

describe('toCockpitExpand', () => {
  it('maps latest event to phase segments and lists a PR link', () => {
    const model = toCockpitExpand({
      description: '  Hallo Welt  ',
      prNumber: 42,
      events: [
        { phase: 'implement', state: 'entered', detail: null, driver: 'factory', at: '2026-07-02T10:00:00Z' },
        { phase: 'plan', state: 'done', detail: null, driver: 'factory', at: '2026-07-02T09:00:00Z' },
      ],
    });
    expect(model.description).toBe('Hallo Welt');
    expect(model.segments.length).toBeGreaterThan(0);
    expect(model.links).toContainEqual({ label: 'PR #42', href: '#pr-42' });
    expect(model.latestEvents[0].phase).toBe('implement');
  });

  it('degrades gracefully with no events and no PR', () => {
    const model = toCockpitExpand({ description: null, prNumber: null, events: [] });
    expect(model.description).toBe('');
    expect(model.links).toEqual([]);
    expect(model.latestEvents).toEqual([]);
  });
});
