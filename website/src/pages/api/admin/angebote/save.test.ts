import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './save';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../lib/website-db', () => ({
  saveServiceConfig: vi.fn(),
  saveLeistungenConfig: vi.fn(),
  setSiteSetting: vi.fn(),
}));
vi.mock('../../../../config/index', () => ({
  config: { services: [], leistungen: [] },
}));

import { getSession, isAdmin } from '../../../../lib/auth';
import { saveServiceConfig, saveLeistungenConfig } from '../../../../lib/website-db';

function jsonReq(body: unknown): Request {
  return new Request('http://x/api/admin/angebote/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(isAdmin).mockReset();
  vi.mocked(saveServiceConfig).mockReset();
  vi.mocked(saveLeistungenConfig).mockReset();
});

describe('POST /api/admin/angebote/save — catalog link persistence', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'admin' } } as never);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(saveServiceConfig).mockResolvedValue(undefined);
    vi.mocked(saveLeistungenConfig).mockResolvedValue(undefined);
  });

  it('persists leistungCategoryId + headlineKey + headlinePrefix when present', async () => {
    const card = {
      slug: 'coaching',
      title: 'Coaching',
      description: 'd',
      icon: '🧠',
      features: [],
      leistungCategoryId: 'fuehrungskraefte',
      headlineKey: 'fuehrung-einzel',
      headlinePrefix: true,
    };
    const r = await POST({ request: jsonReq({ services: [card], leistungen: [], priceListUrl: '' }) } as unknown as Parameters<typeof POST>[0]);
    expect(r.status).toBe(200);

    const saved = vi.mocked(saveServiceConfig).mock.calls[0][1];
    expect(saved[0].leistungCategoryId).toBe('fuehrungskraefte');
    expect(saved[0].headlineKey).toBe('fuehrung-einzel');
    expect(saved[0].headlinePrefix).toBe(true);
  });

  it('strips legacy price and pageContent.pricing before write', async () => {
    const card = {
      slug: 'coaching',
      title: 'Coaching',
      description: 'd',
      icon: '🧠',
      features: [],
      price: '150 € / Stunde',
      leistungCategoryId: 'fuehrungskraefte',
      headlineKey: 'fuehrung-einzel',
      headlinePrefix: false,
      pageContent: {
        headline: 'H',
        pricing: [{ label: 'Einzelstunde', price: '150 €' }],
      },
    };
    const r = await POST({ request: jsonReq({ services: [card], leistungen: [], priceListUrl: '' }) } as unknown as Parameters<typeof POST>[0]);
    expect(r.status).toBe(200);

    const saved = vi.mocked(saveServiceConfig).mock.calls[0][1];
    expect(saved[0].price).toBeUndefined();
    expect(saved[0].pageContent?.pricing).toBeUndefined();
    // Other pageContent fields should survive
    expect(saved[0].pageContent?.headline).toBe('H');
  });

  it('keeps price on cards with no catalog link (legacy path)', async () => {
    const card = {
      slug: 'beratung',
      title: 'Beratung',
      description: 'd',
      icon: '💼',
      features: [],
      price: 'auf Anfrage',
    };
    const r = await POST({ request: jsonReq({ services: [card], leistungen: [], priceListUrl: '' }) } as unknown as Parameters<typeof POST>[0]);
    expect(r.status).toBe(200);

    const saved = vi.mocked(saveServiceConfig).mock.calls[0][1];
    expect(saved[0].price).toBe('auf Anfrage');
  });
});
