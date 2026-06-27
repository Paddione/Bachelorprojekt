import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_NC = process.env.NEXTCLOUD_URL;
const ORIGINAL_USER = process.env.NEXTCLOUD_CALDAV_USER;
const ORIGINAL_PASS = process.env.NEXTCLOUD_CALDAV_PASSWORD;
const ORIGINAL_EXT = process.env.NEXTCLOUD_EXTERNAL_URL;

beforeEach(() => {
  process.env.NEXTCLOUD_URL = 'https://nc.example.com';
  process.env.NEXTCLOUD_CALDAV_USER = 'admin';
  process.env.NEXTCLOUD_CALDAV_PASSWORD = 'pw';
  process.env.NEXTCLOUD_EXTERNAL_URL = 'https://nc.example.com';
  vi.resetModules();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_NC === undefined) delete process.env.NEXTCLOUD_URL;
  else process.env.NEXTCLOUD_URL = ORIGINAL_NC;
  if (ORIGINAL_USER === undefined) delete process.env.NEXTCLOUD_CALDAV_USER;
  else process.env.NEXTCLOUD_CALDAV_USER = ORIGINAL_USER;
  if (ORIGINAL_PASS === undefined) delete process.env.NEXTCLOUD_CALDAV_PASSWORD;
  else process.env.NEXTCLOUD_CALDAV_PASSWORD = ORIGINAL_PASS;
  if (ORIGINAL_EXT === undefined) delete process.env.NEXTCLOUD_EXTERNAL_URL;
  else process.env.NEXTCLOUD_EXTERNAL_URL = ORIGINAL_EXT;
});

async function loadModule() {
  return import('./talk');
}

describe('createTalkRoom', () => {
  it('returns null when the OCS API returns a non-OK response', async () => {
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    const m = await loadModule();
    const originalErr = console.error;
    console.error = () => undefined;
    try {
      expect(await m.createTalkRoom({ name: 'Session 1' })).toBeNull();
    } finally {
      console.error = originalErr;
    }
  });

  it('returns the parsed room on success (defaults to public roomType 3)', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ ocs: { data: { token: 'abc-123', name: 'Session 1' } } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;
    const m = await loadModule();
    const out = await m.createTalkRoom({ name: 'Session 1' });
    expect(out).toEqual({ token: 'abc-123', name: 'Session 1', url: 'https://nc.example.com/call/abc-123' });
  });

  it('uses roomType 2 when public=false', async () => {
    const capturedBodies: string[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      capturedBodies.push(init?.body as string);
      return new Response(
        JSON.stringify({ ocs: { data: { token: 'x', name: 'S' } } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;
    const m = await loadModule();
    const out = await m.createTalkRoom({ name: 'S', public: false });
    expect(out?.token).toBe('x');
    const createCall = capturedBodies.find((b) => b && b.includes('roomType'));
    expect(createCall).toBeDefined();
    const parsed = JSON.parse(createCall as string) as { roomType?: number; roomName?: string };
    expect(parsed.roomType).toBe(2);
  });

  it('returns null on network error', async () => {
    globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
    const m = await loadModule();
    const originalErr = console.error;
    console.error = () => undefined;
    try {
      expect(await m.createTalkRoom({ name: 'X' })).toBeNull();
    } finally {
      console.error = originalErr;
    }
  });
});

describe('inviteGuestByEmail', () => {
  it('returns true on 200', async () => {
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
    const m = await loadModule();
    expect(await m.inviteGuestByEmail('room-tok', 'guest@example.com')).toBe(true);
  });

  it('returns false on non-OK', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    const m = await loadModule();
    const originalErr = console.error;
    console.error = () => undefined;
    try {
      expect(await m.inviteGuestByEmail('room-tok', 'guest@example.com')).toBe(false);
    } finally {
      console.error = originalErr;
    }
  });
});

describe('deleteTalkRoom', () => {
  it('returns true on a 2xx response', async () => {
    globalThis.fetch = (async () => new Response('', { status: 200 })) as typeof fetch;
    const m = await loadModule();
    expect(await m.deleteTalkRoom('room-tok')).toBe(true);
  });

  it('returns false on a non-OK response', async () => {
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    const m = await loadModule();
    expect(await m.deleteTalkRoom('room-tok')).toBe(false);
  });
});

describe('sendChatMessage', () => {
  it('returns true on a 2xx response', async () => {
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
    const m = await loadModule();
    expect(await m.sendChatMessage('room-tok', 'hello')).toBe(true);
  });

  it('returns false on a non-OK response', async () => {
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    const m = await loadModule();
    const originalErr = console.error;
    console.error = () => undefined;
    try {
      expect(await m.sendChatMessage('room-tok', 'hello')).toBe(false);
    } finally {
      console.error = originalErr;
    }
  });
});

describe('getRecordingFile', () => {
  it('returns null when the WebDAV PROPFIND returns non-OK', async () => {
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    const m = await loadModule();
    const originalErr = console.error;
    console.error = () => undefined;
    try {
      expect(await m.getRecordingFile('room-tok')).toBeNull();
    } finally {
      console.error = originalErr;
    }
  });

  it('returns null when no recording is found in the listing', async () => {
    let call = 0;
    globalThis.fetch = (async (_url: unknown) => {
      call++;
      if (call === 1) {
        return new Response(
          JSON.stringify({ ocs: { data: { name: 'empty-room' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        `<?xml version="1.0"?>
          <d:multistatus xmlns:d="DAV:">
            <d:response>
              <d:href>/remote.php/dav/files/admin/Talk/empty-room/notes.txt</d:href>
              <d:displayname>notes.txt</d:displayname>
              <d:getcontentlength>10</d:getcontentlength>
            </d:response>
          </d:multistatus>`,
        { status: 207, headers: { 'Content-Type': 'application/xml' } },
      );
    }) as typeof fetch;
    const m = await loadModule();
    expect(await m.getRecordingFile('room-tok')).toBeNull();
  });
});
