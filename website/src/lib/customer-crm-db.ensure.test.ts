import { describe, it, expect, vi, beforeEach } from 'vitest';

const queries: string[] = [];
vi.mock('./website-db', async () => {
  const actual = await vi.importActual<typeof import('./website-db')>('./website-db');
  return {
    ...actual,
    pool: { query: vi.fn(async (sql: string) => { queries.push(sql); return { rows: [] }; }) },
  };
});

beforeEach(() => { queries.length = 0; });

describe('ensureCustomerCrmSchema', () => {
  it('issues idempotent ALTER/CREATE DDL', async () => {
    const mod = await import('./customer-crm-db');
    await mod.ensureCustomerCrmSchema();
    const all = queries.join('\n');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS address');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS customer_status');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS tags TEXT[]');
    expect(all).toContain('CREATE TABLE IF NOT EXISTS customer_contact_history');
    expect(all).toContain('idx_customer_contact_history_user');
  });
});
