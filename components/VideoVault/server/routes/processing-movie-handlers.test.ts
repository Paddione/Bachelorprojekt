// T901942 RED: traversal attempts must 400, not 500.
// Pre-fix the generic catch maps the traversal guard to 500; post-fix it maps to 400.
import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../db', () => ({ db: undefined }));

import {
  handleMoviesCleanup,
  handleMoviesDelete,
  handleMoviesIndex,
  handleMoviesOrganizeInbox,
  handleMoviesRename,
} from './processing-movie-handlers';

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & typeof res;
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

describe('remaining handlers traversal guard (T901942)', () => {
  it('Delete: 400s on path traversal instead of 500', async () => {
    const res = mockRes();
    await handleMoviesDelete({ body: { movieDir: '../../etc' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('OrganizeInbox: 400s on path traversal instead of 500', async () => {
    const res = mockRes();
    await handleMoviesOrganizeInbox({ body: { source: '../../etc' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('Index: 400s on path traversal instead of 500', async () => {
    const res = mockRes();
    await handleMoviesIndex({ body: { subdirectory: '../../etc' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('Cleanup: 400s on path traversal instead of 500', async () => {
    const res = mockRes();
    await handleMoviesCleanup({ body: { directory: '../../etc' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
