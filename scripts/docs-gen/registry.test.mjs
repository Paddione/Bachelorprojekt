// scripts/docs-gen/registry.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOMAINS,
  buildPages,
  buildRegistry,
  parseRoutingTable,
  assignDomain,
  collectEdges,
  outPathFor,
} from './registry.mjs';

test('DOMAINS lists the seven canonical domains including general', () => {
  assert.deepEqual(DOMAINS, [
    'website', 'ops', 'infra', 'test', 'db', 'security', 'general',
  ]);
});

test('outPathFor: doc -> bare slug, repo skill -> skills/, plugin agent -> agents/plug--bar', () => {
  assert.equal(
    outPathFor({ type: 'doc', provenance: 'repo', slug: 'architecture' }),
    'architecture.html',
  );
  assert.equal(
    outPathFor({ type: 'skill', provenance: 'repo', slug: 'foo' }),
    'skills/foo.html',
  );
  assert.equal(
    outPathFor({ type: 'agent', provenance: 'repo', slug: 'bachelorprojekt-db' }),
    'agents/bachelorprojekt-db.html',
  );
  assert.equal(
    outPathFor({ type: 'skill', provenance: 'plug@1.0.0', slug: 'foo' }),
    'skills/plug--foo.html',
  );
  assert.equal(
    outPathFor({ type: 'agent', provenance: 'plug@1.0.0', slug: 'bar' }),
    'agents/plug--bar.html',
  );
});

const ROUTING_FIXTURE = `# CLAUDE.md

  ## Agent Routing

  Before responding to any request, check these signals and delegate to the named agent:

  | Signals | Agent |
  |---------|-------|
  | \`website/\`, Astro, Svelte, component, homepage, kore, brand, CSS, UI, frontend, design | \`bachelorprojekt-website\` |
  | pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running" | \`bachelorprojekt-ops\` |
  | \`k3d/\`, \`prod*/\`, manifest, kustomize, overlay, Taskfile, \`ENV=\`, \`environments/\`, deploy | \`bachelorprojekt-infra\` |
  | test, \`FA-*\`, \`SA-*\`, \`NFA-*\`, \`AK-*\`, BATS, Playwright, \`runner.sh\`, test case, "test failing", "write a test" | \`bachelorprojekt-test\` |
  | database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, \`bachelorprojekt.features\`, \`v_timeline\` | \`bachelorprojekt-db\` |
  | SealedSecret, Keycloak realm, OIDC, DSGVO, credentials, rotate, certificate, secret | \`bachelorprojekt-security\` |

  **Tie-break rule:** prefer the domain of the files being changed.
  `;

test('parseRoutingTable: returns 6 rows including bachelorprojekt-infra with parsed signals', () => {
  const rows = parseRoutingTable(ROUTING_FIXTURE);
  assert.equal(rows.length, 6);
  const agents = rows.map((r) => r.agent);
  assert.ok(agents.includes('bachelorprojekt-infra'), 'infra row present');
  assert.deepEqual(agents, [
    'bachelorprojekt-website',
    'bachelorprojekt-ops',
    'bachelorprojekt-infra',
    'bachelorprojekt-test',
    'bachelorprojekt-db',
    'bachelorprojekt-security',
  ]);
  const infra = rows.find((r) => r.agent === 'bachelorprojekt-infra');
  assert.ok(infra.signals.includes('k3d/'), 'backticks stripped from signal');
  assert.ok(infra.signals.includes('manifest'));
  assert.ok(infra.signals.includes('deploy'));
  assert.ok(!infra.signals.includes(''), 'no empty signal tokens');
});

test('assignDomain: bachelorprojekt-<x> agent -> <x>; frontmatter wins; unrelated doc -> null', () => {
  const routing = parseRoutingTable(ROUTING_FIXTURE);

  const dbAgent = {
    type: 'agent', name: 'bachelorprojekt-db', slug: 'bachelorprojekt-db',
    title: 'DB agent', description: '', domain: null,
  };
  assert.equal(assignDomain(dbAgent, routing), 'db');

  const fmDoc = {
    type: 'doc', name: 'something', slug: 'something',
    title: 'Something', description: 'about nothing in particular', domain: 'security',
  };
  assert.equal(assignDomain(fmDoc, routing), 'security');

  const kwDoc = {
    type: 'doc', name: 'kustomize-overlay-notes', slug: 'kustomize-overlay-notes',
    title: 'Kustomize overlay notes', description: 'manifest and overlay tips', domain: null,
  };
  assert.equal(assignDomain(kwDoc, routing), 'infra');

  const unrelated = {
    type: 'doc', name: 'lunch-menu', slug: 'lunch-menu',
    title: 'Lunch menu', description: 'sandwiches and soup', domain: null,
  };
  assert.equal(assignDomain(unrelated, routing), null);
});

