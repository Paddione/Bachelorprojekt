import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() },
  createRequestLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() })),
}));
import {
  createUser,
  setUserPassword,
  sendPasswordResetEmail,
  listUsers,
  getUserById,
  deleteUser,
  updateUser,
} from './identity';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_POCKET = process.env.POCKET_ID_API_KEY;
const ORIGINAL_URL = process.env.POCKET_ID_URL;

beforeEach(() => {
  process.env.POCKET_ID_URL = 'http://pocket-id.local:1411';
  process.env.POCKET_ID_API_KEY = 'test-key';
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_POCKET === undefined) delete process.env.POCKET_ID_API_KEY;
  else process.env.POCKET_ID_API_KEY = ORIGINAL_POCKET;
  if (ORIGINAL_URL === undefined) delete process.env.POCKET_ID_URL;
  else process.env.POCKET_ID_URL = ORIGINAL_URL;
});

describe('createUser', () => {
  it('returns "exists" error when a user with the email is already present', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([{ id: 'u1', email: 'a@b.c' }]), { status: 200 })) as typeof fetch;
    const out = await createUser({ email: 'a@b.c', firstName: 'A', lastName: 'B' });
    expect(out).toEqual({ success: false, error: expect.stringMatching(/existiert/) });
  });

  it('returns success + userId when Pocket ID returns 201 with a Location header', async () => {
    let callCount = 0;
    globalThis.fetch = (async (_url: unknown, _init?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        return new Response('[]', { status: 200 });
      }
      return new Response('{}', { status: 201, headers: { Location: '/api/users/abc-123' } });
    }) as typeof fetch;
    const out = await createUser({ email: 'new@example.com', firstName: 'New', lastName: 'User' });
    expect(out.success).toBe(true);
    expect(out.userId).toBe('abc-123');
  });

  it('returns a generic Pocket-ID error message when creation fails', async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      if (callCount === 1) return new Response('[]', { status: 200 });
      return new Response('forbidden', { status: 403 });
    }) as typeof fetch;
    const out = await createUser({ email: 'x@y.z', firstName: 'X', lastName: 'Y' });
    expect(out).toEqual({ success: false, error: expect.stringMatching(/Pocket-ID-Fehler: 403/) });
  });
});

describe('setUserPassword', () => {
  it('is a no-op that returns true (Pocket ID has no password endpoint)', async () => {
    expect(await setUserPassword('u1', 'pw')).toBe(true);
  });
});

describe('sendPasswordResetEmail', () => {
  it('treats a 404 as a successful no-op', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
    expect(await sendPasswordResetEmail('u1')).toBe(true);
  });

  it('returns true on a 2xx response', async () => {
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
    expect(await sendPasswordResetEmail('u1')).toBe(true);
  });

  it('returns false on a non-OK, non-404 response', async () => {
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    expect(await sendPasswordResetEmail('u1')).toBe(false);
  });
});

describe('listUsers / getUserById / deleteUser / updateUser', () => {
  it('listUsers returns the parsed array', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([{ id: 'u1', email: 'a@b.c' }]), { status: 200 })) as typeof fetch;
    const out = await listUsers();
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('u1');
  });

  it('getUserById returns the user when found', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 'u1', email: 'a@b.c' }), { status: 200 })) as typeof fetch;
    const out = await getUserById('u1');
    expect(out?.id).toBe('u1');
  });

  it('getUserById returns null on a 404', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
    expect(await getUserById('missing')).toBeNull();
  });

  it('deleteUser returns true on 200', async () => {
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
    expect(await deleteUser('u1')).toBe(true);
  });

  it('deleteUser returns false on non-OK', async () => {
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    expect(await deleteUser('u1')).toBe(false);
  });

  it('updateUser PUTs a JSON body and returns true on 2xx', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      capturedUrl = url as string;
      capturedInit = init;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    expect(
      await updateUser('u1', { firstName: 'New', lastName: 'Name' }),
    ).toBe(true);
    expect(capturedUrl).toContain('/api/users/u1');
    expect(capturedInit?.method).toBe('PUT');
    expect(JSON.parse(capturedInit?.body as string)).toMatchObject({ firstName: 'New' });
  });
});
