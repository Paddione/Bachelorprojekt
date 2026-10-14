import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  getSession: vi.fn(async (cookie: string | null) =>
    cookie === 'admin' ? { preferred_username: 'admin', email: 'admin@x', realmRoles: ['admin'] } : null,
  ),
  isAdmin: vi.fn((s: { realmRoles?: string[] } | null | undefined) => s?.realmRoles?.includes('admin') ?? false),
}));

vi.mock('../../../lib/sdlc/agents-overview', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../lib/sdlc/agents-overview')>();
  return {
    ...mod,
    createCachedCollect: vi.fn(() => ({
      get: vi.fn(async () => ({
        body: {
          generatedAt: 7,
          localBackends: [{ name: 'b1', kind: 'k', url: 'u', status: 'up', models: ['m'], detail: 'd' }],
          agentProcesses: [],
          agentSessions: {},
          publicApi: [],
          claims: [{ scope: 'ticket', id: 'T1', tool: 't', ownerSid: 's', state: 'live', label: 'l', branch: 'b', ticket: 'T1', worktree: 'w', file: 'f' }],
          errors: {},
        },
        hit: false,
      })),
    })),
  };
});

import { GET } from './agents-overview';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Der gemockte Collect läuft nie ein echtes Skript — realDeps braucht aber
// eine existente Datei, auf CI ohne ~/scripts.
const probeDir = mkdtempSync(join(tmpdir(), 'agents-overview-test-'));
process.env.AGENTS_OVERVIEW_SCRIPT = join(probeDir, 'agents-overview.py');
writeFileSync(process.env.AGENTS_OVERVIEW_SCRIPT, '#!/usr/bin/env python3\n');

function req(cookie: string | null): Request {
  return new Request('http://x/sdlc/api/agents-overview', {
    headers: cookie ? { cookie } : {},
  });
}

describe('GET /sdlc/api/agents-overview', () => {
  it('401 ohne Session', async () => {
    const res = await GET({ request: req(null) } as never);
    expect(res.status).toBe(401);
  });

  it('200 mit Admin-Session, JSON mit fetchedAt + claims', async () => {
    const res = await GET({ request: req('admin') } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(typeof body.fetchedAt).toBe('string');
    expect(body.generatedAt).toBe(7);
    expect(body.localBackends).toHaveLength(1);
    expect(body.claims).toHaveLength(1);
    expect(body.claims[0].ticket).toBe('T1');
  });
});