test('buildPages: derives slug/title/description/domain/outRelPath; bodyMarkdown excludes frontmatter', () => {
  const routing = parseRoutingTable(ROUTING_FIXTURE);
  const sources = [
    {
      type: 'skill', provenance: 'repo', name: 'database-ops',
      sourcePath: '/abs/.claude/skills/database-ops/SKILL.md',
      raw: '---\nname: database-ops\ndescription: Runbook for database operations and schema migrations\n---\n# Database Ops\n\nBody text here.',
    },
    {
      type: 'doc', provenance: 'repo', name: 'WSL-BOOTSTRAP',
      sourcePath: '/abs/docs/WSL-BOOTSTRAP.md',
      raw: '# WSL Bootstrap\n\nLunch and sandwiches.',
    },
  ];
  const pages = buildPages(sources, { routingRows: routing });
  assert.equal(pages.length, 2);

  const skill = pages.find((p) => p.name === 'database-ops');
  assert.equal(skill.slug, 'database-ops');
  assert.equal(skill.title, 'database-ops');
  assert.equal(skill.description, 'Runbook for database operations and schema migrations');
  assert.equal(skill.domain, 'db', 'keyword "database" routes to db');
  assert.equal(skill.outRelPath, 'skills/database-ops.html');
  assert.ok(!skill.bodyMarkdown.includes('---'), 'frontmatter stripped from bodyMarkdown');
  assert.ok(skill.bodyMarkdown.includes('Body text here.'));

  const doc = pages.find((p) => p.name === 'WSL-BOOTSTRAP');
  assert.equal(doc.slug, 'wsl-bootstrap');
  assert.equal(doc.title, 'WSL Bootstrap', 'title from first H1 when no frontmatter title');
  assert.equal(doc.outRelPath, 'wsl-bootstrap.html');
  assert.equal(doc.domain, null);
});

test('buildRegistry: bySlug map + resolve() with repo-beats-plugin collision', () => {
  const repoPage = {
    slug: 'shared', type: 'skill', provenance: 'repo', name: 'shared',
    title: 'Repo Shared', description: '', domain: null,
    bodyMarkdown: '', sourcePath: '/r', outRelPath: 'skills/shared.html',
  };
  const pluginPage = {
    slug: 'shared', type: 'skill', provenance: 'plug@1.0.0', name: 'shared',
    title: 'Plugin Shared', description: '', domain: null,
    bodyMarkdown: '', sourcePath: '/p', outRelPath: 'skills/plug--shared.html',
  };
  const onlyPlugin = {
    slug: 'lonely', type: 'agent', provenance: 'plug@1.0.0', name: 'lonely',
    title: 'Lonely', description: '', domain: null,
    bodyMarkdown: '', sourcePath: '/l', outRelPath: 'agents/plug--lonely.html',
  };
  const registry = buildRegistry([pluginPage, repoPage, onlyPlugin]);
  assert.ok(registry.bySlug instanceof Map);
  assert.equal(registry.resolve('shared').provenance, 'repo', 'repo beats plugin on slug collision');
  assert.equal(registry.resolve('lonely').provenance, 'plug@1.0.0');
  assert.equal(registry.resolve('does-not-exist'), null);
  // IC-2: outPathFor must be reachable from the registry object.
  assert.equal(typeof registry.outPathFor, 'function', 'IC-2: registry exposes outPathFor');
  assert.equal(registry.outPathFor({ type: 'skill', provenance: 'repo', slug: 'x' }), 'skills/x.html');
});

test('collectEdges: resolves [[known]] and relative .md links; reports [[missing]]', () => {
  const known = [
    {
      slug: 'known-a', type: 'doc', provenance: 'repo', name: 'known-a',
      title: 'Known A', description: '', domain: null,
      bodyMarkdown: '', sourcePath: '/a', outRelPath: 'known-a.html',
    },
    {
      slug: 'known-b', type: 'doc', provenance: 'repo', name: 'known-b',
      title: 'Known B', description: '', domain: null,
      bodyMarkdown: '', sourcePath: '/b', outRelPath: 'known-b.html',
    },
  ];
  const source = {
    slug: 'source', type: 'doc', provenance: 'repo', name: 'source',
    title: 'Source', description: '', domain: null,
    bodyMarkdown: 'See [[known-a]] and [link](./known-b.md) but not [[missing]].',
    sourcePath: '/s', outRelPath: 'source.html',
  };
  const pages = [...known, source];
  const registry = buildRegistry(pages);
  const { edges, unresolved } = collectEdges(pages, registry);

  assert.ok(
    edges.some((e) => e.from === 'source' && e.to === 'known-a' && e.kind === 'wikilink'),
    'wikilink edge resolved',
  );
  assert.ok(
    edges.some((e) => e.from === 'source' && e.to === 'known-b' && e.kind === 'mdlink'),
    'relative .md link edge resolved',
  );
  assert.ok(
    unresolved.some((u) => u.from === 'source' && u.ref === 'missing'),
    'missing wikilink reported',
  );
  assert.ok(
    !edges.some((e) => e.to === 'missing'),
    'no edge created for unresolved ref',
  );
});
