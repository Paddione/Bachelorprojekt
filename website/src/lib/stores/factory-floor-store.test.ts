import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import type { FloorPayload } from '../factory-floor-types';

const fake = { fetchedAt: '2026-07-15T00:00:00Z', hall: [], staged: [] } as unknown as FloorPayload;

beforeEach(() => { vi.resetModules(); });

describe('factory-floor-store', () => {
  it('seedFloor caches the SSR payload', async () => {
    const m = await import('./factory-floor-store');
    m.seedFloor(fake);
    expect(get(m.floorStore).payload).toEqual(fake);
  });
  it('ingestFloorPayload replaces the payload and clears stale', async () => {
    const m = await import('./factory-floor-store');
    m.ingestFloorPayload(fake);
    expect(get(m.floorStore).payload).toEqual(fake);
    expect(get(m.floorStore).stale).toBe(false);
  });
  it('acquireFloor ref-counts and releases at zero', async () => {
    const m = await import('./factory-floor-store');
    m.seedFloor(fake);
    const r1 = m.acquireFloor();
    const r2 = m.acquireFloor();
    expect(m.floorSubscriberCount()).toBe(2);
    r1(); r2();
    expect(m.floorSubscriberCount()).toBe(0);
  });
});
