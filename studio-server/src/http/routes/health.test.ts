import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { makeHealthRouter } from './health';

describe('GET /healthz', () => {
  it('returns 200 with { ok: true, service: studio-server }', async () => {
    const app = express();
    app.use(makeHealthRouter());
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'studio-server' });
  });
});
