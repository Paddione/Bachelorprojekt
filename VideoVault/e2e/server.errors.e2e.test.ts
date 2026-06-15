import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import type { Server } from 'http';
import { createTestServer } from './helpers/testServer';

describe('Errors & Health API', () => {
  let server: Server;

  beforeAll(async () => {
    const { httpServer } = createTestServer((app) => {
      // Add test route to verify error handling
      app.get('/api/test/error', (_req: Request, _res: Response) => {
        const error = new Error('Test error');
        (error as Error & { code?: string }).code = 'TEST_ERROR';
        throw error;
      });
    });
    server = httpServer;
  });

  afterAll(async () => {
    if (server?.close) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('POST /api/errors/report validates required fields', async () => {
    const res = await request(server).post('/api/errors/report').send({ message: 'oops' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required fields/i);
  });

  it('POST /api/errors/report accepts valid payload', async () => {
    const payload = {
      errorId: 'e1',
      timestamp: new Date().toISOString(),
      message: 'Something went wrong',
      code: 'CLIENT_ERR',
      severity: 'low' as const,
      context: { foo: 'bar' },
    };
    const res = await request(server).post('/api/errors/report').send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, errorId: 'e1' });
  });

  it('GET /api/errors/stats returns placeholder info', async () => {
    const res = await request(server).get('/api/errors/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  it('GET /api/health returns healthy info', async () => {
    const res = await request(server).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /api/db/health reports not configured without DATABASE_URL', async () => {
    const res = await request(server).get('/api/db/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: false, healthy: false });
  });

  it('Error response includes requestId and code', async () => {
    // Hit the test-only route that throws an error
    const res = await request(server).get('/api/test/error');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('requestId');
    expect(res.body).toHaveProperty('code', 'TEST_ERROR');
    expect(res.body.message).toBe('Internal server error');
  });
});
