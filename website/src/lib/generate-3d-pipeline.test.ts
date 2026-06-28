import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ───────────────────────────────────────────────────────────────
// status.ts imports these via '../../../../lib/generation-jobs' and
// '../../../../lib/website-db', which resolve to the SAME files as './generation-jobs'
// and './website-db' from this test (both live in website/src/lib/). vitest matches
// vi.mock by resolved module id, so these specifiers intercept the SUT's imports.
const stageCalls: Array<{ id: string; stage: string; extra?: unknown }> = [];
const registryInserts: unknown[][] = [];

vi.mock('./generation-jobs', () => ({
  updateJobStage: vi.fn(async (id: string, stage: string, extra?: unknown) => {
    stageCalls.push({ id, stage, extra });
  }),
  updateJobStatus: vi.fn(async () => {}),
  getJob: vi.fn(async () => null),
  listRecentJobs: vi.fn(async () => []),
}));

vi.mock('./website-db', () => ({
  pool: { query: vi.fn(async (...args: unknown[]) => { registryInserts.push(args); return { rows: [] }; }) },
}));

import { finaliseJob } from '../pages/api/admin/generate-3d/status';

// ── Helpers ────────────────────────────────────────────────────────────────────
function comfyDoneFetch(): typeof fetch {
  // GET /history/<id> → completed with a .glb output; GET /view → bytes
  return vi.fn(async (url: string) => {
    if (url.includes('/history/')) {
      return new Response(JSON.stringify({
        'p1': {
          status: { status_str: 'success', completed: true },
          outputs: { '9': { glb: [{ filename: 'out.glb', subfolder: '', type: 'output' }] } },
        },
      }), { status: 200 });
    }
    if (url.includes('/view')) {
      return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

function lastStage(): string {
  return stageCalls[stageCalls.length - 1]?.stage;
}

beforeEach(() => {
  stageCalls.length = 0;
  registryInserts.length = 0;
  vi.clearAllMocks();
});

describe('generate-3d pipeline', () => {
  it('Stage generating: ComfyUI still queued → stays in generating, no rig/upload', async () => {
    const comfyFetch = vi.fn(async () =>
      new Response(JSON.stringify({}), { status: 200 }), // empty history
    ) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch });
    expect(stageCalls.map((c) => c.stage)).toEqual(['generating']);
  });

  it('Stage generating → rigging: ComfyUI done downloads GLB and advances to rigging', async () => {
    const riggerFetch = vi.fn(async () => new Response(new Uint8Array([4]).buffer, { status: 200 })) as unknown as typeof fetch;
    const brettFetch = vi.fn(async () => new Response(JSON.stringify({ id: 's1', animations: [] }), { status: 200 })) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch: comfyDoneFetch(), riggerFetch, brettFetch });
    expect(stageCalls.map((c) => c.stage)).toContain('rigging');
  });

  it('Stage rigging → uploading: Rigger responds, advances to uploading', async () => {
    const riggerFetch = vi.fn(async () => new Response(new Uint8Array([4]).buffer, { status: 200 })) as unknown as typeof fetch;
    const brettFetch = vi.fn(async () => new Response(JSON.stringify({ id: 's1', animations: [] }), { status: 200 })) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch: comfyDoneFetch(), riggerFetch, brettFetch });
    expect(stageCalls.map((c) => c.stage)).toContain('uploading');
    expect(riggerFetch).toHaveBeenCalledOnce();
  });

  it('Stage uploading → done: Brett responds with skin id, stage done + skin_id set', async () => {
    const riggerFetch = vi.fn(async () => new Response(new Uint8Array([4]).buffer, { status: 200 })) as unknown as typeof fetch;
    const brettFetch = vi.fn(async () => new Response(JSON.stringify({ id: 's1', animations: [] }), { status: 200 })) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch: comfyDoneFetch(), riggerFetch, brettFetch });
    const doneCall = stageCalls.find((c) => c.stage === 'done');
    expect(doneCall).toBeDefined();
    expect((doneCall?.extra as any)?.skin_id).toBe('s1');
  });

  it('Integration: full pipeline reaches done in one tick and registers the asset', async () => {
    const riggerFetch = vi.fn(async () => new Response(new Uint8Array([4]).buffer, { status: 200 })) as unknown as typeof fetch;
    const brettFetch = vi.fn(async () => new Response(JSON.stringify({ id: 's1', animations: [] }), { status: 200 })) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch: comfyDoneFetch(), riggerFetch, brettFetch });
    expect(stageCalls.map((c) => c.stage)).toEqual(['generating', 'rigging', 'uploading', 'done']);
    expect(registryInserts.length).toBe(1);
  });

  it('Error: ComfyUI reports generation error → stage error', async () => {
    const comfyFetch = vi.fn(async () =>
      new Response(JSON.stringify({ p1: { status: { status_str: 'error', completed: false }, outputs: {} } }), { status: 200 }),
    ) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch });
    expect(lastStage()).toBe('error');
  });

  it('Error: Rigger 500 → stage error with rigging message', async () => {
    const riggerFetch = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch: comfyDoneFetch(), riggerFetch });
    const err = stageCalls.find((c) => c.stage === 'error');
    expect(err).toBeDefined();
    expect((err?.extra as any)?.error_msg).toMatch(/Rigging failed/);
  });

  it('Error: Brett validation 422 → stage error with brett message', async () => {
    const riggerFetch = vi.fn(async () => new Response(new Uint8Array([4]).buffer, { status: 200 })) as unknown as typeof fetch;
    const brettFetch = vi.fn(async () => new Response('missing mixamorigHips bone', { status: 422 })) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch: comfyDoneFetch(), riggerFetch, brettFetch });
    const err = stageCalls.find((c) => c.stage === 'error');
    expect(err).toBeDefined();
    expect((err?.extra as any)?.error_msg).toMatch(/Brett upload failed/);
  });
});
