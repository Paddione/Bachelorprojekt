import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

vi.mock('../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

import { getSession, isAdmin } from '../../../../../lib/auth';
import { GET as getHistoryList } from './index';
import { GET as getHistoryItem } from './[id]';
import { POST as triggerPurge } from '../purge';

interface MockLocals {
  requestLogger: { error: ReturnType<typeof vi.fn> };
}
const locals: MockLocals = { requestLogger: { error: vi.fn() } };
type RouteContext = Parameters<typeof getHistoryList>[0];

describe('History and Purge API Endpoints', () => {
  let tmpDirInstance: string;
  let tmpRegistryPath: string;
  let tmpArchiveDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDirInstance = mkdtempSync(join(tmpdir(), 'api-sessions-history-test-'));
    tmpRegistryPath = join(tmpDirInstance, 'active-sessions.json');
    tmpArchiveDir = join(tmpDirInstance, 'archive');
    mkdirSync(tmpArchiveDir);
    process.env.SESSION_HUB_REGISTRY = tmpRegistryPath;
    process.env.SESSIONS_ARCHIVE_DIR = tmpArchiveDir;
  });

  afterEach(() => {
    delete process.env.SESSION_HUB_REGISTRY;
    delete process.env.SESSIONS_ARCHIVE_DIR;
    rmSync(tmpDirInstance, { recursive: true, force: true });
  });

  describe('GET /api/admin/sessions/history', () => {
    it('returns 401 when anonymous', async () => {
      vi.mocked(getSession).mockResolvedValue(null);
      const req = new Request('http://x/api/admin/sessions/history');
      const res = await getHistoryList({ request: req, locals } as unknown as RouteContext);
      expect(res.status).toBe(401);
    });

    it('returns own items for authenticated user, and all items for admin', async () => {
      // Create three archived sessions
      const now = new Date();
      const metaGekko1 = { id: 'g1', slug: 'g1', type: 'form', title: 'G1', date: now.toISOString(), owner: 'gekko', participants: [], content_available: true };
      const metaGekko2 = { id: 'g2', slug: 'g2', type: 'brainstorm', title: 'G2', date: new Date(now.getTime() - 1000).toISOString(), owner: 'gekko', participants: [], content_available: true };
      const metaPaddione = { id: 'p1', slug: 'p1', type: 'form', title: 'P1', date: new Date(now.getTime() - 2000).toISOString(), owner: 'paddione', participants: [], content_available: true };

      writeFileSync(join(tmpArchiveDir, 'g1.meta.json'), JSON.stringify(metaGekko1));
      writeFileSync(join(tmpArchiveDir, 'g2.meta.json'), JSON.stringify(metaGekko2));
      writeFileSync(join(tmpArchiveDir, 'p1.meta.json'), JSON.stringify(metaPaddione));

      // 1. Non-admin Gekko user
      vi.mocked(getSession).mockResolvedValue({ preferred_username: 'gekko' } as unknown as Awaited<ReturnType<typeof getSession>>);
      vi.mocked(isAdmin).mockReturnValue(false);

      let req = new Request('http://x/api/admin/sessions/history');
      let res = await getHistoryList({ request: req, locals } as unknown as RouteContext);
      expect(res.status).toBe(200);
      let body = await res.json();
      expect(body.total).toBe(2);
      expect(body.items.map((i: { id: string }) => i.id)).toEqual(['g1', 'g2']);

      // 2. Admin user sees all
      vi.mocked(getSession).mockResolvedValue({ preferred_username: 'gekko' } as unknown as Awaited<ReturnType<typeof getSession>>);
      vi.mocked(isAdmin).mockReturnValue(true);

      req = new Request('http://x/api/admin/sessions/history');
      res = await getHistoryList({ request: req, locals } as unknown as RouteContext);
      expect(res.status).toBe(200);
      body = await res.json();
      expect(body.total).toBe(3);
      expect(body.items.map((i: { id: string }) => i.id)).toEqual(['g1', 'g2', 'p1']);
    });

    it('paginates correctly using limit and offset', async () => {
      const now = new Date();
      for (let i = 0; i < 5; i++) {
        const meta = {
          id: `s-${i}`,
          slug: `s-${i}`,
          type: 'form',
          title: `S ${i}`,
          date: new Date(now.getTime() - i * 1000).toISOString(),
          owner: 'gekko',
          participants: [],
          content_available: true
        };
        writeFileSync(join(tmpArchiveDir, `s-${i}.meta.json`), JSON.stringify(meta));
      }

      vi.mocked(getSession).mockResolvedValue({ preferred_username: 'gekko' } as unknown as Awaited<ReturnType<typeof getSession>>);
      vi.mocked(isAdmin).mockReturnValue(false);

      const req = new Request('http://x/api/admin/sessions/history?offset=0&limit=2');
      const res = await getHistoryList({ request: req, locals } as unknown as RouteContext);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items.length).toBe(2);
      expect(body.total).toBe(5);
      expect(body.hasMore).toBe(true);
      expect(body.items.map((i: { id: string }) => i.id)).toEqual(['s-0', 's-1']);
    });

    it('filters by type', async () => {
      const now = new Date();
      const metaForm = { id: 's1', slug: 's1', type: 'form', title: 'S1', date: now.toISOString(), owner: 'gekko', participants: [], content_available: true };
      const metaBrainstorm = { id: 's2', slug: 's2', type: 'brainstorm', title: 'S2', date: now.toISOString(), owner: 'gekko', participants: [], content_available: true };

      writeFileSync(join(tmpArchiveDir, 's1.meta.json'), JSON.stringify(metaForm));
      writeFileSync(join(tmpArchiveDir, 's2.meta.json'), JSON.stringify(metaBrainstorm));

      vi.mocked(getSession).mockResolvedValue({ preferred_username: 'gekko' } as unknown as Awaited<ReturnType<typeof getSession>>);
      vi.mocked(isAdmin).mockReturnValue(false);

      const req = new Request('http://x/api/admin/sessions/history?type=form');
      const res = await getHistoryList({ request: req, locals } as unknown as RouteContext);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(1);
      expect(body.items[0].id).toBe('s1');
    });
  });

  describe('GET /api/admin/sessions/history/[id]', () => {
    it('returns markdown content for own files or admin, 403 otherwise, and enforces traversal checks', async () => {
      const metaGekko = { id: 'g1', slug: 'g1', type: 'form', title: 'G1', date: new Date().toISOString(), owner: 'gekko', participants: [], content_available: true };
      writeFileSync(join(tmpArchiveDir, 'g1.meta.json'), JSON.stringify(metaGekko));
      writeFileSync(join(tmpArchiveDir, 'g1.md'), '# Gekko Markdown Content');

      // 1. Unauthenticated -> 401
      vi.mocked(getSession).mockResolvedValue(null);
      let res = await getHistoryItem({ request: new Request('http://x'), params: { id: 'g1' }, locals } as unknown as RouteContext);
      expect(res.status).toBe(401);

      // 2. Authenticated non-owner -> 403
      vi.mocked(getSession).mockResolvedValue({ preferred_username: 'paddione' } as unknown as Awaited<ReturnType<typeof getSession>>);
      vi.mocked(isAdmin).mockReturnValue(false);
      res = await getHistoryItem({ request: new Request('http://x'), params: { id: 'g1' }, locals } as unknown as RouteContext);
      expect(res.status).toBe(403);

      // 3. Authenticated owner -> 200
      vi.mocked(getSession).mockResolvedValue({ preferred_username: 'gekko' } as unknown as Awaited<ReturnType<typeof getSession>>);
      vi.mocked(isAdmin).mockReturnValue(false);
      res = await getHistoryItem({ request: new Request('http://x'), params: { id: 'g1' }, locals } as unknown as RouteContext);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('# Gekko Markdown Content');

      // 4. Admin sees others -> 200
      vi.mocked(getSession).mockResolvedValue({ preferred_username: 'admin' } as unknown as Awaited<ReturnType<typeof getSession>>);
      vi.mocked(isAdmin).mockReturnValue(true);
      res = await getHistoryItem({ request: new Request('http://x'), params: { id: 'g1' }, locals } as unknown as RouteContext);
      expect(res.status).toBe(200);

      // 5. Invalid path/traversal check -> 400
      res = await getHistoryItem({ request: new Request('http://x'), params: { id: '../g1' }, locals } as unknown as RouteContext);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/admin/sessions/purge', () => {
    it('authenticates with Admin session or Cron Token header, and triggers purge', async () => {
      process.env.SESSIONS_CRON_TOKEN = 'my-secret-cron-token';

      // 1. No auth -> 401
      vi.mocked(getSession).mockResolvedValue(null);
      vi.mocked(isAdmin).mockReturnValue(false);
      let req = new Request('http://x', { method: 'POST' });
      let res = await triggerPurge({ request: req, locals } as unknown as RouteContext);
      expect(res.status).toBe(401);

      // 2. Bad cron token -> 401
      req = new Request('http://x', {
        method: 'POST',
        headers: { 'X-Cron-Token': 'wrong-token' }
      });
      res = await triggerPurge({ request: req, locals } as unknown as RouteContext);
      expect(res.status).toBe(401);

      // 3. Admin session cookie -> 200
      vi.mocked(getSession).mockResolvedValue({ preferred_username: 'admin' } as unknown as Awaited<ReturnType<typeof getSession>>);
      vi.mocked(isAdmin).mockReturnValue(true);
      req = new Request('http://x', { method: 'POST' });
      res = await triggerPurge({ request: req, locals } as unknown as RouteContext);
      expect(res.status).toBe(200);
      let body = await res.json();
      expect(body.purged).toBeDefined();

      // 4. Cron token header -> 200
      vi.mocked(getSession).mockResolvedValue(null);
      vi.mocked(isAdmin).mockReturnValue(false);
      req = new Request('http://x', {
        method: 'POST',
        headers: { 'X-Cron-Token': 'my-secret-cron-token' }
      });
      res = await triggerPurge({ request: req, locals } as unknown as RouteContext);
      expect(res.status).toBe(200);
      body = await res.json();
      expect(body.purged).toBeDefined();
    });
  });
});
