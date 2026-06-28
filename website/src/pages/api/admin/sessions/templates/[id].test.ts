import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../../lib/sessions/templates', () => ({
  deleteTemplate: vi.fn(),
}));
import { getSession, isAdmin } from '../../../../../lib/auth';
import { deleteTemplate } from '../../../../../lib/sessions/templates';
import { DELETE } from './[id]';

const mkReq = () => new Request('http://x/api/admin/sessions/templates/abc', {
  method: 'DELETE', headers: { cookie: 's=1' },
});
interface MockLocals {
  requestLogger: { error: ReturnType<typeof vi.fn> };
}
const locals: MockLocals = { requestLogger: { error: vi.fn() } };
type RouteContext = Parameters<typeof DELETE>[0];

describe('DELETE /api/admin/sessions/templates/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 when anonymous', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await DELETE({ request: mkReq(), locals, params: { id: 'abc' } } as unknown as RouteContext);
    expect(res.status).toBe(401);
  });

  it('200 deletes own custom template', async () => {
    vi.mocked(getSession).mockResolvedValue({ sub: 'a', email: 'a@x', preferred_username: 'admin' } as unknown as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(deleteTemplate).mockResolvedValue(undefined);
    const res = await DELETE({ request: mkReq(), locals, params: { id: 'abc' } } as unknown as RouteContext);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('400 when deleteTemplate throws', async () => {
    vi.mocked(getSession).mockResolvedValue({ sub: 'a', email: 'a@x', preferred_username: 'admin' } as unknown as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(deleteTemplate).mockRejectedValue(new Error('cannot delete default template'));
    const res = await DELETE({ request: mkReq(), locals, params: { id: 'abc' } } as unknown as RouteContext);
    expect(res.status).toBe(400);
  });
});
