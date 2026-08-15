import { describe, it, expect, vi } from 'vitest';

// Mock the pg Pool at module level — must be a class (constructor)
const mockQuery = vi.fn();
vi.mock('pg', () => ({
  default: {
    Pool: class MockPool {
      query = mockQuery;
    },
  },
}));

describe('getCustomerByKeycloakId', () => {
  it('returns null when no matching customer exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { getCustomerByKeycloakId } = await import('../website-db.js');
    const result = await getCustomerByKeycloakId('sub-unknown');
    expect(result).toBeNull();
  });

  it('returns id, email, name when customer found', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'cust-1', email: 'kunde@example.com', name: 'Max Muster' }],
    });
    const { getCustomerByKeycloakId } = await import('../website-db.js');
    const result = await getCustomerByKeycloakId('sub-abc');
    expect(result).toEqual({ id: 'cust-1', email: 'kunde@example.com', name: 'Max Muster' });
  });
});
