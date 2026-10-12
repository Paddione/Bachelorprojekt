// T901942 RED: traversal attempts must 400, not 500.
// Pre-fix the generic catch maps the traversal guard to 500; post-fix it maps to 400.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: undefined }));

import { handleMoviesRename } from './processing-movie-handlers';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('handleMoviesRename traversal guard (T901942)', () => {
  it('positive anchor: 400s on missing fields', async () => {
    const res = mockRes();
    await handleMoviesRename({ body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('RED: 400s on path traversal instead of 500', async () => {
    const res = mockRes();
    await handleMoviesRename({ body: { movieDir: '../../etc', newName: 'x' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
