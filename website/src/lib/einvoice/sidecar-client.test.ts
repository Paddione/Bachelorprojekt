import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSidecarClient, SidecarUnavailableError } from './sidecar-client';

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock as unknown as typeof fetch; });

describe('sidecar-client', () => {
  const client = createSidecarClient('http://einvoice-sidecar.workspace.svc.cluster.local');

  it('embed: posts base64 + parses base64 response', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ pdf: Buffer.from('OK').toString('base64'), meta: { size: 2 } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ));
    const out = await client.embed(Buffer.from('PDF'), '<x/>');
    expect(out.pdf.toString('utf8')).toBe('OK');
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.pdf).toBe(Buffer.from('PDF').toString('base64'));
  });

  it('embed: throws SidecarUnavailableError on 5xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('upstream', { status: 503 }));
    await expect(client.embed(Buffer.from('X'), '<x/>')).rejects.toThrow(SidecarUnavailableError);
  });

  it('validate: parses {ok, errors, warnings}', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: false, errors: ['e1'], warnings: ['w1'], reportXml: '<r/>' }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ));
    const r = await client.validate({ pdf: Buffer.from('X') });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(['e1']);
    expect(r.warnings).toEqual(['w1']);
  });
});
