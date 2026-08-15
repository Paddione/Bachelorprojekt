import { describe, it, expect } from 'vitest';
import {
  resolveNamespace,
  resolveGraph,
  matchPodsToNode,
  buildStatusMap,
  type GraphData,
  type GraphNode,
  type PodEntry,
} from './graph-utils';

const node = (id: string, name: string, namespace = 'ns', type = 'Deployment'): GraphNode => ({
  id,
  namespace,
  type,
  name,
});

const pod = (
  name: string,
  ready: boolean,
  phase = 'Running',
  restarts = 0,
  labels: Record<string, string> = {},
): PodEntry => ({
  name,
  phase,
  ready,
  restarts,
  containers: ['main'],
  labels,
});

describe('resolveNamespace', () => {
  it('maps WEBSITE_NAMESPACE placeholders to the brand namespace', () => {
    expect(resolveNamespace('${WEBSITE_NAMESPACE}', 'mentolder')).toBe('website');
    expect(resolveNamespace('${WEBSITE_NAMESPACE}', 'korczewski')).toBe('website-korczewski');
  });

  it('maps WORKSPACE_NAMESPACE placeholders to the brand workspace', () => {
    expect(resolveNamespace('${WORKSPACE_NAMESPACE}', 'mentolder')).toBe('workspace');
    expect(resolveNamespace('${WORKSPACE_NAMESPACE}', 'korczewski')).toBe('workspace-korczewski');
  });

  it('falls back to mentolder when the brand is unknown', () => {
    expect(resolveNamespace('${WEBSITE_NAMESPACE}', 'unknown-brand')).toBe('website');
  });

  it('passes through unknown placeholders', () => {
    expect(resolveNamespace('custom-ns', 'mentolder')).toBe('custom-ns');
  });
});

describe('resolveGraph', () => {
  it('rewrites namespace placeholders on every node', () => {
    const g: GraphData = {
      generatedAt: '2026-01-01',
      nodes: [
        node('a', 'A', '${WEBSITE_NAMESPACE}'),
        node('b', 'B', '${WORKSPACE_NAMESPACE}'),
      ],
      edges: [],
    };
    const out = resolveGraph(g, 'korczewski');
    expect(out.nodes[0].namespace).toBe('website-korczewski');
    expect(out.nodes[1].namespace).toBe('workspace-korczewski');
  });

  it('preserves other node fields and the generatedAt timestamp', () => {
    const g: GraphData = {
      generatedAt: '2026-01-01T00:00:00Z',
      nodes: [node('a', 'A', 'literal')],
      edges: [{ from: 'a', to: 'b' }],
    };
    const out = resolveGraph(g, 'mentolder');
    expect(out.generatedAt).toBe('2026-01-01T00:00:00Z');
    expect(out.edges).toEqual([{ from: 'a', to: 'b' }]);
  });
});

describe('matchPodsToNode', () => {
  it('matches by app label id first', () => {
    const n = node('foo', 'foo', 'ns');
    const pods = [
      pod('foo-1', true),
      pod('foo-2', true, 'Running', 0, { app: 'foo' }),
    ];
    const out = matchPodsToNode(n, pods);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('foo-2');
  });

  it('matches by app label name second', () => {
    const n = node('id-x', 'displayed', 'ns');
    const pods = [pod('displayed-1', true, 'Running', 0, { app: 'displayed' })];
    const out = matchPodsToNode(n, pods);
    expect(out).toHaveLength(1);
  });

  it('falls back to the prefix-name convention', () => {
    const n = node('id-x', 'bar', 'ns');
    const pods = [pod('bar-abc', true), pod('baz-1', true)];
    const out = matchPodsToNode(n, pods);
    expect(out.map((p) => p.name)).toEqual(['bar-abc']);
  });

  it('returns empty array if no match', () => {
    const out = matchPodsToNode(node('a', 'a', 'ns'), [pod('xyz-1', true)]);
    expect(out).toEqual([]);
  });
});

describe('buildStatusMap', () => {
  it('marks CronJob nodes as gray/done', () => {
    const n = node('cron-x', 'cron-x', 'ns', 'CronJob');
    const map = buildStatusMap([n], new Map());
    expect(map.get('cron-x')?.color).toBe('#6b7280');
    expect(map.get('cron-x')?.matched).toBe(true);
  });

  it('marks unmatched nodes dark gray', () => {
    const n = node('a', 'a', 'ns');
    const map = buildStatusMap([n], new Map());
    expect(map.get('a')?.color).toBe('#374151');
    expect(map.get('a')?.matched).toBe(false);
  });

  it('marks all-ready nodes green', () => {
    const n = node('a', 'a', 'ns');
    const pods = [pod('a-1', true), pod('a-2', true, 'Running', 0, { app: 'a' })];
    const map = buildStatusMap([n], new Map([['ns', pods]]));
    expect(map.get('a')?.color).toBe('#22c55e');
  });

  it('marks a node with restarts as yellow/degraded', () => {
    const n = node('a', 'a', 'ns');
    const pods = [pod('a-1', true, 'Running', 3, { app: 'a' })];
    const map = buildStatusMap([n], new Map([['ns', pods]]));
    expect(map.get('a')?.color).toBe('#eab308');
  });

  it('marks a node with crash-looping pod as red', () => {
    const n = node('a', 'a', 'ns');
    const pods = [pod('a-1', false, 'CrashLoopBackOff', 5, { app: 'a' })];
    const map = buildStatusMap([n], new Map([['ns', pods]]));
    expect(map.get('a')?.color).toBe('#ef4444');
  });

  it('marks a node when no pod is ready as red', () => {
    const n = node('a', 'a', 'ns');
    const pods = [pod('a-1', false, 'Pending', 0, { app: 'a' })];
    const map = buildStatusMap([n], new Map([['ns', pods]]));
    expect(map.get('a')?.color).toBe('#ef4444');
  });
});
