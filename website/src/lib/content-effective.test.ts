import { it, expect, vi, beforeEach } from 'vitest';

// Mock the DB layer so getEffective* is pure to test.
vi.mock('./website-db', async (orig) => {
  const actual = await orig<typeof import('./website-db')>();
  return { ...actual,
    getServiceConfig: vi.fn(), getLeistungenConfig: vi.fn(), getJsonSetting: vi.fn() };
});
import * as db from './website-db';
import { getEffectiveServices } from './content';

beforeEach(() => vi.clearAllMocks());

it('card headline price comes from the linked catalog row, not a stored price', async () => {
  vi.mocked(db.getLeistungenConfig).mockResolvedValue([
    { id: 'digital-50plus', title: '50+ Digital', services: [
      { key: '50plus-digital-einzel', name: 'Einzelstunde', price: '60 €', unit: '/ Stunde' }] }]);
  vi.mocked(db.getServiceConfig).mockResolvedValue([
    { slug: 'digital-50plus', title: '50+ Digital', description: 'd', icon: '💻', features: [],
      leistungCategoryId: 'digital-50plus', headlineKey: '50plus-digital-einzel', headlinePrefix: true }]);
  const svcs = await getEffectiveServices();
  const card = svcs.find((s) => s.slug === 'digital-50plus')!;
  expect(card.price).toBe('ab 60 € / Stunde');
});
