import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'http';
import { createTestServer } from './helpers/testServer';

describe('Video Cleanup API', () => {
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

    it('POST /api/videos/cleanup_missing returns 401 Unauthorized for non-authenticated requests', async () => {
        const res = await request(server).post('/api/videos/cleanup_missing');
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Unauthorized');
    });
});
