import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BusinessRole } from '../business-memberships';

// Negative control for the red step: the store stays empty and refuses
// writes, so every allow-path assertion below fails while deny-path
// assertions hold. Unset for the green run.
const NEGATIVE = process.env.WF_NEGATIVE_CONTROL === '1';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../messaging-db-pool', () => ({ pool: { query: mockQuery } }));

import {
  listMembershipsForUser,
  listMembershipsForBrand,
  getMembership,
  addMembership,
  removeMembership,
} from '../business-memberships';

interface FakeRow {
  user_key: string;
  brand: string;
  role: BusinessRole;
  created_at: Date;
}

const store = new Map<string, FakeRow>();
const storeKey = (userKey: string, brand: string): string => `${userKey} ${brand}`;

function seed(userKey: string, brand: string, role: BusinessRole): void {
  if (NEGATIVE) return; // negative control: the store stays empty
  store.set(storeKey(userKey, brand), {
    user_key: userKey,
    brand,
    role,
    created_at: new Date('2026-10-07T00:00:00Z'),
  });
}

mockQuery.mockImplementation((text: string, params: string[]) => {
  if (text.includes('ON CONFLICT')) {
    if (NEGATIVE) return { rows: [] };
    const [userKey, brand, role] = params as [string, string, BusinessRole];
    const row: FakeRow = { user_key: userKey, brand, role, created_at: new Date() };
    store.set(storeKey(userKey, brand), row);
    return { rows: [row] };
  }
  if (text.startsWith('DELETE')) {
    const [userKey, brand] = params as [string, string];
    const existed = store.delete(storeKey(userKey, brand));
    return { rowCount: existed ? 1 : 0, rows: [] };
  }
  if (text.includes('user_key = $1 AND brand = $2')) {
    const [userKey, brand] = params as [string, string];
    const row = store.get(storeKey(userKey, brand));
    return { rows: row ? [row] : [] };
  }
  if (text.includes('user_key = $1')) {
    const [userKey] = params as [string];
    return { rows: [...store.values()].filter((row) => row.user_key === userKey) };
  }
  if (text.includes('brand = $1')) {
    const [brand] = params as [string];
    return { rows: [...store.values()].filter((row) => row.brand === brand) };
  }
  throw new Error(`unexpected SQL: ${text}`);
});

beforeEach(() => {
  store.clear();
  mockQuery.mockClear();
});

describe('getMembership', () => {
  it('returns the role for a known user-business pair', async () => {
    seed('user-1', 'brand-a', 'owner');
    const found = await getMembership('user-1', 'brand-a');
    expect(found?.role).toBe('owner');
    expect(found?.userKey).toBe('user-1');
    expect(found?.brand).toBe('brand-a');
  });

  it('yields no membership for an unknown user', async () => {
    seed('user-1', 'brand-a', 'owner');
    await expect(getMembership('nobody', 'brand-a')).resolves.toBeNull();
  });
});

describe('addMembership', () => {
  it('maps role values to the documented owner/member set', async () => {
    await expect(
      addMembership({ userKey: 'user-1', brand: 'brand-a', role: 'member' }),
    ).resolves.toMatchObject({ role: 'member' });
    await expect(
      addMembership({ userKey: 'user-1', brand: 'brand-a', role: 'owner' }),
    ).resolves.toMatchObject({ role: 'owner' });
  });
});

describe('cross-tenant isolation', () => {
  it('a user of business A sees no rows of business B', async () => {
    seed('user-1', 'brand-a', 'owner');
    await expect(getMembership('user-1', 'brand-b')).resolves.toBeNull();
    await expect(listMembershipsForBrand('brand-b')).resolves.toEqual([]);
    const mine = await listMembershipsForUser('user-1');
    expect(mine.every((row) => row.brand === 'brand-a')).toBe(true);
  });

  it('filters by brand through a query parameter', async () => {
    seed('user-1', 'brand-b', 'member');
    await listMembershipsForBrand('brand-b');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('brand = $1'), ['brand-b']);
  });
});

describe('removeMembership', () => {
  it('reports the affected row count', async () => {
    seed('user-1', 'brand-a', 'owner');
    await expect(removeMembership('user-1', 'brand-a')).resolves.toBe(1);
    await expect(removeMembership('user-1', 'brand-a')).resolves.toBe(0);
  });
});
