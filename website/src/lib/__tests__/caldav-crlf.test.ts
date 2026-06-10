import { describe, it, expect, vi, beforeEach } from 'vitest';

// We intercept fetch to capture the PUT body
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Reset module state between tests
beforeEach(() => {
  fetchMock.mockReset();
  vi.resetModules();
});

describe('createCalendarEvent CRLF', () => {
  it('uses \\r\\n line endings in the PUT body (RFC 5545)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, text: async () => '' });

    const { createCalendarEvent } = await import('../caldav.js');
    await createCalendarEvent({
      summary: 'Test',
      description: 'desc',
      start: new Date('2026-07-01T09:00:00Z'),
      end:   new Date('2026-07-01T10:00:00Z'),
    });

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = opts.body as string;
    // Every line break must be CRLF; no bare LF allowed
    const bareNewlines = body.match(/(?<!\r)\n/g);
    expect(bareNewlines).toBeNull();
    expect(body).toMatch(/\r\n/);
  });
});
