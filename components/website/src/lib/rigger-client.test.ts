import { describe, it, expect, vi } from 'vitest';
import { rigGlb } from './rigger-client';

describe('rigGlb', () => {
  it('POSTs the GLB to /rig?method=blender and returns the rigged ArrayBuffer', async () => {
    const riggedBytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://rig-host:8190/rig?method=blender');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBeInstanceOf(FormData);
      return new Response(riggedBytes, { status: 200 });
    }) as unknown as typeof fetch;

    const out = await rigGlb('http://rig-host:8190', new Uint8Array([9]).buffer, 'x.glb', fetchFn);
    expect(new Uint8Array(out)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('throws on non-OK response', async () => {
    const fetchFn = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    await expect(
      rigGlb('http://rig-host:8190', new Uint8Array([9]).buffer, 'x.glb', fetchFn),
    ).rejects.toThrow('Rigger failed: 500');
  });
});
