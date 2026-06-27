import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postContentSave } from './content-client';

describe('admin/content-client.postContentSave', () => {
  const ORIGINAL_FETCH = globalThis.fetch;
  beforeEach(() => {});
  afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

  it('POSTs to the admin content save endpoint with the right body shape', async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      captured = { url: url as string, init };
      return new Response(JSON.stringify({ version: 12 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    const out = await postContentSave('home.eyebrow', 11, { value: 'hi' });
    expect(out).toEqual({ version: 12 });
    expect(captured.url).toBe('/api/admin/content/save');
    expect(captured.init?.method).toBe('POST');
    expect(JSON.parse(captured.init?.body as string)).toEqual({
      contentKey: 'home.eyebrow', baseVersion: 11, payload: { value: 'hi' },
    });
    const headers = captured.init?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
  });

  it('throws a 409 error envelope when the server returns 409', async () => {
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ error: 'stale', currentVersion: 12 }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;
    await expect(postContentSave('home.eyebrow', 1, { x: 1 })).rejects.toMatchObject({
      status: 409, body: { error: 'stale', currentVersion: 12 },
    });
  });

  it('throws a 422 error envelope when the server returns 422', async () => {
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ error: 'invalid', field: 'baseVersion' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;
    await expect(postContentSave('home.eyebrow', 1, { x: 1 })).rejects.toMatchObject({
      status: 422, body: { error: 'invalid', field: 'baseVersion' },
    });
  });

  it('throws a status-only envelope for any other non-2xx response', async () => {
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    await expect(postContentSave('home.eyebrow', 1, { x: 1 })).rejects.toEqual({ status: 500 });
  });
});
