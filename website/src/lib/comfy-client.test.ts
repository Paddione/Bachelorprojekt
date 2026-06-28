import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadImage, queuePrompt, getHistory, downloadOutput, findGlbOutput } from './comfy-client';

const BASE = 'http://comfy-gateway:8189';

function mockFetch(responses: Record<string, unknown>): typeof fetch {
  return vi.fn(async (url: string) => {
    const key = Object.keys(responses).find(k => url.includes(k));
    if (!key) throw new Error(`unmocked url: ${url}`);
    return {
      ok: true,
      json: async () => responses[key],
      arrayBuffer: async () => responses[key] as ArrayBuffer,
    };
  }) as unknown as typeof fetch;
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('uploadImage', () => {
  it('POSTs to /upload/image and returns filename', async () => {
    const fetch = mockFetch({ '/upload/image': { name: 'abc123.png', subfolder: '', type: 'input' } });
    const result = await uploadImage(BASE, new Uint8Array([1, 2, 3]).buffer, 'photo.png', fetch);
    expect(result).toBe('abc123.png');
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/upload/image`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('queuePrompt', () => {
  it('POSTs workflow to /prompt and returns prompt_id', async () => {
    const fetch = mockFetch({ '/prompt': { prompt_id: 'pid-001' } });
    const id = await queuePrompt(BASE, { nodes: {} }, fetch);
    expect(id).toBe('pid-001');
  });
});

describe('getHistory', () => {
  it('returns empty object when job is still queued', async () => {
    const fetch = mockFetch({ '/history/pid-001': {} });
    const h = await getHistory(BASE, 'pid-001', fetch);
    expect(h).toEqual({});
  });

  it('returns history when job is complete', async () => {
    const completed = {
      'pid-001': {
        status: { status_str: 'success', completed: true },
        outputs: { '12': { glb: [{ filename: 'output.glb', subfolder: '', type: 'output' }] } },
      },
    };
    const fetch = mockFetch({ '/history/pid-001': completed });
    const h = await getHistory(BASE, 'pid-001', fetch);
    expect(h['pid-001'].status.completed).toBe(true);
  });
});

describe('findGlbOutput', () => {
  it('returns filename of first .glb output', () => {
    const outputs = {
      '12': { glb: [{ filename: 'model.glb', subfolder: '', type: 'output' }] },
      '5': { images: [{ filename: 'preview.png', subfolder: '', type: 'output' }] },
    };
    expect(findGlbOutput(outputs)).toBe('model.glb');
  });

  it('returns null when no .glb output exists', () => {
    expect(findGlbOutput({ '1': { images: [{ filename: 'x.png' }] } })).toBeNull();
  });
});

describe('downloadOutput', () => {
  it('GETs /view with filename and returns ArrayBuffer', async () => {
    const buf = new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer;
    const fetch = mockFetch({ '/view': buf });
    const result = await downloadOutput(BASE, 'output.glb', fetch);
    expect(result).toBe(buf);
  });
});
