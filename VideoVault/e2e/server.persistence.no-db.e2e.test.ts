import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'http';
import { createTestServer } from './helpers/testServer';

describe('Persistence API without DB configured', () => {
  let server: Server;

  beforeAll(async () => {
    const { httpServer } = createTestServer();
    server = httpServer;
  });

  afterAll(async () => {
    if (server?.close) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  const expect503 = async (
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    body?: Record<string, unknown>,
  ) => {
    const req = request(server)[method](path);
    if (body) req.send(body);
    const res = await req;
    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('error');
  };

  it('GET /api/videos -> 503', async () => {
    await expect503('get', '/api/videos');
  });

  it('POST /api/videos/bulk_upsert -> 503', async () => {
    await expect503('post', '/api/videos/bulk_upsert', { videos: [] });
  });

  it('PATCH /api/videos/:id -> 503', async () => {
    await expect503('patch', '/api/videos/abc', { displayName: 'New name' });
  });

  it('DELETE /api/videos/:id -> 503', async () => {
    await expect503('delete', '/api/videos/abc');
  });

  it('POST /api/videos/batch_delete -> 503', async () => {
    await expect503('post', '/api/videos/batch_delete', { ids: ['a', 'b'] });
  });

  it('GET /api/roots -> 503', async () => {
    await expect503('get', '/api/roots');
  });

  it('POST /api/roots -> 503', async () => {
    await expect503('post', '/api/roots', { rootKey: 'r', directories: [] });
  });

  it('POST /api/roots/add -> 503', async () => {
    await expect503('post', '/api/roots/add', { rootKey: 'r', path: '/x' });
  });

  it('POST /api/roots/remove -> 503', async () => {
    await expect503('post', '/api/roots/remove', { rootKey: 'r', path: '/x' });
  });

  it('DELETE /api/roots/:rootKey -> 503', async () => {
    await expect503('delete', '/api/roots/r');
  });

  it('GET /api/roots/last -> 503', async () => {
    await expect503('get', '/api/roots/last');
  });

  it('POST /api/roots/last -> 503', async () => {
    await expect503('post', '/api/roots/last', { rootKey: 'r' });
  });

  it('GET /api/presets -> 503', async () => {
    await expect503('get', '/api/presets');
  });

  it('POST /api/presets -> 503', async () => {
    await expect503('post', '/api/presets', { id: 'p1', name: 'Preset', payload: {} });
  });

  it('PATCH /api/presets/:id -> 503', async () => {
    await expect503('patch', '/api/presets/p1', { name: 'Updated', payload: {} });
  });

  it('DELETE /api/presets/:id -> 503', async () => {
    await expect503('delete', '/api/presets/p1');
  });
});
