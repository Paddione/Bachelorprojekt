// scripts/docs-gen/graph-layout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutGraph } from './graph-layout.mjs';

/**
 * Build a small but representative graph spanning several domains so that
 * region partitioning, inner placement, and edge wiring are all exercised.
 * @returns {{ nodes: object[], edges: object[], domains: string[] }}
 */
function sampleGraph() {
  const domains = ['website', 'ops', 'infra', 'test', 'db', 'security', 'general'];
  const nodes = [
    { id: 'architecture',          label: 'Architecture',   type: 'doc',   domain: 'general',  url: 'architecture.html' },
    { id: 'keycloak',              label: 'Keycloak',       type: 'doc',   domain: 'security', url: 'keycloak.html' },
    { id: 'bachelorprojekt-infra', label: 'Infra Agent',    type: 'agent', domain: 'infra',    url: 'agents/bachelorprojekt-infra.html' },
    { id: 'bachelorprojekt-db',    label: 'DB Agent',       type: 'agent', domain: 'db',       url: 'agents/bachelorprojekt-db.html' },
    { id: 'bachelorprojekt-ops',   label: 'Ops Agent',      type: 'agent', domain: 'ops',      url: 'agents/bachelorprojekt-ops.html' },
    { id: 'database-ops',          label: 'Database Ops',   type: 'skill', domain: 'db',       url: 'skills/database-ops.html' },
    { id: 'cluster-deployment',    label: 'Cluster Deploy', type: 'skill', domain: 'infra',    url: 'skills/cluster-deployment.html' },
    { id: 'wsl-bootstrap',         label: 'WSL Bootstrap',  type: 'doc',   domain: 'general',  url: 'wsl-bootstrap.html' },
  ];
  const edges = [
    { from: 'bachelorprojekt-infra', to: 'cluster-deployment' },
    { from: 'bachelorprojekt-db',    to: 'database-ops' },
    { from: 'architecture',          to: 'keycloak' },
    { from: 'architecture',          to: 'bachelorprojekt-infra' },
    { from: 'database-ops',          to: 'keycloak' },
  ];
  return { nodes, edges, domains };
}

/** Fisher-Yates-free deterministic reversal-and-rotate shuffle (no PRNG in tests). */
function reorder(arr) {
  const copy = arr.slice().reverse();
  if (copy.length > 1) copy.push(copy.shift());
  return copy;
}

const DIM = { width: 1600, height: 1000 };

test('layoutGraph: identical output on repeated calls (determinism)', () => {
  const g = sampleGraph();
  const a = layoutGraph(g, DIM);
  const b = layoutGraph(g, DIM);
  assert.deepEqual(a, b);
});

test('layoutGraph: output is independent of input array order', () => {
  const g = sampleGraph();
  const shuffled = {
    domains: g.domains,
    nodes: reorder(g.nodes),
    edges: reorder(g.edges),
  };
  const canonical = layoutGraph(g, DIM);
  const fromShuffled = layoutGraph(shuffled, DIM);
  assert.deepEqual(fromShuffled, canonical);
});

test('layoutGraph: canvas dimensions are echoed back', () => {
  const out = layoutGraph(sampleGraph(), DIM);
  assert.equal(out.width, DIM.width);
  assert.equal(out.height, DIM.height);
});

test('layoutGraph: produces one region per occupied domain, with color + label', () => {
  const out = layoutGraph(sampleGraph(), DIM);
  const occupied = new Set(sampleGraph().nodes.map((n) => n.domain));
  assert.equal(out.regions.length, occupied.size);
  for (const r of out.regions) {
    assert.ok(occupied.has(r.domain), `region domain ${r.domain} must be occupied`);
    assert.equal(typeof r.label, 'string');
    assert.match(r.color, /^#[0-9a-f]{6}$/, 'color is a 6-digit hex');
    assert.ok(r.w > 0 && r.h > 0, 'region has positive size');
  }
});

test('layoutGraph: every placed node lies within its domain region box', () => {
  const out = layoutGraph(sampleGraph(), DIM);
  const regionByDomain = new Map(out.regions.map((r) => [r.domain, r]));
  for (const n of out.nodes) {
    const r = regionByDomain.get(n.domain);
    assert.ok(r, `node ${n.id} has a region`);
    assert.ok(n.x - n.r >= r.x, `${n.id} left edge inside region (${n.x - n.r} >= ${r.x})`);
    assert.ok(n.x + n.r <= r.x + r.w, `${n.id} right edge inside region`);
    assert.ok(n.y - n.r >= r.y, `${n.id} top edge inside region`);
    assert.ok(n.y + n.r <= r.y + r.h, `${n.id} bottom edge inside region`);
    assert.ok(n.r > 0, `${n.id} has positive radius`);
  }
});

test('layoutGraph: placed nodes carry through GraphNode fields', () => {
  const out = layoutGraph(sampleGraph(), DIM);
  const arch = out.nodes.find((n) => n.id === 'architecture');
  assert.equal(arch.label, 'Architecture');
  assert.equal(arch.type, 'doc');
  assert.equal(arch.domain, 'general');
  assert.equal(arch.url, 'architecture.html');
});

test('layoutGraph: neighbors are the sorted adjacent node ids (undirected)', () => {
  const out = layoutGraph(sampleGraph(), DIM);
  const byId = new Map(out.nodes.map((n) => [n.id, n]));
  // architecture <-> keycloak, architecture <-> bachelorprojekt-infra
  assert.deepEqual(byId.get('architecture').neighbors, ['bachelorprojekt-infra', 'keycloak']);
  // keycloak touched by architecture and database-ops
  assert.deepEqual(byId.get('keycloak').neighbors, ['architecture', 'database-ops']);
  // database-ops touched by bachelorprojekt-db and keycloak
  assert.deepEqual(byId.get('database-ops').neighbors, ['bachelorprojekt-db', 'keycloak']);
  // a leaf node has exactly one neighbor
  assert.deepEqual(byId.get('cluster-deployment').neighbors, ['bachelorprojekt-infra']);
  // an isolated node has no neighbors
  assert.deepEqual(byId.get('wsl-bootstrap').neighbors, []);
});

test('layoutGraph: placed edges connect the centers of their endpoints', () => {
  const out = layoutGraph(sampleGraph(), DIM);
  const byId = new Map(out.nodes.map((n) => [n.id, n]));
  assert.equal(out.edges.length, 5);
  for (const e of out.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    assert.ok(a && b, `edge endpoints ${e.from}->${e.to} exist`);
    assert.equal(e.x1, a.x);
    assert.equal(e.y1, a.y);
    assert.equal(e.x2, b.x);
    assert.equal(e.y2, b.y);
  }
});

test('layoutGraph: drops edges whose endpoints are not placed nodes', () => {
  const g = sampleGraph();
  g.edges.push({ from: 'architecture', to: 'ghost-node' });
  const out = layoutGraph(g, DIM);
  assert.equal(out.edges.length, 5, 'dangling edge is omitted');
});
