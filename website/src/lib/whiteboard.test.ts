import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() },
  createRequestLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() })),
}));
import { extractWhiteboardText, getWhiteboardArtifacts } from './whiteboard';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_NC = process.env.NEXTCLOUD_URL;
const ORIGINAL_CALDAV_USER = process.env.NEXTCLOUD_CALDAV_USER;
const ORIGINAL_CALDAV_PASS = process.env.NEXTCLOUD_CALDAV_PASSWORD;

beforeEach(() => {
  process.env.NEXTCLOUD_URL = 'https://nc.example.com';
  process.env.NEXTCLOUD_CALDAV_USER = 'admin';
  process.env.NEXTCLOUD_CALDAV_PASSWORD = 'pw';
  vi.resetModules();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_NC === undefined) delete process.env.NEXTCLOUD_URL;
  else process.env.NEXTCLOUD_URL = ORIGINAL_NC;
  if (ORIGINAL_CALDAV_USER === undefined) delete process.env.NEXTCLOUD_CALDAV_USER;
  else process.env.NEXTCLOUD_CALDAV_USER = ORIGINAL_CALDAV_USER;
  if (ORIGINAL_CALDAV_PASS === undefined) delete process.env.NEXTCLOUD_CALDAV_PASSWORD;
  else process.env.NEXTCLOUD_CALDAV_PASSWORD = ORIGINAL_CALDAV_PASS;
});

describe('extractWhiteboardText', () => {
  it('returns empty string for invalid JSON', () => {
    expect(extractWhiteboardText('not json')).toBe('');
    expect(extractWhiteboardText('{')).toBe('');
  });

  it('returns empty string when no elements are present', () => {
    expect(extractWhiteboardText('{}')).toBe('');
  });

  it('joins all text elements with newlines', () => {
    const data = JSON.stringify({
      elements: [
        { type: 'text', text: 'Hello' },
        { type: 'rectangle' }, // not text
        { type: 'text', text: 'World' },
        { type: 'text' }, // no text
        { type: 'text', text: '  trimmed  ' },
      ],
    });
    expect(extractWhiteboardText(data)).toBe('Hello\nWorld\ntrimmed');
  });

  it('treats missing elements as an empty array', () => {
    const data = JSON.stringify({ foo: 'bar' });
    expect(extractWhiteboardText(data)).toBe('');
  });
});

describe('getWhiteboardArtifacts (network error / empty paths)', () => {
  it('returns an empty array when the WebDAV PROPFIND fails', async () => {
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    const mod = await import('./whiteboard');
    const out = await mod.getWhiteboardArtifacts('room1');
    expect(out).toEqual([]);
  });

  it('returns an empty array when the fetch itself throws', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    const mod = await import('./whiteboard');
    const out = await mod.getWhiteboardArtifacts();
    expect(out).toEqual([]);
  });

  it('returns parsed whiteboard artifacts when the WebDAV listing finds .whiteboard files', async () => {
    let callCount = 0;
    globalThis.fetch = (async (url: unknown) => {
      callCount++;
      if (callCount === 1) {
        // PROPFIND for /Talk/room1/
        return new Response(
          `<?xml version="1.0"?>
            <d:multistatus xmlns:d="DAV:">
              <d:response>
                <d:href>/remote.php/dav/files/admin/Talk/room1/notes.whiteboard</d:href>
                <d:displayname>notes.whiteboard</d:displayname>
                <d:getcontentlength>42</d:getcontentlength>
              </d:response>
            </d:multistatus>`,
          { status: 207 },
        );
      }
      // GET for the .whiteboard body
      return new Response(JSON.stringify({ elements: [{ type: 'text', text: 'hi' }] }), { status: 200 });
    }) as typeof fetch;
    const mod = await import('./whiteboard');
    const out = await mod.getWhiteboardArtifacts('room1');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('notes.whiteboard');
    expect(out[0].data).toContain('"text":"hi"');
  });
});
