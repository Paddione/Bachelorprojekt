import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../../lib/sessions/templates', () => ({
  listTemplates: vi.fn(),
  cloneTemplate: vi.fn(),
}));
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listTemplates, cloneTemplate } from '../../../../../lib/sessions/templates';
import { GET, POST } from './index';

const mkReq = (opts: { method?: string; body?: unknown } = {}) =>
  new Request('http://x/api/admin/sessions/templates', {
    method: opts.method ?? 'GET',
    headers: { cookie: 's=1' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
const locals = { requestLogger: { error: vi.fn() } } as any;

describe('GET /api/admin/sessions/templates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 when anonymous', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(401);
  });

  it('403 when non-admin', async () => {
    vi.mocked(getSession).mockResolvedValue({ sub: 'b', email: 'b@x', preferred_username: 'bob' } as any);
    vi.mocked(isAdmin).mockReturnValue(false);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(403);
  });

  it('200 with templates for admin', async () => {
    vi.mocked(getSession).mockResolvedValue({ sub: 'a', email: 'a@x', preferred_username: 'admin' } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(listTemplates).mockResolvedValue([
      { id: '1', slug: 'feature-intake', title: 'Feature-Intake', body_markdown: '', is_default: true, owner_id: null, created_from_template_id: null },
    ]);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates[0].slug).toBe('feature-intake');
  });
});

describe('POST /api/admin/sessions/templates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 clones a template', async () => {
    vi.mocked(getSession).mockResolvedValue({ sub: 'a', email: 'a@x', preferred_username: 'admin' } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(cloneTemplate).mockResolvedValue({
      id: '2', slug: 'grilling-copy', title: 'Grilling (Kopie)',
      body_markdown: '# x', is_default: false, owner_id: 'a', created_from_template_id: '1',
    });
    const res = await POST({ request: mkReq({ method: 'POST', body: { templateId: '1' } }), locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.template.slug).toBe('grilling-copy');
  });
});
