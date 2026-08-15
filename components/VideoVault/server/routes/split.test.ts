import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../handlers/split-handler', () => ({
  splitVideoOnServer: vi.fn(),
}));
vi.mock('../db', () => ({ db: undefined }));

import { splitVideoOnServer } from '../handlers/split-handler';
import { splitRouteHandler } from './split';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const validBody = {
  sourcePath: 'movies/clip.mp4',
  rootKey: 'root-a',
  splitTimeSeconds: 42,
  first: { displayName: 'A', filename: 'a.mp4', categories: {}, customCategories: {} },
  second: { displayName: 'B', filename: 'b.mp4', categories: {}, customCategories: {} },
};

beforeEach(() => {
  vi.mocked(splitVideoOnServer).mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ user: { userId: 1, username: 'u', email: 'u@x' } }),
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('splitRouteHandler', () => {
  it('400s on missing fields', async () => {
    const res = mockRes();
    await splitRouteHandler({ params: { id: 'x' }, headers: { authorization: 'Bearer t' }, body: { splitTimeSeconds: 1 } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(splitVideoOnServer).not.toHaveBeenCalled();
  });

  it('200s and returns the result on success', async () => {
    vi.mocked(splitVideoOnServer).mockResolvedValue({ success: true, segments: [{} as any, {} as any] });
    const res = mockRes();
    await splitRouteHandler({ params: { id: 'src1' }, headers: { authorization: 'Bearer t' }, body: validBody } as any, res);
    expect(splitVideoOnServer).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'src1', splitTimeSeconds: 42 }), undefined);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('422s when the handler reports failure', async () => {
    vi.mocked(splitVideoOnServer).mockResolvedValue({ success: false, message: 'nope', code: 'invalid_split' });
    const res = mockRes();
    await splitRouteHandler({ params: { id: 'src1' }, headers: { authorization: 'Bearer t' }, body: validBody } as any, res);
    expect(res.status).toHaveBeenCalledWith(422);
  });
});

describe('splitRouteHandler — auth gate', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('401s when no access token is present', async () => {
    const res = mockRes();
    await splitRouteHandler({ params: { id: 'src1' }, headers: {}, body: validBody } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(splitVideoOnServer).not.toHaveBeenCalled();
  });

  it('proceeds when the auth service verifies the bearer token', async () => {
    vi.mocked(fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { userId: 1, username: 'u', email: 'u@x' } }),
    });
    vi.mocked(splitVideoOnServer).mockResolvedValue({ success: true, segments: [{} as any, {} as any] });
    const res = mockRes();
    await splitRouteHandler(
      { params: { id: 'src1' }, headers: { authorization: 'Bearer t' }, body: validBody } as any,
      res,
    );
    expect(splitVideoOnServer).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
