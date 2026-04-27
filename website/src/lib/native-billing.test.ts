import { describe, it, expect, beforeAll } from 'vitest';
import { initBillingTables, createCustomer, getCustomerByEmail } from './native-billing';

beforeAll(async () => { await initBillingTables(); });

it('creates and retrieves a customer', async () => {
  const c = await createCustomer({ brand: 'test', name: 'Max Mustermann', email: 'max@test.de' });
  expect(c.id).toBeTruthy();
  const found = await getCustomerByEmail('test', 'max@test.de');
  expect(found?.name).toBe('Max Mustermann');
});
