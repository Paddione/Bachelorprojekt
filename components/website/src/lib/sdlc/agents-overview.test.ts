import { describe, it, expect } from 'vitest';
import {
  parseLockTable,
  buildClaims,
  findRepoRoot,
  collectAgentsOverview,
  createCachedCollect,
  type AgentsOverviewDeps,
} from './agents-overview';

const TABLE = [
  'SCOPE          ID                       TOOL     SID        STATE  LABEL                FILE',
  'ticket         T016600                  unknown  4110964    live   dev-flow-execute     ticket__T016600',
  'branch         feature-x                claude   abc123     stale  plan                 branch__feature-x',
].join('\n');

describe('parseLockTable', () => {
  it('parst Zeilen positionsgenau (LABEL mit Bindestrich intakt)', () => {
    const rows = parseLockTable(TABLE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      scope: 'ticket',
      id: 'T016600',
      tool: 'unknown',
      sid: '4110964',
      state: 'live',
      label: 'dev-flow-execute',
      file: 'ticket__T016600',
    });
  });

  it('mappt unbekannten STATE auf live (fail-open wie die Shell)', () => {
    const rows = parseLockTable(TABLE);
    expect(rows[1].state).toBe('stale');
  });

  it('Header und Leer-Meldung ergeben []', () => {
    expect(parseLockTable('SCOPE          ID                       TOOL     SID        STATE  LABEL                FILE\n')).toEqual([]);
    expect(parseLockTable('(keine aktiven Claims)\n')).toEqual([]);
    expect(parseLockTable('')).toEqual([]);
  });
});

describe('buildClaims', () => {
  it('reichert Branch/Ticket aus Lock-JSONs an', async () => {
    const claims = await buildClaims(parseLockTable(TABLE), async (file) =>
      file === 'ticket__T016600'
        ? '{"branch":"feature/agents-deck","ticket":"T016600","worktree":"/tmp/wt"}'
        : null,
    );
    expect(claims[0]).toMatchObject({ branch: 'feature/agents-deck', ticket: 'T016600', worktree: '/tmp/wt' });
    expect(claims[1]).toMatchObject({ branch: '', ticket: '' });
  });

  it('kaputtes JSON blockt die übrigen Claims nicht', async () => {
    const claims = await buildClaims(parseLockTable(TABLE), async () => '{kaputt');
    expect(claims).toHaveLength(2);
    expect(claims[0].branch).toBe('');
  });
});

describe('createCachedCollect', () => {
  it('liefert Treffer innerhalb der TTL ohne Neusammlung', async () => {
    const cached = createCachedCollect(25_000);
    let calls = 0;
    const d = {
      runAgentsScript: async () => { calls++; return { code: 0 as const, stdout: '{}', stderr: '' }; },
      listLocks: async () => '',
      readLockFile: async () => null,
    };
    const first = await cached.get(d, 1_000);
    const second = await cached.get(d, 20_000);
    const third = await cached.get(d, 30_000);
    expect(first.hit).toBe(false);
    expect(second.hit).toBe(true);
    expect(third.hit).toBe(false);
    expect(calls).toBe(2);
  });
});

describe('findRepoRoot', () => {
  it('findet den Anker aufwärts', () => {
    const exists = (p: string) => p === '/repo/scripts/agent-lock.sh';
    expect(findRepoRoot('/repo/components/website/src/pages', exists)).toBe('/repo');
  });

  it('gibt null ohne Anker zurück', () => {
    expect(findRepoRoot('/repo/x/y', () => false)).toBeNull();
  });
});

function deps(over: Partial<AgentsOverviewDeps>): AgentsOverviewDeps {
  return {
    runAgentsScript: async () => ({ code: 0, stdout: '{}', stderr: '' }),
    listLocks: async () => '',
    readLockFile: async () => null,
    ...over,
  };
}

describe('collectAgentsOverview', () => {
  it('übernimmt Skript-Payload und Claims', async () => {
    const payload = await collectAgentsOverview(
      deps({
        runAgentsScript: async () => ({
          code: 0,
          stdout: JSON.stringify({
            generatedAt: 7,
            localBackends: [{ name: 'b1' }],
            agentProcesses: [{ pid: 1 }],
            agentSessions: { opencode: { status: 'ok', detail: 'd', count: 2, recent: [{ id: 's1', title: 't' }] } },
            publicApi: [{ name: 'meta-api' }],
          }),
          stderr: '',
        }),
        listLocks: async () => TABLE,
        readLockFile: async () => '{"branch":"b","ticket":"T1"}',
      }),
    );
    expect(payload.generatedAt).toBe(7);
    expect(payload.localBackends).toHaveLength(1);
    expect(payload.agentSessions.opencode.count).toBe(2);
    expect(payload.agentSessions.opencode.recent[0].id).toBe('s1');
    expect(payload.claims).toHaveLength(2);
    expect(payload.errors).toEqual({});
  });

  it('liest den snake_case-Vertrag des dotfiles-Skripts (Live-Format)', async () => {
    const payload = await collectAgentsOverview(
      deps({
        runAgentsScript: async () => ({
          code: 0,
          stdout: JSON.stringify({
            generated_at: 9,
            local_backends: [{ name: 'llama-worker-qwen35', kind: 'llama-server', url: 'u', status: 'up', models: ['m'], detail: 'd' }],
            agent_processes: [{ pid: 2, etime: '1:00', cmd: 'codex' }],
            agent_sessions: { codex: { backend: 'codex', status: 'ok', detail: 'd', count: 1, recent: [] } },
            public_api: [{ name: 'meta-api', url: 'u', status: 'auth-required', detail: 'd' }],
          }),
          stderr: '',
        }),
        listLocks: async () => '',
      }),
    );
    expect(payload.generatedAt).toBe(9);
    expect(payload.localBackends.map((b) => b.name)).toEqual(['llama-worker-qwen35']);
    expect(payload.agentProcesses).toHaveLength(1);
    expect(payload.agentSessions.codex.count).toBe(1);
    expect(payload.publicApi.map((p) => p.status)).toEqual(['auth-required']);
    expect(payload.errors).toEqual({});
  });

  it('ist fail-soft je Quelle', async () => {
    const payload = await collectAgentsOverview(
      deps({
        runAgentsScript: async () => ({ code: 1, stdout: '', stderr: 'boom' }),
        listLocks: async () => { throw new Error('no locks'); },
      }),
    );
    expect(payload.errors['agents-script']).toContain('boom');
    expect(payload.errors['locks']).toContain('no locks');
    expect(payload.localBackends).toEqual([]);
    expect(payload.claims).toEqual([]);
  });

  it('kaputtes Skript-JSON landet in errors', async () => {
    const payload = await collectAgentsOverview(
      deps({ runAgentsScript: async () => ({ code: 0, stdout: '<html>', stderr: '' }) }),
    );
    expect(payload.errors['agents-script']).toBeTruthy();
  });
});
