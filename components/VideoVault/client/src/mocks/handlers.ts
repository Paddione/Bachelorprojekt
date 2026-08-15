import { http, HttpResponse } from 'msw';

// Simple in-memory store for settings when MSW is enabled
const SETTINGS_STORE = new Map<string, string>();

export const handlers = [
  // Auth endpoints (always succeed in MSW-enabled E2E/tests)
  http.post('/api/auth/login', () => {
    return HttpResponse.json({ ok: true }, { status: 200 });
  }),
  http.post('/api/auth/logout', () => {
    return HttpResponse.json({ ok: true }, { status: 200 });
  }),
  http.get('/api/auth/status', () => {
    return HttpResponse.json({ isAdmin: true }, { status: 200 });
  }),
  http.get('/api/errors/stats', () => {
    return HttpResponse.json({ message: 'ok' }, { status: 200 });
  }),
  // Health endpoint mocked to return healthy
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'healthy' }, { status: 200 });
  }),
  http.get('/api/db/health', () => {
    return HttpResponse.json({ configured: false, healthy: true }, { status: 200 });
  }),
  // Settings APIs
  http.get('/api/settings/:key', ({ params }) => {
    const key = String(params.key);
    if (!SETTINGS_STORE.has(key)) {
      return HttpResponse.json({ key, value: null }, { status: 404 });
    }
    return HttpResponse.json({ key, value: SETTINGS_STORE.get(key) ?? null }, { status: 200 });
  }),
  http.post('/api/settings/:key', async ({ params, request }) => {
    const key = String(params.key);
    const body = (await request.json()) as { value: unknown };
    const stored =
      typeof body?.value === 'string' ? body.value : JSON.stringify(body?.value ?? null);
    SETTINGS_STORE.set(key, stored);
    return HttpResponse.json({ key, value: stored }, { status: 200 });
  }),
  http.delete('/api/settings/:key', ({ params }) => {
    const key = String(params.key);
    SETTINGS_STORE.delete(key);
    return HttpResponse.json({ key, deleted: true }, { status: 200 });
  }),
];
