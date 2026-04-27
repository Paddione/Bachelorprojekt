import { it, expect, beforeAll } from 'vitest';
import { initBillingTables, createCustomer, getCustomerByEmail } from './native-billing';
import { createInvoice, finalizeInvoice, markInvoicePaid } from './native-billing';

beforeAll(async () => { await initBillingTables(); });

it('creates and retrieves a customer', async () => {
  const c = await createCustomer({ brand: 'test', name: 'Max Mustermann', email: 'max@test.de' });
  expect(c.id).toBeTruthy();
  const found = await getCustomerByEmail('test', 'max@test.de');
  expect(found?.name).toBe('Max Mustermann');
});

it('creates, finalizes and marks invoice paid', async () => {
  const customer = await createCustomer({ brand:'test', name:'Erika M', email:'erika@test.de'});
  const inv = await createInvoice({
    brand: 'test', customerId: customer.id,
    issueDate: '2025-09-01', dueDays: 14,
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'Coaching 1h', quantity: 1, unitPrice: 60 }],
  });
  expect(inv.number).toMatch(/^RE-\d{4}-\d{4}$/);
  expect(inv.netAmount).toBe(60);
  expect(inv.taxAmount).toBe(0);
  expect(inv.status).toBe('draft');

  const finalized = await finalizeInvoice(inv.id);
  expect(finalized.status).toBe('open');
  expect(finalized.locked).toBe(true);

  const paid = await markInvoicePaid(inv.id, { paidAt: '2025-09-15', paidAmount: 60 });
  expect(paid.status).toBe('paid');
});
