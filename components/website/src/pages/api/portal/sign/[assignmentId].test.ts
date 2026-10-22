import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserSession } from '../../../../lib/auth';

let mockSession: UserSession | null = null;
let mockCustomer: { id: string } | null = null;

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async () => mockSession),
}));

vi.mock('../../../../lib/project-portal-db', () => ({
  getCustomerByEmail: vi.fn(async () => mockCustomer),
}));

vi.mock('../../../../lib/documents-db', () => ({
  getOwnedAssignmentById: vi.fn(),
  getDocumentTemplate: vi.fn(),
  markAssignmentSigned: vi.fn(),
}));

vi.mock('../../../../lib/signing/template-renderer', () => ({
  renderTemplate: vi.fn(() => '<p>rendered</p>'),
  embedSignature: vi.fn(() => '<p>signed</p>'),
}));

vi.mock('../../../../lib/signing/pdf-service', () => ({
  generatePdf: vi.fn(async () => Buffer.from('pdf-bytes')),
}));

vi.mock('../../../../lib/signing/audit', () => ({
  logSigningEvent: vi.fn(async () => undefined),
}));

import { POST } from './[assignmentId]';
import { getOwnedAssignmentById, getDocumentTemplate, markAssignmentSigned } from '../../../../lib/documents-db';

type RouteContext = Parameters<typeof POST>[0];

function postReq(body: unknown): Request {
  return new Request('https://web.example.test/api/portal/sign/assign-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'workspace_session=x' },
    body: JSON.stringify(body),
  });
}

const ctx = (assignmentId: string, request: Request): RouteContext =>
  ({ params: { assignmentId }, request }) as unknown as RouteContext;

const session = (email: string): UserSession => ({
  sub: 'u-1',
  email,
  name: 'Test User',
  preferred_username: 'test',
  realmRoles: [],
  brand: null,
  access_token: 'tok',
  refresh_token: 'rtok',
  expires_at: 9999999999,
});

const validBody = { signatureType: 'checkbox', signerName: 'Max Mustermann' };

beforeEach(() => {
  vi.clearAllMocks();
  mockSession = null;
  mockCustomer = null;
});

describe('POST /api/portal/sign/[assignmentId] ownership (F2)', () => {
  it('returns 401 without session', async () => {
    const res = await POST(ctx('assign-1', postReq(validBody)));
    expect(res.status).toBe(401);
    expect(vi.mocked(getOwnedAssignmentById)).not.toHaveBeenCalled();
  });

  it('returns 404 for a foreign assignment (no existence oracle, no signing)', async () => {
    mockSession = session('attacker@example.test');
    mockCustomer = { id: 'customer-attacker' };
    vi.mocked(getOwnedAssignmentById).mockResolvedValue(null);

    const res = await POST(ctx('foreign-assignment-id', postReq(validBody)));
    expect(res.status).toBe(404);
    expect(vi.mocked(getOwnedAssignmentById)).toHaveBeenCalledWith(
      'foreign-assignment-id',
      'customer-attacker',
    );
    expect(vi.mocked(markAssignmentSigned)).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 404 when the session email maps to no customer', async () => {
    mockSession = session('ghost@example.test');
    mockCustomer = null;

    const res = await POST(ctx('assign-1', postReq(validBody)));
    expect(res.status).toBe(404);
    expect(vi.mocked(getOwnedAssignmentById)).not.toHaveBeenCalled();
    expect(vi.mocked(markAssignmentSigned)).not.toHaveBeenCalled();
  });

  it('signs the own pending assignment', async () => {
    mockSession = session('owner@example.test');
    mockCustomer = { id: 'customer-owner' };
    vi.mocked(getOwnedAssignmentById).mockResolvedValue({
      id: 'assign-1',
      customer_id: 'customer-owner',
      template_id: 'tpl-1',
      status: 'pending',
      expires_at: null,
    } as never);
    vi.mocked(getDocumentTemplate).mockResolvedValue({ id: 'tpl-1', html_body: '<p>x</p>' } as never);

    const res = await POST(ctx('assign-1', postReq(validBody)));
    expect(res.status).toBe(200);
    expect(vi.mocked(markAssignmentSigned)).toHaveBeenCalledOnce();
    expect(await res.json()).toEqual({ success: true });
  });
});
