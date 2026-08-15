import { describe, it, expect, vi } from 'vitest';
import {
  CONTACT_CHANNELS, COMM_FREQUENCIES, CUSTOMER_STATUSES, CONTACT_TYPES,
  validateProfileInput,
} from './customer-crm-db';

describe('CRM enums', () => {
  it('expose the allowed value sets', () => {
    expect(CONTACT_CHANNELS).toEqual(['email', 'phone', 'portal']);
    expect(COMM_FREQUENCIES).toEqual(['wöchentlich', 'zweiwöchentlich', 'monatlich', 'bei_bedarf']);
    expect(CUSTOMER_STATUSES).toEqual(['aktiv', 'inaktiv', 'potentiell', 'pausiert', 'abgeschlossen']);
    expect(CONTACT_TYPES).toEqual(['email', 'phone', 'meeting', 'note']);
  });
});

describe('validateProfileInput', () => {
  it('rejects an over-long phone', () => {
    expect(validateProfileInput({ phone: 'x'.repeat(31) }).ok).toBe(false);
  });
  it('rejects an invalid contact channel', () => {
    expect(validateProfileInput({ preferred_contact_channel: 'fax' }).ok).toBe(false);
  });
  it('accepts a valid partial payload', () => {
    expect(validateProfileInput({ phone: '+49 30 123', communication_frequency: 'monatlich' }).ok).toBe(true);
  });
  it('accepts an empty payload (no-op update)', () => {
    expect(validateProfileInput({}).ok).toBe(true);
  });
});

vi.mock('./website-db', async () => {
  const actual = await vi.importActual<typeof import('./website-db')>('./website-db');
  return { ...actual, pool: { query: vi.fn() } };
});

describe('updateCustomerProfile', () => {
  it('writes only provided fields + profile_updated_at by keycloak_user_id', async () => {
    const { pool } = await import('./website-db');
    const q = pool.query as ReturnType<typeof vi.fn>;
    q.mockResolvedValue({ rows: [{ profile_updated_at: '2026-06-11T00:00:00Z' }] });
    const { updateCustomerProfile } = await import('./customer-crm-db');
    await updateCustomerProfile('kc-1', { phone: '+49 30 1' });
    const ddl = q.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(ddl).toContain('UPDATE customers SET');
    expect(ddl).toContain('phone = ');
    expect(ddl).toContain('profile_updated_at = now()');
    expect(ddl).toContain('WHERE keycloak_user_id = ');
  });
});

describe('addContactHistoryEntry', () => {
  it('inserts a row', async () => {
    const { pool } = await import('./website-db');
    const q = pool.query as ReturnType<typeof vi.fn>;
    q.mockResolvedValue({ rows: [{ id: 'h1' }] });
    const { addContactHistoryEntry } = await import('./customer-crm-db');
    await addContactHistoryEntry({ keycloakUserId: 'kc-1', contactType: 'email', subject: 'X', adminId: 'a1' });
    const ddl = q.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(ddl).toContain('INSERT INTO customer_contact_history');
  });
});
