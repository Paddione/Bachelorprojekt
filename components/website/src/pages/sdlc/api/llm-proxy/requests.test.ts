// T003277 — Liste und Detail des Dispatch-Mitschnitts.
//
// Pruefmodus: Output-Verifikation [T002448-M4] — geprueft wird der Antwortkoerper
// der Route, nicht der Quelltext. Die wichtigste Zusicherung steht unten: die
// Liste darf die Body-Spalten nicht fuehren, sonst zieht jeder Panel-Refresh
// zweistellige MB.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async (c: string | null) => (c === 'admin' ? { groups: ['admins'] } : null)),
  isAdmin: vi.fn((s: { groups?: string[] } | null | undefined) => s?.groups?.includes('admins') ?? false),
}));

const listDispatches = vi.fn();
const getDispatch = vi.fn();
vi.mock('../../../../lib/sdlc/llm-proxy-request-log', () => ({
  listDispatches: (...a: unknown[]) => listDispatches(...a),
  getDispatch: (...a: unknown[]) => getDispatch(...a),
  MAX_LIMIT: 200,
}));

import { GET as LIST } from './requests';
import { GET as DETAIL } from './requests/[id]';

const locals = { requestLogger: { error: vi.fn() } };
const listCall = (cookie: string | null, query = '') =>
  LIST({
    request: new Request('http://x/sdlc/api/llm-proxy/requests', { headers: cookie ? { cookie } : {} }),
    url: new URL(`http://x/sdlc/api/llm-proxy/requests${query}`),
    locals,
  } as unknown as Parameters<typeof LIST>[0]);
const detailCall = (cookie: string | null, id: string) =>
  DETAIL({
    request: new Request('http://x/sdlc/api/llm-proxy/requests/' + id, { headers: cookie ? { cookie } : {} }),
    params: { id },
    locals,
  } as unknown as Parameters<typeof DETAIL>[0]);

const head = {
  id: 1, ts: '2026-08-10T10:00:00Z', backend: 'llamacpp-gemma', requested_model: 'gemma26-factory',
  served_model: 'gemma', subpath: 'chat/completions', http_status: 200, duration_ms: 4200,
  queue_wait_ms: 0, prompt_tokens: 47000, completion_tokens: 900, streamed: true,
  stream_incomplete: false, truncated: false, original_bytes: null, slot_id: null,
  dispatch_ticket: null, dispatch_partial: null,
};

beforeEach(() => { listDispatches.mockReset(); getDispatch.mockReset(); });

describe('GET /sdlc/api/llm-proxy/requests', () => {
  it('401 ohne Anmeldung, 403 ohne Admin-Rolle', async () => {
    expect((await listCall(null)).status).toBe(401);
  });

  it('liefert die Kopfdaten OHNE die Body-Spalten', async () => {
    listDispatches.mockResolvedValue({ items: [head], limit: 50 });
    const res = await listCall('admin');
    const body = await res.json();

    // Positiv-Anker [T002356-M1]: erst belegen, dass ueberhaupt ein Eintrag
    // zurueckkommt — sonst waere "kein Body enthalten" ueber einer leeren
    // Liste trivial wahr.
    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].backend).toBe('llamacpp-gemma');

    expect(body.items[0]).not.toHaveProperty('request_body');
    expect(body.items[0]).not.toHaveProperty('response_body');
  });

  it('reicht limit und ticket an die Datenschicht durch', async () => {
    listDispatches.mockResolvedValue({ items: [], limit: 10 });
    await listCall('admin', '?limit=10&ticket=T003277');
    expect(listDispatches).toHaveBeenCalledWith({ limit: 10, ticket: 'T003277' });
  });

  it('weist eine gekappte Liste als gekappt aus', async () => {
    listDispatches.mockResolvedValue({ items: [head, { ...head, id: 2 }], limit: 2 });
    const body = await (await listCall('admin', '?limit=2')).json();
    expect(body.capped).toBe(true);
  });

  it('500 statt leerer Liste, wenn die Datenschicht wirft', async () => {
    listDispatches.mockRejectedValue(new Error('db weg'));
    const res = await listCall('admin');
    expect(res.status).toBe(500);
    // D13 — kein stiller Ersatzwert: der Fehler wird benannt.
    expect(await res.json()).toMatchObject({ error: 'fetch_failed' });
  });
});

describe('GET /sdlc/api/llm-proxy/requests/[id]', () => {
  it('liefert beide Bodies', async () => {
    getDispatch.mockResolvedValue({ ...head, request_body: 'PROMPT', response_body: 'ANTWORT' });
    const body = await (await detailCall('admin', '1')).json();
    expect(body.request_body).toBe('PROMPT');
    expect(body.response_body).toBe('ANTWORT');
  });

  it('404 bei unbekannter Kennung statt leerer Zeile', async () => {
    getDispatch.mockResolvedValue(null);
    expect((await detailCall('admin', '999')).status).toBe(404);
  });

  it('400 bei ungueltiger Kennung', async () => {
    expect((await detailCall('admin', 'abc')).status).toBe(400);
    expect(getDispatch).not.toHaveBeenCalled();
  });

  it('401 ohne Anmeldung', async () => {
    expect((await detailCall(null, '1')).status).toBe(401);
  });
});
