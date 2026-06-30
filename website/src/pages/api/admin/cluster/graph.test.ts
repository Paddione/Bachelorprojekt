import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveNamespace, resolveGraph, buildStatusMap, matchPodsToNode } from './graph';
import type { GraphData, GraphNode, PodEntry } from './graph';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

import { getSession, isAdmin } from '../../../../lib/auth';
import { GET } from './graph';

describe('resolveNamespace', () => {
  it('resolves ${WEBSITE_NAMESPACE} for mentolder', () => {
    expect(resolveNamespace('${WEBSITE_NAMESPACE}', 'mentolder')).toBe('website');
  });

  it('resolves ${WEBSITE_NAMESPACE} for korczewski', () => {
    expect(resolveNamespace('${WEBSITE_NAMESPACE}', 'korczewski')).toBe('website-korczewski');
  });

  it('resolves ${WORKSPACE_NAMESPACE} for mentolder', () => {
    expect(resolveNamespace('${WORKSPACE_NAMESPACE}', 'mentolder')).toBe('workspace');
  });

  it('resolves ${WORKSPACE_NAMESPACE} for korczewski', () => {
    expect(resolveNamespace('${WORKSPACE_NAMESPACE}', 'korczewski')).toBe('workspace-korczewski');
  });

  it('resolves $STAGING_NS for both brands', () => {
    expect(resolveNamespace('$STAGING_NS', 'mentolder')).toBe('workspace-dev');
    expect(resolveNamespace('$STAGING_NS', 'korczewski')).toBe('workspace-dev');
  });

  it('returns literal namespace unchanged', () => {
    expect(resolveNamespace('monitoring', 'mentolder')).toBe('monitoring');
    expect(resolveNamespace('kube-system', 'korczewski')).toBe('kube-system');
  });
});

describe('resolveGraph', () => {
  it('resolves all node namespaces for the given brand', () => {
    const graph: GraphData = {
      generatedAt: '2026-01-01T00:00:00Z',
      nodes: [
        { id: 'a', namespace: '${WEBSITE_NAMESPACE}', type: 'Deployment', name: 'a' },
        { id: 'b', namespace: 'monitoring', type: 'Deployment', name: 'b' },
      ],
      edges: [],
    };
    const resolved = resolveGraph(graph, 'korczewski');
    expect(resolved.nodes[0].namespace).toBe('website-korczewski');
    expect(resolved.nodes[1].namespace).toBe('monitoring');
  });
});

describe('matchPodsToNode', () => {
  const pods: PodEntry[] = [
    { name: 'traefik-abc-123', phase: 'Running', ready: true, restarts: 0, containers: ['traefik'], labels: { app: 'traefik' } },
    { name: 'nextcloud-xyz-789', phase: 'Running', ready: true, restarts: 0, containers: ['nextcloud'], labels: {} },
    { name: 'other-pod', phase: 'Running', ready: true, restarts: 0, containers: ['app'], labels: { app: 'other' } },
  ];

  it('matches via label first', () => {
    const node: GraphNode = { id: 'traefik', namespace: 'workspace', type: 'Deployment', name: 'traefik' };
    const matched = matchPodsToNode(node, pods);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe('traefik-abc-123');
  });

  it('falls back to prefix match', () => {
    const node: GraphNode = { id: 'nextcloud', namespace: 'workspace', type: 'Deployment', name: 'nextcloud' };
    const matched = matchPodsToNode(node, pods);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe('nextcloud-xyz-789');
  });

  it('returns empty for no match', () => {
    const node: GraphNode = { id: 'xyz', namespace: 'workspace', type: 'Deployment', name: 'xyz' };
    const matched = matchPodsToNode(node, pods);
    expect(matched).toHaveLength(0);
  });
});

describe('buildStatusMap', () => {
  it('marks CronJob as gray', () => {
    const nodes: GraphNode[] = [{ id: 'db-backup', namespace: 'workspace', type: 'CronJob', name: 'db-backup' }];
    const podsByNs = new Map<string, PodEntry[]>();
    const statusMap = buildStatusMap(nodes, podsByNs);
    expect(statusMap.get('db-backup')?.color).toBe('#6b7280');
  });

  it('marks healthy deployment as green', () => {
    const nodes: GraphNode[] = [{ id: 'web', namespace: 'workspace', type: 'Deployment', name: 'web' }];
    const podsByNs = new Map<string, PodEntry[]>([
      ['workspace', [{ name: 'web-abc-1', phase: 'Running', ready: true, restarts: 0, containers: ['web'], labels: { app: 'web' } }]],
    ]);
    const statusMap = buildStatusMap(nodes, podsByNs);
    expect(statusMap.get('web')?.color).toBe('#22c55e');
  });

  it('marks degraded deployment as yellow', () => {
    const nodes: GraphNode[] = [{ id: 'web', namespace: 'workspace', type: 'Deployment', name: 'web' }];
    const podsByNs = new Map<string, PodEntry[]>([
      ['workspace', [{ name: 'web-abc-1', phase: 'Running', ready: true, restarts: 3, containers: ['web'], labels: { app: 'web' } }]],
    ]);
    const statusMap = buildStatusMap(nodes, podsByNs);
    expect(statusMap.get('web')?.color).toBe('#eab308');
  });

  it('marks critical deployment as red', () => {
    const nodes: GraphNode[] = [{ id: 'web', namespace: 'workspace', type: 'Deployment', name: 'web' }];
    const podsByNs = new Map<string, PodEntry[]>([
      ['workspace', [{ name: 'web-abc-1', phase: 'CrashLoopBackOff', ready: false, restarts: 10, containers: ['web'], labels: { app: 'web' } }]],
    ]);
    const statusMap = buildStatusMap(nodes, podsByNs);
    expect(statusMap.get('web')?.color).toBe('#ef4444');
  });

  it('marks unmatched node with dashed gray', () => {
    const nodes: GraphNode[] = [{ id: 'ghost', namespace: 'workspace', type: 'Deployment', name: 'ghost' }];
    const podsByNs = new Map<string, PodEntry[]>();
    const statusMap = buildStatusMap(nodes, podsByNs);
    expect(statusMap.get('ghost')?.color).toBe('#374151');
    expect(statusMap.get('ghost')?.matched).toBe(false);
  });
});

describe('GET /api/admin/cluster/graph', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset();
    vi.mocked(isAdmin).mockReset();
  });

  it('returns 401 without session', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const req = new Request('http://x/api/admin/cluster/graph');
    const res = await GET({ request: req } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-admin', async () => {
    vi.mocked(getSession).mockResolvedValue({ sub: 'u1' } as never);
    vi.mocked(isAdmin).mockReturnValue(false);
    const req = new Request('http://x/api/admin/cluster/graph');
    const res = await GET({ request: req } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });
});
