import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { makeRoutes } from './routes';
import { makeAuthMiddleware } from './middleware';

const lcStub: any = { open: () => ({ code: 'ZK4M9X', expiresAt: 0 }) };
const repoStub: any = { getRecentMatches: async () => [] };
const auth = makeAuthMiddleware({ issuers: [] });

describe('routes', () => {
  it('/healthz returns ok', async () => {
    const app = express();
    app.use(makeRoutes({ lc: lcStub, repo: repoStub, auth }));
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('/lobby/active without bearer → 401', async () => {
    const app = express();
    app.use(makeRoutes({ lc: lcStub, repo: repoStub, auth }));
    const res = await request(app).get('/lobby/active');
    expect(res.status).toBe(401);
  });
});