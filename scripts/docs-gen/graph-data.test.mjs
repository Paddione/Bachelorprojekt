// scripts/docs-gen/graph-data.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from './graph-data.mjs';

/** Minimal Page fixtures — only the fields buildGraph reads. */
function pages() {
  return [
    {
      slug: 'bachelorprojekt-db',
      type: 'agent',
      provenance: 'repo',
      name: 'bachelorprojekt-db',
      title: 'DB Agent',
      description: '',
      domain: null,
      bodyMarkdown: '',
      sourcePath: '/abs/.claude/agents/bachelorprojekt-db.md',
      outRelPath: 'agents/bachelorprojekt-db.html',
    },
    {
      slug: 'architecture',
      type: 'doc',
      provenance: 'repo',
      name: 'architecture',
      title: 'Architecture',
      description: '',
      domain: null,
      bodyMarkdown: '',
      sourcePath: '/abs/docs/architecture.md',
      outRelPath: 'architecture.html',
    },
    {
      slug: 'keycloak-realm-sync',
      type: 'skill',
      provenance: 'repo',
      name: 'keycloak-realm-sync',
      title: 'Keycloak Realm Sync',
      description: '',
      domain: null,
      bodyMarkdown: '',
      sourcePath: '/abs/.claude/skills/keycloak-realm-sync/SKILL.md',
      outRelPath: 'skills/keycloak-realm-sync.html',
    },
  ];
}

/** Routing rows: the security signal points at the security agent (not in node set, so unused here). */
function routingRows() {
  return [
    { signals: ['database', 'PostgreSQL', 'psql'], agent: 'bachelorprojekt-db' },
    { signals: ['SealedSecret', 'Keycloak realm', 'OIDC'], agent: 'bachelorprojekt-security' },
  ];
}

test('buildGraph: one node per page with correct domain assignment', () => {
  const { nodes } = buildGraph(pages(), [], routingRows());
  assert.equal(nodes.length, 3, 'one node per page');

  const byId = new Map(nodes.map((n) => [n.id, n]));

  const db = byId.get('bachelorprojekt-db');
  assert.deepEqual(db, {
    id: 'bachelorprojekt-db',
    label: 'DB Agent',
    type: 'agent',
    domain: 'db',
    url: 'agents/bachelorprojekt-db.html',
  });

  const doc = byId.get('architecture');
  assert.equal(doc.domain, 'general', 'undomained doc falls back to general');
  assert.equal(doc.label, 'Architecture');
  assert.equal(doc.url, 'architecture.html');
  assert.equal(doc.type, 'doc');
});

test('buildGraph: maps edges to {from,to}, dedupes, drops dangling edges', () => {
  const edges = [
    { from: 'architecture', to: 'bachelorprojekt-db', kind: 'wikilink' },
    { from: 'architecture', to: 'bachelorprojekt-db', kind: 'mdlink' }, // duplicate pair
    { from: 'architecture', to: 'does-not-exist', kind: 'wikilink' }, // dangling target
    { from: 'ghost', to: 'architecture', kind: 'mdlink' }, // dangling source
  ];
  const { edges: out } = buildGraph(pages(), edges, routingRows());
  assert.deepEqual(out, [{ from: 'architecture', to: 'bachelorprojekt-db' }]);
});

test('buildGraph: domains is the fixed list filtered to those present', () => {
  const { domains } = buildGraph(pages(), [], routingRows());
  // db (agent), security (keycloak-realm-sync skill title matches the "Keycloak realm"
  // signal of the security routing row), general (architecture doc has no routing match).
  assert.deepEqual(domains, ['db', 'security', 'general']);
});

test('buildGraph: deterministic — nodes sorted by [domain,type,id], stable across runs', () => {
  const a = buildGraph(pages(), [], routingRows());
  // Reverse input order to prove sort is independent of input order.
  const b = buildGraph(pages().reverse(), [], routingRows());
  assert.deepEqual(a.nodes, b.nodes, 'node order independent of input order');
  assert.deepEqual(
    a.nodes.map((n) => [n.domain, n.type, n.id]),
    [
      ['db', 'agent', 'bachelorprojekt-db'],
      ['general', 'doc', 'architecture'],
      ['security', 'skill', 'keycloak-realm-sync'],
    ],
    'sorted by [domain, type, id]',
  );
});
