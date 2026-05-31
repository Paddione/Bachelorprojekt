---
title: Docs HTML Generator — Interactive Graph Landing Implementation Plan
ticket_id: null
domains: [infra, website, test]
status: active
pr_number: null
---

# Docs HTML Generator — Interactive Graph Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Plan 2 of 2.** This plan DEPENDS on **Plan 1 (the core generator)** being merged first. Plan 1 ships the foundation modules this plan builds on: `scripts/docs-gen/registry.mjs`, `scripts/docs-gen/render-markdown.mjs`, `scripts/docs-gen/theme.mjs`, `scripts/docs-gen/templates.mjs`, and the entry point `scripts/build-docs.mjs`. Do not start Plan 2 until those exist on the branch and their tests are green.

**Goal:** Replace the editorial card-grid landing with an interactive, domain-clustered relationship graph rendered as deterministic build-time SVG plus light client JS for hover-highlight-neighbors, click-to-navigate, and zoom/pan.

**Architecture:** `graph-data.mjs` builds graph nodes and edges from the Plan-1 registry (skills, agents, docs) and the routing-table edges; `graph-layout.mjs` produces a deterministic domain-clustered layout (no wall-clock time, no PRNG, inputs sorted internally so output is order-independent); `graph-svg.mjs` emits byte-stable SVG carrying `data-node`/`data-domain`/`data-type`/`data-neighbors` attributes, an `<a href>` wrapper per node, region backdrops, a legend, and edge lines. `theme.graphJs()` adds the interactivity layer and graph CSS, `templates.renderLanding` is overridden to embed the SVG with a `<noscript>` section-list fallback, and `build-docs.mjs` wires the graph into `index.html`.

**Tech Stack:** Node ESM (`"type":"module"`, node>=22.13.0), `node:test` + `node:assert/strict` for unit tests, hand-emitted SVG, and vanilla client JS — no runtime graph library.

**Spec:** `docs/superpowers/specs/2026-05-31-docs-html-generator-design.md`

## Pre-flight (do once)

- [ ] **Confirm branch + worktree.** Run `git -C /tmp/wt-docs-html-generator rev-parse --abbrev-ref HEAD` and verify it prints `feature/docs-html-generator`. All execution happens in the `/tmp/wt-docs-html-generator` worktree (cwd).
- [ ] **Sync with main.** Run `git -C /tmp/wt-docs-html-generator pull --rebase origin main`. If the tree is dirty, `git stash` first, pull, then `git stash pop`.
- [ ] **CONFIRM Plan 1 is merged (HARD GATE).** Run `ls scripts/docs-gen/registry.mjs scripts/docs-gen/render-markdown.mjs scripts/docs-gen/theme.mjs scripts/docs-gen/templates.mjs scripts/build-docs.mjs`. If any of these files is missing, **STOP** — Plan 1 (the core generator) must be merged before Plan 2 can proceed. Do not create stub versions of these modules; re-run the pre-flight after Plan 1 lands.
- [ ] **Install dependencies.** Run `npm install` (node_modules is not yet installed in this worktree; this also provides `node_modules/.bin/mmdc`).
- [ ] **Baseline the existing suite is green.** Run `node --test scripts/docs-gen/*.test.mjs` and confirm all Plan-1 module tests pass before writing any Plan-2 code. If they fail, fix Plan 1 / rebase before starting — do not layer Plan 2 on a red baseline.

---

## ⚠️ Integration Corrections (NORMATIVE — read before any task)

Each task below was drafted independently, so a few identifiers drifted between the SVG emitter, the client JS/CSS, the landing template, and the determinism test. This section is **authoritative**: when a task body conflicts with a rule here, follow the rule here. The three mismatches below would otherwise leave the graph non-interactive and fail the determinism test, so fix them as you implement.

### IC-1 — One canonical SVG root class: `graph-svg`

`graph-svg.mjs#renderGraphSvg` MUST emit the root element as `<svg class="graph-svg" ...>` (some drafts used `docs-graph`). The determinism test (`graph-determinism.test.mjs`) and the Manual Verification greps look for `class="graph-svg"` — so the emitter and every consumer MUST use `graph-svg`. If a task body shows `class="docs-graph"` on the `<svg>`, substitute `graph-svg`. The `graph-svg.test.mjs` byte-stability test SHOULD also assert `class="graph-svg"` is present.

### IC-2 — One canonical graph container id: `docs-graph`

The landing template (`templates.mjs#renderLanding`) MUST wrap the SVG in a container whose id is `docs-graph` — i.e. `<div class="graph-container" id="docs-graph">…</div>` (some drafts used `id="graph-container"`). `theme.mjs#graphJs()` binds via `document.getElementById('docs-graph')` and `graphCss()` styles `#docs-graph`. The id (`docs-graph`) and the SVG root class (`graph-svg`, IC-1) are **different identifiers on different elements** — keep them distinct: the `<div>` carries `id="docs-graph"`, the inner `<svg>` carries `class="graph-svg"`. If a task shows `getElementById('graph-container')` or `<div id="graph-container">`, substitute `docs-graph`.

### IC-3 — Legend CSS must match the emitted legend markup

`graph-svg.mjs` emits the legend as an in-SVG group `<g class="graph-legend">` with `<circle>`/`<text>` rows. So `theme.mjs#graphCss()` MUST style the legend via SVG-valid selectors on the actually-emitted elements (e.g. `.graph-legend text { … }`, `.graph-legend circle { … }`) — NOT `position:absolute` and NOT child selectors `.lg-item`/`.lg-dot` (those classes are never emitted, and `position` has no effect on an inline `<g>`). Either (a) style `.graph-legend text`/`.graph-legend circle` directly, or (b) if you prefer the `.lg-item`/`.lg-dot` class names, make `graph-svg.mjs` emit each legend row as `<g class="lg-item">…</g>` with the dot carrying `class="lg-dot"`. Pick ONE and keep emitter + CSS in sync. The `theme.test.mjs` graph-CSS assertion must target whichever selector you actually emit.

### IC-4 — `renderLanding` signature is `{ pages, registry, edges, routingRows }`

This supersedes the Plan-1 `renderLanding({ pages, registry })` signature. `build-docs.mjs` (Plan-2 Task 6) MUST pass `edges` (from `collectEdges`) and `routingRows` (from `parseRoutingTable`) through to `renderLanding`. Confirm the Plan-1 call site is updated, not duplicated.

---

---

### Task 1: graph-data.mjs — nodes, edges, domains from the registry

**Files:**
- Create: `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-data.mjs`
- Test: `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-data.test.mjs`
- Modify: none

- [ ] **Step 1: Write the failing test file**

  Create `scripts/docs-gen/graph-data.test.mjs` with the complete contents below. It builds a small fixture of `Page` objects, a routing table, and `Edge[]`, then asserts node/edge/domain shape, domain assignment, dangling-edge drop, and deterministic sort stability.

  ```js
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
    // db (agent), general (doc + skill have no routing match) — security never appears as a node.
    assert.deepEqual(domains, ['db', 'general']);
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
        ['general', 'skill', 'keycloak-realm-sync'],
      ],
      'sorted by [domain, type, id]',
    );
  });
  ```

- [ ] **Step 2: Run the test — expect FAIL (module missing)**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/graph-data.test.mjs
  ```

  Expected failure: the run errors before any test asserts because the module does not exist yet — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../scripts/docs-gen/graph-data.mjs'`, and `node --test` exits non-zero with `# fail 1` (the import error counts as a failed test file).

- [ ] **Step 3: Write the minimal implementation**

  Create `scripts/docs-gen/graph-data.mjs` with the complete contents below. It imports `assignDomain` from the sibling `registry.mjs` (Plan-1 module) so domain logic stays single-sourced, falls back to `'general'`, maps/dedupes/filters edges, and sorts deterministically.

  ```js
  // scripts/docs-gen/graph-data.mjs
  // Build the deterministic graph model (nodes + edges + present domains) from the page
  // registry and the collected cross-reference edges. Pure data — no layout, no SVG, no I/O.

  import { assignDomain } from './registry.mjs';

  /**
   * @typedef {import('./registry.mjs').Page} Page
   * @typedef {import('./registry.mjs').Edge} Edge
   * @typedef {import('./registry.mjs').RoutingRow} RoutingRow
   */

  /**
   * @typedef {Object} GraphNode
   * @property {string} id     - page slug
   * @property {string} label  - page title
   * @property {'skill'|'agent'|'doc'} type
   * @property {string} domain - one of the fixed domains; never null (falls back to 'general')
   * @property {string} url    - outRelPath of the page
   */

  /**
   * @typedef {Object} GraphEdge
   * @property {string} from - source slug
   * @property {string} to   - target slug
   */

  /** Canonical domain ordering used to filter the "present" domain list. */
  const DOMAIN_ORDER = ['website', 'ops', 'infra', 'test', 'db', 'security', 'general'];

  /**
   * Stable comparator for nodes: by domain, then type, then id.
   * @param {GraphNode} a
   * @param {GraphNode} b
   * @returns {number}
   */
  function compareNodes(a, b) {
    if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  }

  /**
   * Stable comparator for edges: by from, then to.
   * @param {GraphEdge} a
   * @param {GraphEdge} b
   * @returns {number}
   */
  function compareEdges(a, b) {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    if (a.to !== b.to) return a.to < b.to ? -1 : 1;
    return 0;
  }

  /**
   * Build the graph model from registry pages and collected edges.
   *
   * Each Page becomes a GraphNode; its domain is resolved via assignDomain(page, routingRows)
   * with a 'general' fallback. Edges are mapped to {from,to}, de-duplicated, and any edge whose
   * endpoints are not both in the node set is dropped. The returned domains list is the fixed
   * domain order filtered to those actually present on a node. Nodes and edges are sorted so the
   * output is independent of input array order.
   *
   * @param {Page[]} pages
   * @param {Edge[]} edges
   * @param {RoutingRow[]} routingRows
   * @returns {{ nodes: GraphNode[], edges: GraphEdge[], domains: string[] }}
   */
  export function buildGraph(pages, edges, routingRows) {
    const nodes = pages.map((page) => ({
      id: page.slug,
      label: page.title,
      type: page.type,
      domain: assignDomain(page, routingRows) || 'general',
      url: page.outRelPath,
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));

    const seen = new Set();
    const graphEdges = [];
    for (const edge of edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
      const key = `${edge.from}\u0000${edge.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      graphEdges.push({ from: edge.from, to: edge.to });
    }

    const present = new Set(nodes.map((n) => n.domain));
    const domains = DOMAIN_ORDER.filter((d) => present.has(d));

    nodes.sort(compareNodes);
    graphEdges.sort(compareEdges);

    return { nodes, edges: graphEdges, domains };
  }
  ```

- [ ] **Step 4: Provide a registry.mjs stub IF Plan-1 has not landed yet**

  This module imports `assignDomain` from `./registry.mjs`. If executing Task 1 before Plan-1's `registry.mjs` exists, the test will fail with `ERR_MODULE_NOT_FOUND` for `registry.mjs`. Verify the file is present:

  ```bash
  cd /tmp/wt-docs-html-generator && test -f scripts/docs-gen/registry.mjs && grep -q 'export function assignDomain' scripts/docs-gen/registry.mjs && echo OK || echo MISSING
  ```

  If it prints `MISSING`, stop and complete the Plan-1 `registry.mjs` task (which defines `assignDomain(page, routingRows)`) first — do NOT stub it here; `assignDomain` is owned by `registry.mjs` per the interface contract. If it prints `OK`, proceed to Step 5.

- [ ] **Step 5: Run the test — expect PASS**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/graph-data.test.mjs
  ```

  Expected: all four tests pass — terminal shows `# tests 4`, `# pass 4`, `# fail 0`, and the process exits `0`.

- [ ] **Step 6: Commit**

  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/graph-data.mjs scripts/docs-gen/graph-data.test.mjs && git commit -m "$(cat <<'EOF'
  feat(docs-gen): add graph-data buildGraph for landing graph model

  Derive the deterministic graph model (nodes, edges, present domains) from the
  page registry and collected cross-reference edges. Each Page becomes a GraphNode
  with its domain resolved via registry.assignDomain (general fallback); edges are
  mapped to {from,to}, de-duplicated, and dangling edges dropped. Nodes sort by
  [domain,type,id] and edges by [from,to] so output is independent of input order.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

Files written by this task (absolute): `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-data.mjs` and `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-data.test.mjs`. The module depends on `assignDomain` exported from the Plan-1 sibling `scripts/docs-gen/registry.mjs` — a hard ordering dependency flagged in Step 4.

---

### Task 2: graph-layout.mjs — deterministic domain-clustered layout

**Files:**
- Create: `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-layout.mjs`
- Test: `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-layout.test.mjs`

This task consumes the `{ nodes, edges, domains }` graph produced by `graph-data.mjs` (Task 1) and emits a fully deterministic placement: domain regions on a near-square grid across the canvas, nodes placed in a stable inner grid (sorted by id) inside each region, region boxes with a fixed per-domain color map, and edges expressed as straight lines between node centers. No wall-clock time, no PRNG — every coordinate is derived arithmetically from sorted indices, and all inputs are sorted internally so output is independent of input array order.

- [ ] **Step 1: Write the failing test file**

Create `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-layout.test.mjs` with the complete contents below.

```js
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
```

- [ ] **Step 2: Run the test and confirm it fails (module missing)**

```bash
cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/graph-layout.test.mjs
```

Expected FAIL: the run errors before any test executes because the module does not exist yet —
`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/tmp/wt-docs-html-generator/scripts/docs-gen/graph-layout.mjs'`
and the process exits non-zero (`# fail 1` / `tests 0`).

- [ ] **Step 3: Write the implementation**

Create `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-layout.mjs` with the complete contents below. Every coordinate is derived arithmetically from sorted indices; there is no `Date`/`performance`/`Math.random` usage anywhere, so the output is byte-for-byte reproducible and order-independent.

```js
// scripts/docs-gen/graph-layout.mjs
// Deterministic domain-clustered layout for the docs graph landing.
// CONTRACT: no wall-clock time, no PRNG. Every position is derived
// arithmetically from sorted indices, and all inputs are sorted internally
// so the output is independent of the order of the input arrays.

/**
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {string} label
 * @property {string} type
 * @property {string} domain
 * @property {string} url
 */
/**
 * @typedef {Object} GraphEdge
 * @property {string} from
 * @property {string} to
 */
/**
 * @typedef {Object} Region
 * @property {string} domain
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {string} label
 * @property {string} color
 */
/**
 * @typedef {GraphNode & { x:number, y:number, r:number, neighbors:string[] }} PlacedNode
 */
/**
 * @typedef {Object} PlacedEdge
 * @property {string} from
 * @property {string} to
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 */

// Canonical domain order — must match registry.mjs Domains constant.
const DOMAIN_ORDER = ['website', 'ops', 'infra', 'test', 'db', 'security', 'general'];

// Fixed per-domain color map. 6-digit lowercase hex, drawn from the docs
// editorial palette (gold/teal/blue accents on the dark theme). Stable forever.
const DOMAIN_COLORS = {
  website:  '#e8c870',
  ops:      '#6fb3d2',
  infra:    '#7fd1a8',
  test:     '#d29ad2',
  db:       '#d2a06f',
  security: '#d27f7f',
  general:  '#8899aa',
};

// Human-readable region labels.
const DOMAIN_LABELS = {
  website:  'Website',
  ops:      'Operations',
  infra:    'Infrastructure',
  test:     'Testing',
  db:       'Database',
  security: 'Security',
  general:  'General',
};

// Layout constants (in canvas units). All arithmetic, no magic at runtime.
const REGION_GAP = 24;       // gutter between region cells
const REGION_PAD = 18;       // inner padding inside a region before nodes start
const REGION_LABEL_H = 28;   // vertical space reserved at the top for the label
const NODE_R = 9;            // node circle radius
const NODE_GAP_X = 78;       // horizontal stride between node centers
const NODE_GAP_Y = 64;       // vertical stride between node centers

/** Stable ascending string comparison (locale-independent). */
function byId(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Order a set of domains by the canonical DOMAIN_ORDER, with any unknown
 * domains appended in ascending id order so the result is still deterministic.
 * @param {Set<string>} present
 * @returns {string[]}
 */
function orderDomains(present) {
  const known = DOMAIN_ORDER.filter((d) => present.has(d));
  const extra = [...present].filter((d) => !DOMAIN_ORDER.includes(d)).sort(byId);
  return [...known, ...extra];
}

/**
 * Lay out the graph into domain regions on a near-square grid of cells, placing
 * each domain's nodes in a stable inner grid sorted by id.
 *
 * @param {{ nodes: GraphNode[], edges: GraphEdge[], domains: string[] }} graph
 * @param {{ width: number, height: number }} opts
 * @returns {{ width:number, height:number, regions:Region[], nodes:PlacedNode[], edges:PlacedEdge[] }}
 */
export function layoutGraph(graph, { width, height }) {
  // ── Normalise & sort all inputs so output is order-independent ──────────────
  const nodes = (graph.nodes ?? []).slice().sort((a, b) => byId(a.id, b.id));
  const rawEdges = (graph.edges ?? []).slice();

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Canonicalise edges: only those whose endpoints both exist, normalised so
  // {from,to} is sorted (undirected) and de-duplicated, then sorted.
  const edgeKeys = new Set();
  const edges = [];
  for (const e of rawEdges) {
    if (!nodeById.has(e.from) || !nodeById.has(e.to) || e.from === e.to) continue;
    const [lo, hi] = e.from < e.to ? [e.from, e.to] : [e.to, e.from];
    const key = `${lo}\u0000${hi}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({ from: lo, to: hi });
  }
  edges.sort((a, b) => byId(a.from, b.from) || byId(a.to, b.to));

  // ── Compute neighbor adjacency (sorted, deduped) ────────────────────────────
  /** @type {Map<string, Set<string>>} */
  const adj = new Map(nodes.map((n) => [n.id, new Set()]));
  for (const e of edges) {
    adj.get(e.from).add(e.to);
    adj.get(e.to).add(e.from);
  }

  // ── Group nodes by domain, sorted within each group by id ───────────────────
  /** @type {Map<string, GraphNode[]>} */
  const groups = new Map();
  for (const n of nodes) {
    if (!groups.has(n.domain)) groups.set(n.domain, []);
    groups.get(n.domain).push(n);
  }
  const orderedDomains = orderDomains(new Set(groups.keys()));

  // ── Region grid: near-square arrangement of the occupied domains ────────────
  const regionCount = orderedDomains.length;
  const cols = regionCount === 0 ? 1 : Math.ceil(Math.sqrt(regionCount));
  const rows = regionCount === 0 ? 1 : Math.ceil(regionCount / cols);
  const cellW = (width - REGION_GAP * (cols + 1)) / cols;
  const cellH = (height - REGION_GAP * (rows + 1)) / rows;

  /** @type {Region[]} */
  const regions = [];
  /** @type {PlacedNode[]} */
  const placed = [];

  orderedDomains.forEach((domain, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const rx = REGION_GAP + col * (cellW + REGION_GAP);
    const ry = REGION_GAP + row * (cellH + REGION_GAP);

    regions.push({
      domain,
      x: round(rx),
      y: round(ry),
      w: round(cellW),
      h: round(cellH),
      label: DOMAIN_LABELS[domain] ?? domain,
      color: DOMAIN_COLORS[domain] ?? DOMAIN_COLORS.general,
    });

    // Inner placement: stable grid inside the region, sorted by id.
    const members = groups.get(domain); // already id-sorted (nodes was sorted)
    const innerX = rx + REGION_PAD;
    const innerY = ry + REGION_PAD + REGION_LABEL_H;
    const usableW = cellW - REGION_PAD * 2;
    // Columns that fit within the region by node stride; at least 1.
    const innerCols = Math.max(1, Math.min(members.length, Math.floor(usableW / NODE_GAP_X) || 1));

    members.forEach((member, mIdx) => {
      const c = mIdx % innerCols;
      const r = Math.floor(mIdx / innerCols);
      // Center the node on its grid cell (offset by half a stride).
      let cx = innerX + c * NODE_GAP_X + NODE_GAP_X / 2;
      let cy = innerY + r * NODE_GAP_Y + NODE_GAP_Y / 2;
      // Clamp inside the region box so the circle never spills out, even when
      // a domain holds more nodes than the cell comfortably fits.
      cx = clamp(cx, rx + REGION_PAD + NODE_R, rx + cellW - REGION_PAD - NODE_R);
      cy = clamp(cy, ry + REGION_LABEL_H + NODE_R, ry + cellH - REGION_PAD - NODE_R);
      placed.push({
        ...member,
        x: round(cx),
        y: round(cy),
        r: NODE_R,
        neighbors: [...adj.get(member.id)].sort(byId),
      });
    });
  });

  // ── Edges as straight lines between node centers ────────────────────────────
  const placedById = new Map(placed.map((n) => [n.id, n]));
  /** @type {PlacedEdge[]} */
  const placedEdges = edges.map((e) => {
    const a = placedById.get(e.from);
    const b = placedById.get(e.to);
    return { from: e.from, to: e.to, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });

  return { width, height, regions, nodes: placed, edges: placedEdges };
}

/** Round to a stable integer (deterministic; avoids float drift in SVG output). */
function round(n) {
  return Math.round(n);
}

/** Clamp v into [min, max]. */
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/graph-layout.test.mjs
```

Expected PASS: all assertions green, e.g. `# tests 10`, `# pass 10`, `# fail 0`, process exits 0. In particular the two determinism tests (`identical output on repeated calls` and `output is independent of input array order`) and the within-region / neighbor / edge-center tests all pass.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/graph-layout.mjs scripts/docs-gen/graph-layout.test.mjs && git commit -m "feat(docs-gen): deterministic domain-clustered graph layout

Add scripts/docs-gen/graph-layout.mjs exporting layoutGraph(graph, {width,height}):
partitions nodes into per-domain regions on a near-square grid (regions ordered
by the canonical Domains constant), places nodes in a stable id-sorted inner grid,
and wires edges as straight lines between node centers. Fixed per-domain color
map and labels. Fully deterministic: no wall-clock time, no PRNG; all inputs are
sorted/canonicalised internally so output is byte-stable and order-independent.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Notes for the executor:
- This module depends on the `graph-data.mjs` output shape from Task 1 (`{ nodes, edges, domains }` with `GraphNode {id,label,type,domain,url}` and `GraphEdge {from,to}`); it does not import Task 1 directly, so it can be implemented and tested in isolation as written above.
- `DOMAIN_ORDER` and `DOMAIN_COLORS` are the single source of truth for region ordering and color in Plan 2; `graph-svg.mjs` (Task 3) consumes `Region.color`/`Region.label` and `PlacedNode`/`PlacedEdge` coordinates verbatim, so do not recompute colors there.
- Determinism is enforced structurally (sort-on-entry + integer `round` + no time/PRNG), which is why both the repeat-call and shuffled-input tests can use `assert.deepEqual` on the entire returned object.

---

### Task 3: graph-svg.mjs — byte-stable interactive SVG

**Files:**
- Create: `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-svg.mjs`
- Test: `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-svg.test.mjs`

This task consumes the `layout` object produced by `graph-layout.mjs` (Task 2) — shape `{ width, height, regions: Region[], nodes: PlacedNode[], edges: PlacedEdge[] }` where `Region = { domain, x, y, w, h, label, color }`, `PlacedNode = GraphNode & { x, y, r, neighbors: slug[] }` (and `GraphNode = { id, label, type, domain, url }`), and `PlacedEdge = { from, to, x1, y1, x2, y2 }`. It produces a single byte-stable SVG string. No PRNG, no wall-clock; every numeric coordinate is rounded to a fixed precision and inputs are sorted before emission so output is independent of array order.

- [ ] **Step 1: Write the failing test file**

  Write `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-svg.test.mjs` with the complete contents below.

  ```js
  // scripts/docs-gen/graph-svg.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { renderGraphSvg } from './graph-svg.mjs';

  function fixtureLayout() {
    return {
      width: 800,
      height: 600,
      regions: [
        { domain: 'infra', x: 10, y: 10, w: 300, h: 280, label: 'Infra', color: '#3b82f6' },
        { domain: 'ops', x: 320, y: 10, w: 300, h: 280, label: 'Ops', color: '#22c55e' },
      ],
      nodes: [
        {
          id: 'bachelorprojekt-ops', label: 'bachelorprojekt-ops', type: 'agent',
          domain: 'ops', url: 'agents/bachelorprojekt-ops.html',
          x: 400.123456, y: 120.987654, r: 14, neighbors: ['cluster-deployment', 'fleet-ops'],
        },
        {
          id: 'cluster-deployment', label: 'cluster-deployment', type: 'skill',
          domain: 'infra', url: 'skills/cluster-deployment.html',
          x: 120.5, y: 90.5, r: 10, neighbors: ['bachelorprojekt-ops'],
        },
        {
          id: 'fleet-ops', label: 'A & B <x>', type: 'skill',
          domain: 'ops', url: 'skills/fleet-ops.html',
          x: 500.0, y: 200.0, r: 10, neighbors: ['bachelorprojekt-ops'],
        },
      ],
      edges: [
        { from: 'bachelorprojekt-ops', to: 'cluster-deployment', x1: 400.123456, y1: 120.987654, x2: 120.5, y2: 90.5 },
        { from: 'bachelorprojekt-ops', to: 'fleet-ops', x1: 400.123456, y1: 120.987654, x2: 500.0, y2: 200.0 },
      ],
    };
  }

  test('renderGraphSvg: emits an <svg> root with viewBox from layout size', () => {
    const svg = renderGraphSvg(fixtureLayout());
    assert.ok(svg.includes('<svg'), 'has svg open tag');
    assert.ok(svg.includes('</svg>'), 'has svg close tag');
    assert.ok(svg.includes('viewBox="0 0 800 600"'), 'viewBox derived from width/height');
  });

  test('renderGraphSvg: each node is a group with data-node and an <a href> to the node url', () => {
    const svg = renderGraphSvg(fixtureLayout());
    assert.ok(svg.includes('data-node="bachelorprojekt-ops"'), 'data-node present');
    assert.ok(svg.includes('href="agents/bachelorprojekt-ops.html"'), 'anchor href to node url');
    assert.ok(svg.includes('<circle'), 'node circle present');
    assert.ok(svg.includes('data-type="agent"'), 'data-type present');
    assert.ok(svg.includes('data-domain="ops"'), 'data-domain present');
  });

  test('renderGraphSvg: emits comma-joined data-neighbors', () => {
    const svg = renderGraphSvg(fixtureLayout());
    assert.ok(
      svg.includes('data-neighbors="cluster-deployment,fleet-ops"'),
      'neighbors comma-joined and sorted',
    );
  });

  test('renderGraphSvg: edges are <line> elements drawn before node groups', () => {
    const svg = renderGraphSvg(fixtureLayout());
    assert.ok(svg.includes('<line'), 'has line elements');
    const firstLine = svg.indexOf('<line');
    const firstNodeGroup = svg.indexOf('data-node=');
    assert.ok(firstLine !== -1 && firstNodeGroup !== -1, 'both present');
    assert.ok(firstLine < firstNodeGroup, 'edges rendered before nodes');
  });

  test('renderGraphSvg: region backdrops and labels are emitted', () => {
    const svg = renderGraphSvg(fixtureLayout());
    assert.ok(svg.includes('class="graph-region"'), 'region backdrop class');
    assert.ok(svg.includes('>Infra<'), 'region label text');
    assert.ok(svg.includes('>Ops<'), 'second region label text');
  });

  test('renderGraphSvg: contains a legend marker', () => {
    const svg = renderGraphSvg(fixtureLayout());
    assert.ok(svg.includes('class="graph-legend"'), 'legend group present');
    assert.ok(svg.includes('>skill<') || svg.includes('>Skill<'), 'legend lists a type entry');
  });

  test('renderGraphSvg: escapes text content', () => {
    const svg = renderGraphSvg(fixtureLayout());
    assert.ok(svg.includes('A &amp; B &lt;x&gt;'), 'label special chars escaped');
    assert.ok(!svg.includes('A & B <x>'), 'raw unescaped label absent');
  });

  test('renderGraphSvg: coordinates are rounded to fixed precision', () => {
    const svg = renderGraphSvg(fixtureLayout());
    assert.ok(svg.includes('400.12'), 'x rounded to 2 decimals');
    assert.ok(svg.includes('120.99'), 'y rounded to 2 decimals');
    assert.ok(!svg.includes('400.123456'), 'unrounded value absent');
  });

  test('renderGraphSvg: byte-stable across runs and input order', () => {
    const a = renderGraphSvg(fixtureLayout());
    const b = renderGraphSvg(fixtureLayout());
    assert.equal(a, b, 'identical input yields identical output');

    const shuffled = fixtureLayout();
    shuffled.nodes.reverse();
    shuffled.edges.reverse();
    shuffled.regions.reverse();
    const c = renderGraphSvg(shuffled);
    assert.equal(a, c, 'output independent of input array order');
  });
  ```

- [ ] **Step 2: Run the test — expect FAIL (module missing)**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/graph-svg.test.mjs
  ```

  Expected failure: the run aborts before any test passes with
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/tmp/wt-docs-html-generator/scripts/docs-gen/graph-svg.mjs'`
  (node's test runner reports it as a failing test file / "tests 0 ... fail 1").

- [ ] **Step 3: Write the implementation**

  Write `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-svg.mjs` with the complete contents below.

  ```js
  // scripts/docs-gen/graph-svg.mjs
  // Render a deterministic, byte-stable SVG for the docs landing relationship graph.
  // Consumes the layout object produced by graph-layout.mjs (Task 2).

  /**
   * @typedef {Object} GraphNode
   * @property {string} id
   * @property {string} label
   * @property {'skill'|'agent'|'doc'} type
   * @property {string} domain
   * @property {string} url
   */

  /**
   * @typedef {GraphNode & { x:number, y:number, r:number, neighbors:string[] }} PlacedNode
   */

  /**
   * @typedef {Object} PlacedEdge
   * @property {string} from
   * @property {string} to
   * @property {number} x1
   * @property {number} y1
   * @property {number} x2
   * @property {number} y2
   */

  /**
   * @typedef {Object} Region
   * @property {string} domain
   * @property {number} x
   * @property {number} y
   * @property {number} w
   * @property {number} h
   * @property {string} label
   * @property {string} color
   */

  /**
   * @typedef {Object} Layout
   * @property {number} width
   * @property {number} height
   * @property {Region[]} regions
   * @property {PlacedNode[]} nodes
   * @property {PlacedEdge[]} edges
   */

  // Fixed fill color per node type. Kept in sync with theme.mjs graph CSS legend.
  const TYPE_COLORS = {
    agent: '#e8c870',
    skill: '#7dd3fc',
    doc: '#c4b5fd',
  };
  const TYPE_ORDER = ['agent', 'skill', 'doc'];

  // Round to 2 decimals, normalising -0 to 0, so output is byte-stable.
  function num(n) {
    const r = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    const fixed = r === 0 ? 0 : r; // collapse -0
    return String(fixed);
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Stable string compare independent of host locale.
  function byStr(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function colorForType(type) {
    return TYPE_COLORS[type] || '#9aa6b2';
  }

  function renderRegions(regions) {
    const sorted = [...regions].sort((a, b) => byStr(a.domain, b.domain));
    return sorted
      .map((rg) => {
        const x = num(rg.x);
        const y = num(rg.y);
        const w = num(rg.w);
        const h = num(rg.h);
        const labelX = num(rg.x + 12);
        const labelY = num(rg.y + 22);
        return (
          `<g class="graph-region" data-domain="${esc(rg.domain)}">` +
          `<rect class="graph-region-bg" x="${x}" y="${y}" width="${w}" height="${h}" ` +
          `rx="14" fill="${esc(rg.color)}" fill-opacity="0.07" ` +
          `stroke="${esc(rg.color)}" stroke-opacity="0.35"/>` +
          `<text class="graph-region-label" x="${labelX}" y="${labelY}" ` +
          `fill="${esc(rg.color)}">${esc(rg.label)}</text>` +
          `</g>`
        );
      })
      .join('');
  }

  function renderEdges(edges) {
    const sorted = [...edges].sort(
      (a, b) => byStr(a.from, b.from) || byStr(a.to, b.to),
    );
    return sorted
      .map(
        (e) =>
          `<line class="graph-edge" data-from="${esc(e.from)}" data-to="${esc(e.to)}" ` +
          `x1="${num(e.x1)}" y1="${num(e.y1)}" x2="${num(e.x2)}" y2="${num(e.y2)}"/>`,
      )
      .join('');
  }

  function renderNodes(nodes) {
    const sorted = [...nodes].sort((a, b) => byStr(a.id, b.id));
    return sorted
      .map((n) => {
        const neighbors = [...(n.neighbors || [])].sort(byStr).join(',');
        const cx = num(n.x);
        const cy = num(n.y);
        const r = num(n.r);
        const labelY = num(n.y + n.r + 13);
        return (
          `<g class="graph-node" data-node="${esc(n.id)}" data-type="${esc(n.type)}" ` +
          `data-domain="${esc(n.domain)}" data-neighbors="${esc(neighbors)}">` +
          `<a href="${esc(n.url)}">` +
          `<circle class="graph-node-dot" cx="${cx}" cy="${cy}" r="${r}" ` +
          `fill="${colorForType(n.type)}"/>` +
          `<text class="graph-node-label" x="${cx}" y="${labelY}" ` +
          `text-anchor="middle">${esc(n.label)}</text>` +
          `</a></g>`
        );
      })
      .join('');
  }

  function renderLegend(width, height) {
    const rowH = 22;
    const x = 16;
    const baseY = num(Number(height) - (TYPE_ORDER.length * rowH) - 14);
    const rows = TYPE_ORDER.map((type, i) => {
      const cy = num(Number(height) - (TYPE_ORDER.length * rowH) - 14 + 14 + i * rowH);
      const ty = num(Number(height) - (TYPE_ORDER.length * rowH) - 14 + 19 + i * rowH);
      return (
        `<g class="graph-legend-row" data-type="${esc(type)}">` +
        `<circle cx="${num(x + 8)}" cy="${cy}" r="7" fill="${colorForType(type)}"/>` +
        `<text x="${num(x + 24)}" y="${ty}">${esc(type)}</text>` +
        `</g>`
      );
    }).join('');
    return (
      `<g class="graph-legend" data-legend-y="${baseY}">` +
      `<text class="graph-legend-title" x="${num(x)}" y="${num(Number(height) - (TYPE_ORDER.length * rowH) - 22)}">Legend</text>` +
      rows +
      `</g>`
    );
  }

  /**
   * Render the relationship graph layout to a byte-stable SVG string.
   * Edges are drawn first (under nodes); regions are backdrops behind both.
   * @param {Layout} layout
   * @returns {string}
   */
  export function renderGraphSvg(layout) {
    const width = num(layout.width);
    const height = num(layout.height);
    const regions = renderRegions(layout.regions || []);
    const edges = renderEdges(layout.edges || []);
    const nodes = renderNodes(layout.nodes || []);
    const legend = renderLegend(layout.width, layout.height);

    return (
      `<svg class="docs-graph" xmlns="http://www.w3.org/2000/svg" ` +
      `viewBox="0 0 ${width} ${height}" role="img" aria-label="Documentation relationship graph">` +
      `<g class="graph-regions">${regions}</g>` +
      `<g class="graph-edges">${edges}</g>` +
      `<g class="graph-nodes">${nodes}</g>` +
      legend +
      `</svg>`
    );
  }

  export default { renderGraphSvg };
  ```

- [ ] **Step 4: Run the test — expect PASS**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/graph-svg.test.mjs
  ```

  Expected output ends with `# pass 9` / `# fail 0` (all 9 tests green): svg root + viewBox, node group with `data-node` + `<a href>` + `data-type` + `data-domain`, comma-joined `data-neighbors`, edges-before-nodes ordering, region backdrops + labels, legend marker, escaped text content, fixed-precision rounding, and byte-stability across runs and input order.

- [ ] **Step 5: Commit**

  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/graph-svg.mjs scripts/docs-gen/graph-svg.test.mjs && git commit -m "feat(docs-gen): byte-stable interactive graph SVG renderer

Add scripts/docs-gen/graph-svg.mjs exporting renderGraphSvg(layout): region
backdrops + labels, edges as <line> elements drawn under node groups, one
group per node wrapping an <a href> circle (filled by type) + label with
data-node/data-domain/data-type/data-neighbors attributes, plus a type/domain
legend. All coordinates rounded to fixed precision and inputs sorted internally
so output is byte-stable across runs and independent of input array order; text
content is HTML-escaped.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

Notes for the executor:
- `renderGraphSvg` depends only on the `layout` shape from `graph-layout.mjs` (Task 2); the test ships its own fixture, so this task has no cross-module import and can be implemented/verified in isolation.
- The `<a href>` uses the node's relative `url` exactly as the registry built it (`agents/<slug>.html`, `skills/<slug>.html`, etc.) — no rewriting here.
- Determinism: every emitter sorts its input (`regions` by domain, `edges` by `from,to`, `nodes` by `id`, `neighbors` lexicographically) and `num()` collapses `-0` to `0`, so the byte-stability test passes even when input arrays are reversed.
- The graph CSS/JS that styles and animates `.graph-node`/`.graph-edge`/`data-neighbors` is added separately in `theme.mjs` (`graphJs()` + graph CSS) in the theme/landing task; this module only emits markup with the required `data-*` hooks.
- File paths produced by this task: `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-svg.mjs` and `/tmp/wt-docs-html-generator/scripts/docs-gen/graph-svg.test.mjs`.

---

### Task 4: theme.mjs graphJs() + graph CSS (extend Plan-1 theme)

**Files:**
- Modify: `scripts/docs-gen/theme.mjs`
- Test: `scripts/docs-gen/theme.test.mjs`

This task assumes Plan 1 has already created `scripts/docs-gen/theme.mjs` exporting `editorialCss()` and `clientJs()`, where `clientJs()` is composed from named `const` string pieces (the search overlay, copy buttons, mermaid pan/zoom, and `{DOMAIN}`/`{PROTO}` runtime substitution lifted from the old `getPageJs`). We add `graphJs()` (a new named-const-backed string piece) and `graphCss()`, then wire them into `clientJs()` and `editorialCss()` without renaming any existing export. The interactivity reuses the exact mermaid pan/zoom approach from the old `scripts/build-docs.js` (lines 288–304: `dx/dy/scale`, `wheel` clamp `0.3..10`, `pointerdown/move/up` with `setPointerCapture`).

> Contract note: the interface requires `clientJs()` to compose `graphJs()` ("append graphJs to the existing pieces") and the graph CSS to be reachable through the existing `editorialCss()`/`clientJs()` outputs. We pick the **export-`graphCss()`** option (rather than inlining into `editorialCss`) and have `editorialCss()` include `graphCss()`. Export names `editorialCss`, `clientJs` stay intact; `graphJs` and `graphCss` are added.

- [ ] **Step 1: Confirm the Plan-1 `theme.mjs` shape before extending it (read, do not edit yet).**
  Run this to verify the named-const composition seam exists and capture the exact `clientJs()` return expression and the `editorialCss()` return expression you will extend:
  ```bash
  cd /tmp/wt-docs-html-generator
  grep -nE "export function (editorialCss|clientJs|graphJs|graphCss)|const [A-Z_]+ *=|return " scripts/docs-gen/theme.mjs
  ```
  Expected: `export function editorialCss()` and `export function clientJs()` are present; `clientJs()` returns a concatenation of named `const` JS pieces (e.g. `SUBST_JS`, `COPY_JS`, `MERMAID_JS`, `SEARCH_JS`); `editorialCss()` returns a CSS template. `graphJs`/`graphCss` are NOT yet present. If `clientJs()` is a single monolithic template literal with no named-const seam, first refactor it into named `const` pieces joined with `+`/template interpolation (no behavior change) so `graphJs()` can be appended cleanly — this is the precondition the interface contract calls out ("build it by composing named const string pieces so graphJs() can be appended cleanly").

- [ ] **Step 2: Write the failing test for `graphJs()`, `clientJs()` composition, and `graphCss()`.**
  Append the three new tests to the existing `scripts/docs-gen/theme.test.mjs` (do NOT recreate the file — Plan 1 already has `editorialCss`/`clientJs` tests there). Add this block at the end of the file:
  ```javascript
  // ── Task 4: graph interactivity (graphJs) + graph CSS ──────────────────────────
  import { graphJs, graphCss } from './theme.mjs';

  test('graphJs: returns a syntactically valid script that wires neighbor highlighting', () => {
    const js = graphJs();
    assert.equal(typeof js, 'string', 'graphJs returns a string');
    assert.ok(js.length > 0, 'graphJs is non-empty');
    // Parses as a function body (no syntax errors) — does not execute it.
    assert.doesNotThrow(() => new Function(js), 'graphJs must parse as valid JS');
    // Reads the per-node neighbor list emitted by graph-svg.
    assert.ok(js.includes('data-neighbors'), 'graphJs references data-neighbors');
    // Hover-highlight toggles the dim/hl classes defined in graphCss.
    assert.ok(js.includes("'dim'") || js.includes('"dim"'), 'graphJs toggles the dim class');
    assert.ok(js.includes("'hl'") || js.includes('"hl"'), 'graphJs toggles the hl class');
    // Pointer + wheel interactivity (pan/zoom + hover) is present.
    assert.ok(js.includes('pointerover'), 'graphJs listens for pointerover');
    assert.ok(js.includes('wheel'), 'graphJs implements wheel-zoom');
  });

  test('clientJs: composes graphJs into the page client script', () => {
    const js = clientJs();
    assert.ok(js.includes('data-neighbors'), 'clientJs contains the graph code (data-neighbors)');
    // Still parses as a whole after composition.
    assert.doesNotThrow(() => new Function(js), 'composed clientJs must parse as valid JS');
    // Existing pieces survive composition (search overlay + copy buttons + mermaid pan/zoom).
    assert.ok(js.includes('search-overlay'), 'clientJs keeps the search overlay code');
    assert.ok(js.includes('copy-btn'), 'clientJs keeps the copy-button code');
  });

  test('graphCss: exposes the dim/hl/region rules and is included in editorialCss', () => {
    const css = graphCss();
    assert.equal(typeof css, 'string', 'graphCss returns a string');
    assert.ok(css.includes('.dim'), 'graphCss defines a .dim rule');
    assert.ok(css.includes('.hl'), 'graphCss defines a .hl rule');
    assert.ok(css.includes('.graph-region'), 'graphCss defines region styling');
    assert.ok(css.includes('overflow:hidden'), 'graph container clips pan/zoom overflow');
    // editorialCss must surface the graph CSS so the single stylesheet covers the landing.
    assert.ok(editorialCss().includes('.dim'), 'editorialCss includes graphCss rules');
  });
  ```
  Note: the top of `theme.test.mjs` (from Plan 1) already imports `test`, `assert`, `editorialCss`, and `clientJs`. The added `import { graphJs, graphCss } from './theme.mjs';` line for the new symbols is fine as a second ESM import from the same module (ESM dedupes); keep `editorialCss`/`clientJs` referenced via the Plan-1 import.

- [ ] **Step 3: Run the new tests and watch them FAIL.**
  ```bash
  cd /tmp/wt-docs-html-generator
  node --test scripts/docs-gen/theme.test.mjs
  ```
  Expected FAIL: the run aborts at import resolution with
  `SyntaxError: The requested module './theme.mjs' does not provide an export named 'graphJs'`
  (because `graphJs`/`graphCss` are not yet exported). This proves the tests exercise the not-yet-written code.

- [ ] **Step 4: Add the `GRAPH_JS` named const + `graphJs()` export to `theme.mjs`.**
  Insert the following block immediately above the existing `export function clientJs() {` line in `scripts/docs-gen/theme.mjs`. It reuses the exact wheel/pointer pan-zoom approach lifted from the old `build-docs.js` (zoom clamp `0.3..10`, `setPointerCapture`), applied to the `#docs-graph` container, and adds neighbor hover-highlight via `data-neighbors`:
  ```javascript
  // ─── graphJs ────────────────────────────────────────────────────────────────
  // Client interactivity for the landing graph SVG. Reuses the mermaid pan/zoom
  // approach from the old build-docs.js (wheel clamp 0.3..10, pointer drag with
  // setPointerCapture) and adds neighbor hover-highlight via data-neighbors.
  const GRAPH_JS = `
  (function(){
    var container=document.getElementById('docs-graph');
    if(!container)return;
    var svg=container.querySelector('svg');
    if(!svg)return;

    // ── hover-highlight neighbors ──
    var nodes=Array.prototype.slice.call(container.querySelectorAll('[data-node]'));
    function clearHl(){
      nodes.forEach(function(n){n.classList.remove('dim');n.classList.remove('hl');});
    }
    function highlight(active){
      var raw=active.getAttribute('data-neighbors')||'';
      var keep={};
      keep[active.getAttribute('data-node')]=true;
      raw.split(/[ ,]+/).forEach(function(id){if(id)keep[id]=true;});
      nodes.forEach(function(n){
        var id=n.getAttribute('data-node');
        if(keep[id]){n.classList.add('hl');n.classList.remove('dim');}
        else{n.classList.add('dim');n.classList.remove('hl');}
      });
    }
    nodes.forEach(function(n){
      n.addEventListener('pointerover',function(){highlight(n);});
      n.addEventListener('pointerout',clearHl);
      n.addEventListener('focus',function(){highlight(n);});
      n.addEventListener('blur',clearHl);
    });
    // background click / pointer leave clears the highlight (the <a> handles nav)
    container.addEventListener('pointerleave',clearHl);
    svg.addEventListener('click',function(e){
      if(!e.target.closest('[data-node]'))clearHl();
    });

    // ── zoom / pan (same model as mermaid wrappers) ──
    var dx=0,dy=0,scale=1,dragging=false,ox=0,oy=0;
    svg.style.transformOrigin='0 0';
    function upd(){svg.style.transform='translate('+dx+'px,'+dy+'px) scale('+scale+')';}
    container.addEventListener('wheel',function(e){
      e.preventDefault();
      scale=Math.min(10,Math.max(0.3,scale*(e.deltaY>0?0.9:1.1)));upd();
    },{passive:false});
    container.addEventListener('pointerdown',function(e){
      if(e.target.closest('[data-node]'))return; // let node clicks navigate
      dragging=true;ox=e.clientX-dx;oy=e.clientY-dy;
      container.style.cursor='grabbing';container.setPointerCapture(e.pointerId);
    });
    container.addEventListener('pointermove',function(e){
      if(!dragging)return;dx=e.clientX-ox;dy=e.clientY-oy;upd();
    });
    container.addEventListener('pointerup',function(){dragging=false;container.style.cursor='grab';});
  })();
  `;

  export function graphJs() {
    return GRAPH_JS;
  }
  ```

- [ ] **Step 5: Compose `graphJs()` into `clientJs()`.**
  Edit the existing `clientJs()` body so its return value appends `GRAPH_JS` after the existing pieces. The exact edit depends on how Plan 1 wrote `clientJs()`; apply whichever case matches.

  Case A — Plan 1's `clientJs()` returns a `+`-joined concatenation of named consts, e.g.:
  ```javascript
  export function clientJs() {
    return SUBST_JS + COPY_JS + MERMAID_JS + SEARCH_JS;
  }
  ```
  Change the return to append `GRAPH_JS`:
  ```javascript
  export function clientJs() {
    return SUBST_JS + COPY_JS + MERMAID_JS + SEARCH_JS + GRAPH_JS;
  }
  ```

  Case B — Plan 1's `clientJs()` joins an array of pieces, e.g.:
  ```javascript
  export function clientJs() {
    return [SUBST_JS, COPY_JS, MERMAID_JS, SEARCH_JS].join('\n');
  }
  ```
  Add `GRAPH_JS` to the array:
  ```javascript
  export function clientJs() {
    return [SUBST_JS, COPY_JS, MERMAID_JS, SEARCH_JS, GRAPH_JS].join('\n');
  }
  ```
  In both cases `GRAPH_JS` is already defined above `clientJs()` from Step 4, so it is in scope. Do not change the other pieces.

- [ ] **Step 6: Add the `GRAPH_CSS` named const + `graphCss()` export, and include it from `editorialCss()`.**
  Insert this block immediately above the existing `export function editorialCss() {` line in `scripts/docs-gen/theme.mjs`. The graph container clips pan/zoom overflow (`overflow:hidden`), and `.dim`/`.hl` are the states `GRAPH_JS` toggles:
  ```javascript
  // ─── graphCss ───────────────────────────────────────────────────────────────
  // Styling for the landing graph: domain regions, node hover states (.dim/.hl),
  // the pan/zoom container, and the legend. Surfaced through editorialCss().
  const GRAPH_CSS = `
  #docs-graph{position:relative;overflow:hidden;border:1px solid var(--dark-border);
    border-radius:10px;background:var(--dark-light);margin:0 0 2em;touch-action:none;
    cursor:grab;min-height:60vh}
  #docs-graph svg{display:block;width:100%;height:auto}
  .graph-region{fill:var(--gold-dim);stroke:var(--dark-border);stroke-width:1;
    rx:12;opacity:.5}
  .graph-region-label{fill:var(--muted-dark);font-size:13px;font-weight:700;
    letter-spacing:.08em;text-transform:uppercase;pointer-events:none}
  .graph-edge{stroke:var(--dark-border);stroke-width:1.2;opacity:.55}
  [data-node]{cursor:pointer;transition:opacity .12s}
  [data-node] circle{transition:stroke .12s,stroke-width .12s}
  [data-node] text{fill:var(--light);font-size:12px;pointer-events:none}
  [data-node].dim{opacity:.18}
  [data-node].hl circle{stroke:var(--gold);stroke-width:2.5}
  [data-node].hl text{fill:var(--gold-light)}
  .graph-legend{position:absolute;top:10px;right:12px;background:var(--dark-lighter);
    border:1px solid var(--dark-border);border-radius:8px;padding:.6em .8em;
    font-size:.72rem;color:var(--muted);pointer-events:none}
  .graph-legend .lg-item{display:flex;align-items:center;gap:.4em;margin:.15em 0}
  .graph-legend .lg-dot{width:10px;height:10px;border-radius:50%;display:inline-block}
  `;

  export function graphCss() {
    return GRAPH_CSS;
  }
  ```
  Then edit the existing `editorialCss()` so it appends `GRAPH_CSS` to its returned stylesheet. Apply whichever case matches Plan 1's `editorialCss()`.

  Case A — `editorialCss()` returns one template literal, e.g.:
  ```javascript
  export function editorialCss() {
    return `
  :root { /* …editorial vars… */ }
  /* …editorial rules… */
  `;
  }
  ```
  Change it to interpolate `GRAPH_CSS` at the end of the same template:
  ```javascript
  export function editorialCss() {
    return `
  :root { /* …editorial vars… */ }
  /* …editorial rules… */
  ${GRAPH_CSS}`;
  }
  ```
  Case B — `editorialCss()` returns a `+`-joined set of named CSS consts, e.g. `return BASE_CSS + LAYOUT_CSS + CARD_CSS;` — append `+ GRAPH_CSS`:
  ```javascript
  export function editorialCss() {
    return BASE_CSS + LAYOUT_CSS + CARD_CSS + GRAPH_CSS;
  }
  ```
  `GRAPH_CSS` is defined above `editorialCss()` from this step, so it is in scope. The graph CSS references the Plan-1 CSS custom properties (`--dark-border`, `--gold`, `--gold-dim`, `--gold-light`, `--dark-light`, `--dark-lighter`, `--light`, `--muted`, `--muted-dark`) declared in the `:root` block of `editorialCss()`; do not redeclare them.

- [ ] **Step 7: Run the new tests and watch them PASS.**
  ```bash
  cd /tmp/wt-docs-html-generator
  node --test scripts/docs-gen/theme.test.mjs
  ```
  Expected PASS: the three new tests (`graphJs: …`, `clientJs: composes graphJs …`, `graphCss: exposes the dim/hl/region rules …`) report `ok`, and the Plan-1 `editorialCss`/`clientJs` tests still pass. Summary line shows `# fail 0`.

- [ ] **Step 8: Confirm no regression across the docs-gen suite and the entry test.**
  ```bash
  cd /tmp/wt-docs-html-generator
  node --test scripts/docs-gen/*.test.mjs scripts/build-docs.test.mjs
  ```
  Expected PASS: `# fail 0` across all docs-gen module tests plus the entry test (any modules not yet implemented in earlier-numbered plan tasks are out of scope for this task — if run before they exist, scope this step to `node --test scripts/docs-gen/theme.test.mjs` instead and re-run the full suite during the final integration task).

- [ ] **Step 9: Commit.**
  ```bash
  cd /tmp/wt-docs-html-generator
  git add scripts/docs-gen/theme.mjs scripts/docs-gen/theme.test.mjs
  git commit -m "$(cat <<'EOF'
feat(docs-gen): add graphJs() + graph CSS to theme, compose into clientJs

Extend the Plan-1 theme module with the landing-graph client interactivity
and styling:

- graphJs(): hover-highlight-neighbors via data-neighbors (dim/hl classes),
  background-click reset, and wheel-zoom + pointer-drag-pan on #docs-graph
  (reusing the mermaid pan/zoom model: clamp 0.3..10, setPointerCapture).
  Node <a> navigation is left intact (drags skip [data-node] targets).
- clientJs() now composes GRAPH_JS after the existing pieces.
- graphCss() (exported) defines region backdrops, node .dim/.hl states, the
  overflow:hidden pan/zoom container, and the legend; editorialCss() includes
  it so the single stylesheet covers the graph landing.

Tests: graphJs() parses via new Function and references data-neighbors;
clientJs() now contains the graph code; graphCss() contains a .dim rule and
editorialCss() surfaces it.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

Relevant files (absolute paths):
- Modify: `/tmp/wt-docs-html-generator/scripts/docs-gen/theme.mjs`
- Test: `/tmp/wt-docs-html-generator/scripts/docs-gen/theme.test.mjs`
- Pan/zoom source lifted from: `/tmp/wt-docs-html-generator/scripts/build-docs.js` (lines 288–304)

---

### Task 5: templates.renderLanding override — graph hero + noscript fallback

**Files:**
- Modify: `scripts/docs-gen/templates.mjs`
- Test: `scripts/docs-gen/templates.test.mjs`

> **Signature change (supersedes Plan 1):** Plan 1 shipped `renderLanding({ pages, registry })` (an editorial card-grid landing). This task **overrides** it to `renderLanding({ pages, registry, edges, routingRows })`. The export name stays `renderLanding`. The new params are required to build the graph (`edges` feed `collectEdges` output into `buildGraph`; `routingRows` supply the domain regions). `build-docs.mjs` must be updated to pass `edges` and `routingRows` at the call site — that wiring is **Task 6**, not this task.

- [ ] **Step 1: Write the failing test for the graph-hero landing override**

  Append the following block to the END of `scripts/docs-gen/templates.test.mjs` (the file already exists from Plan 1; do not touch the existing tests above):

  ```js
  // ─── renderLanding (Plan 2 override: graph hero + noscript fallback) ───────────
  test('renderLanding: embeds graph SVG, fallback section list, and legend marker', () => {
    const pages = [
      { slug: 'bachelorprojekt-ops', type: 'agent', provenance: 'repo',
        name: 'bachelorprojekt-ops', title: 'Ops Agent', description: 'ops things',
        domain: 'ops', bodyMarkdown: '', sourcePath: '/x/ops.md',
        outRelPath: 'agents/bachelorprojekt-ops.html' },
      { slug: 'database-ops', type: 'skill', provenance: 'repo',
        name: 'database-ops', title: 'Database Ops', description: 'db runbook',
        domain: 'db', bodyMarkdown: '', sourcePath: '/x/database-ops/SKILL.md',
        outRelPath: 'skills/database-ops.html' },
      { slug: 'wsl-bootstrap', type: 'doc', provenance: 'repo',
        name: 'wsl-bootstrap', title: 'WSL Bootstrap', description: 'setup doc',
        domain: 'general', bodyMarkdown: '', sourcePath: '/x/WSL-BOOTSTRAP.md',
        outRelPath: 'wsl-bootstrap.html' },
    ];
    const bySlug = new Map(pages.map((p) => [p.slug, p]));
    const registry = { pages, bySlug, resolve: (n) => bySlug.get(n) ?? null };
    const edges = [{ from: 'database-ops', to: 'bachelorprojekt-ops', kind: 'wikilink' }];
    const routingRows = [
      { signals: ['pod', 'logs', 'status'], agent: 'bachelorprojekt-ops' },
      { signals: ['database', 'psql'], agent: 'bachelorprojekt-db' },
    ];

    const html = renderLanding({ pages, registry, edges, routingRows });

    assert.ok(html.startsWith('<!DOCTYPE html>'), 'is a full HTML document');
    assert.ok(html.includes('<svg'), 'embeds the graph SVG');
    assert.ok(html.includes('<noscript>'), 'has a noscript fallback');
    assert.ok(/Skills\s*\(1\)/.test(html), 'fallback lists Skills with a count');
    assert.ok(/Agents\s*\(1\)/.test(html), 'fallback lists Agents with a count');
    assert.ok(/Docs\s*\(1\)/.test(html), 'fallback lists Docs with a count');
    assert.ok(html.includes('graph-legend'), 'contains the legend marker');
    assert.ok(html.includes('href="./skills/database-ops.html"'),
      'fallback links a skill page by outRelPath');
  });
  ```

  > The test asserts `'<svg'`, `'<noscript>'`, per-section counts `Skills (1)/Agents (1)/Docs (1)`, the `graph-legend` marker (emitted by `renderGraphSvg`'s legend group), and a real fallback link built from `page.outRelPath`. It builds fake `pages`/`edges`/`routingRows` inline per the interface shapes — no fixtures.

- [ ] **Step 2: Run the test — expect FAIL**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/templates.test.mjs
  ```

  Expected: the new test fails. Because the Plan-1 `renderLanding({ pages, registry })` ignores `edges`/`routingRows` and emits a card grid (no `<svg`, no `graph-legend`), assertions fail with output like:

  ```
  not ok N - renderLanding: embeds graph SVG, fallback section list, and legend marker
    AssertionError [ERR_ASSERTION]: embeds the graph SVG
  ```

- [ ] **Step 3: Add graph imports to templates.mjs**

  At the TOP of `scripts/docs-gen/templates.mjs`, immediately after the existing import lines (the module already imports `editorialCss`/`clientJs` from `./theme.mjs` and `provenanceBadge` helpers from Plan 1), add these three imports:

  ```js
  import { buildGraph } from './graph-data.mjs';
  import { layoutGraph } from './graph-layout.mjs';
  import { renderGraphSvg } from './graph-svg.mjs';
  ```

- [ ] **Step 4: Replace renderLanding with the graph-hero override**

  In `scripts/docs-gen/templates.mjs`, replace the entire existing Plan-1 `renderLanding` function (the `export function renderLanding({ pages, registry }) { ... }` block) with this complete implementation. The export name and `export function` shape are unchanged; only the destructured signature and body differ:

  ```js
  /**
   * Render the landing page: an editorial hero with the interactive domain-clustered
   * relationship graph as the centrepiece, plus a <noscript>-friendly fallback that
   * lists the sections (skills/agents/docs) with counts so the page is usable without JS.
   *
   * Signature change (Plan 2): supersedes the Plan-1 `renderLanding({ pages, registry })`
   * card-grid landing. `edges` and `routingRows` are required to build the graph.
   *
   * @param {object} args
   * @param {import('./registry.mjs').Page[]} args.pages
   * @param {{ pages: any[], bySlug: Map<string, any>, resolve: (name: string) => any }} args.registry
   * @param {import('./registry.mjs').Edge[]} args.edges
   * @param {import('./registry.mjs').RoutingRow[]} args.routingRows
   * @returns {string} full HTML5 document
   */
  export function renderLanding({ pages, registry, edges, routingRows }) {
    const graph = buildGraph(pages, edges, routingRows);
    const layout = layoutGraph(graph, { width: 1200, height: 760 });
    const svg = renderGraphSvg(layout);

    const sections = [
      { type: 'skill', title: 'Skills', indexPath: './skills.html' },
      { type: 'agent', title: 'Agents', indexPath: './agents.html' },
      { type: 'doc', title: 'Docs', indexPath: './docs.html' },
    ];

    const fallback = sections.map((section) => {
      const items = pages.filter((p) => p.type === section.type);
      const links = items
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((p) => `        <li><a href="./${p.outRelPath}">${escapeHtml(p.title)}</a></li>`)
        .join('\n');
      return `    <section class="fallback-section">
      <h2><a href="${section.indexPath}">${section.title} (${items.length})</a></h2>
      <ul>
${links}
      </ul>
    </section>`;
    }).join('\n');

    const contentHtml = `<header class="landing-hero">
    <h1>Workspace Documentation</h1>
    <p class="landing-intro">An interactive, domain-clustered map of every skill, agent, and document in the Workspace platform. Hover a node to highlight its neighbours, click to open a page, scroll to zoom, and drag to pan. Click the background to reset.</p>
  </header>
  <section class="graph-hero" aria-label="Relationship graph">
    <div class="graph-container" id="graph-container">
${svg}
    </div>
  </section>
  <noscript>
    <p class="noscript-note">The interactive graph needs JavaScript. Browse the documentation by section instead:</p>
${fallback}
  </noscript>`;

    return wrapDocument({
      title: 'Workspace Documentation',
      bodyClass: 'landing-page',
      contentHtml,
    });
  }
  ```

  > This calls `wrapDocument(...)` — the shared full-HTML5 shell helper already defined in `templates.mjs` from Plan 1 (the same helper `renderPage`/`renderSectionIndex` use to emit `<!DOCTYPE html>` + `editorialCss()` + `clientJs()`). It also uses `escapeHtml(...)`, the existing local escaper from Plan 1. Both already exist in the module; do not redefine them. The `graph-legend` marker is emitted inside `svg` by `renderGraphSvg` (Task in Plan 2 graph-svg), so no extra markup is needed here.

- [ ] **Step 5: Run the test — expect PASS**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/templates.test.mjs
  ```

  Expected: all tests pass, including the new one:

  ```
  ok N - renderLanding: embeds graph SVG, fallback section list, and legend marker
  ...
  # pass <N>
  # fail 0
  ```

- [ ] **Step 6: Commit**

  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/templates.mjs scripts/docs-gen/templates.test.mjs && git commit -m "feat(docs-gen): override renderLanding with graph hero + noscript fallback

Override templates.renderLanding to embed the interactive domain-clustered
graph SVG (buildGraph -> layoutGraph -> renderGraphSvg) inside an editorial
hero, with a <noscript> fallback listing skills/agents/docs sections and
counts so the landing is usable without JS.

Signature changes from renderLanding({ pages, registry }) to
renderLanding({ pages, registry, edges, routingRows }); build-docs.mjs is
repointed to pass edges + routingRows in a later task.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

Plan piece written. Relevant file paths (absolute, in the worktree where execution lands): `/tmp/wt-docs-html-generator/scripts/docs-gen/templates.mjs` (modify) and `/tmp/wt-docs-html-generator/scripts/docs-gen/templates.test.mjs` (extend). The task depends on Plan-1 `templates.mjs` having defined `wrapDocument`/`escapeHtml`/`renderLanding`, and on Plan-2 modules `graph-data.mjs`/`graph-layout.mjs`/`graph-svg.mjs` existing (the `graph-legend` marker comes from `renderGraphSvg`). The call-site wiring (passing `edges`+`routingRows`) is explicitly deferred to Task 6.

---

### Task 6: Wire landing into build-docs.mjs + determinism CI + deploy

**Files:**
- Create: `scripts/docs-gen/graph-determinism.test.mjs`
- Modify: `scripts/build-docs.mjs` (landing step passes `edges` + `routingRows` to `renderLanding`; build report adds graph node/edge/unplaced counts)
- Modify: `Taskfile.yml` (confirm `test:docs-gen` glob covers the new test; no change if Plan 1's glob is already `scripts/docs-gen/*.test.mjs`)
- Test: `scripts/docs-gen/graph-determinism.test.mjs`

> Context for the executor: Plan 1 Task 2 created `test:docs-gen` running `node --test scripts/docs-gen/*.test.mjs scripts/build-docs.test.mjs` and added it to the `test:all` deps. Plan 2's earlier tasks created `graph-data.mjs`, `graph-layout.mjs`, `graph-svg.mjs`, extended `theme.mjs` with `graphJs()`, and overrode `renderLanding` in `templates.mjs` to embed the graph SVG. This task is the final wiring: pass the already-computed `edges`/`routingRows` into `renderLanding` from the entry point, surface graph counts in the build report, and lock determinism with a byte-identical CI test.

- [ ] **Step 1: Write the failing determinism test for the landing graph SVG**

  Create `scripts/docs-gen/graph-determinism.test.mjs`. It builds a deterministic in-memory page set + edges + routing rows, calls `renderLanding` twice, and asserts the embedded `<svg ... class="graph-svg">` block is byte-identical across runs. It also asserts a second render after sorting the input arrays in reverse order still produces the identical SVG (proves `layoutGraph` sorts internally and ignores input order). Full code:

  ```javascript
  // scripts/docs-gen/graph-determinism.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { renderLanding } from './templates.mjs';
  import { buildRegistry, buildPages } from './registry.mjs';

  /** Minimal deterministic fixture: 4 pages spanning 3 domains + 2 types. */
  function fixtureSources() {
    return [
      {
        type: 'agent', provenance: 'repo', name: 'bachelorprojekt-infra',
        sourcePath: '/repo/.claude/agents/bachelorprojekt-infra.md',
        raw: '---\ndescription: >\n  Infra agent.\n  Handles deploys.\n---\n# Infra\nSee [[bachelorprojekt-ops]].\n',
      },
      {
        type: 'agent', provenance: 'repo', name: 'bachelorprojekt-ops',
        sourcePath: '/repo/.claude/agents/bachelorprojekt-ops.md',
        raw: '---\ndescription: >\n  Ops agent.\n  Handles pods.\n---\n# Ops\nSee [[bachelorprojekt-infra]].\n',
      },
      {
        type: 'skill', provenance: 'repo', name: 'cluster-deployment',
        sourcePath: '/repo/.claude/skills/cluster-deployment/SKILL.md',
        raw: '---\ndescription: Deploy runbook.\n---\n# Cluster Deployment\nLinks to [[bachelorprojekt-infra]].\n',
      },
      {
        type: 'doc', provenance: 'repo', name: 'wsl-bootstrap',
        sourcePath: '/repo/docs/WSL-BOOTSTRAP.md',
        raw: '# WSL Bootstrap\nGeneral setup notes.\n',
      },
    ];
  }

  /** Routing rows mirroring the CLAUDE.md table shape (signals -> agent slug). */
  function fixtureRoutingRows() {
    return [
      { signals: ['pod', 'logs', 'status'], agent: 'bachelorprojekt-ops' },
      { signals: ['manifest', 'kustomize', 'deploy'], agent: 'bachelorprojekt-infra' },
    ];
  }

  /** Edges as collectEdges would produce them from the fixture's [[name]] refs. */
  function fixtureEdges() {
    return [
      { from: 'bachelorprojekt-infra', to: 'bachelorprojekt-ops', kind: 'wikilink' },
      { from: 'bachelorprojekt-ops', to: 'bachelorprojekt-infra', kind: 'wikilink' },
      { from: 'cluster-deployment', to: 'bachelorprojekt-infra', kind: 'wikilink' },
    ];
  }

  function extractGraphSvg(html) {
    const m = html.match(/<svg\b[^>]*class="graph-svg"[\s\S]*?<\/svg>/);
    assert.ok(m, 'landing HTML must contain a graph-svg <svg> block');
    return m[0];
  }

  test('renderLanding: graph SVG is byte-identical across two renders', () => {
    const pages = buildPages(fixtureSources());
    const registry = buildRegistry(pages);
    const args = { pages, registry, edges: fixtureEdges(), routingRows: fixtureRoutingRows() };

    const svg1 = extractGraphSvg(renderLanding(args));
    const svg2 = extractGraphSvg(renderLanding(args));
    assert.equal(svg1, svg2, 'two consecutive renders must produce identical graph SVG');
  });

  test('renderLanding: graph SVG is independent of input array order', () => {
    const pages = buildPages(fixtureSources());
    const registry = buildRegistry(pages);
    const svgForward = extractGraphSvg(renderLanding({
      pages, registry, edges: fixtureEdges(), routingRows: fixtureRoutingRows(),
    }));

    // Reverse every input array; deterministic layout must sort internally.
    const svgReversed = extractGraphSvg(renderLanding({
      pages: [...pages].reverse(),
      registry,
      edges: [...fixtureEdges()].reverse(),
      routingRows: [...fixtureRoutingRows()].reverse(),
    }));
    assert.equal(svgForward, svgReversed, 'layout must not depend on input array order');
  });

  test('renderLanding: graph SVG carries per-node interactivity attributes', () => {
    const pages = buildPages(fixtureSources());
    const registry = buildRegistry(pages);
    const svg = extractGraphSvg(renderLanding({
      pages, registry, edges: fixtureEdges(), routingRows: fixtureRoutingRows(),
    }));
    assert.ok(svg.includes('data-node='), 'nodes must expose data-node');
    assert.ok(svg.includes('data-neighbors='), 'nodes must expose data-neighbors for hover-highlight');
    assert.ok(svg.includes('data-domain='), 'nodes must expose data-domain for region grouping');
  });
  ```

- [ ] **Step 2: Run the determinism test and confirm it FAILS for the right reason**

  Run exactly:
  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/graph-determinism.test.mjs
  ```
  Expected FAIL: at this point `renderLanding` in `templates.mjs` does not yet receive `edges`/`routingRows` from the entry point (Plan 2 earlier tasks gave `renderLanding` the new signature, so this test imports cleanly), but the entry point `build-docs.mjs` still calls the old `renderLanding({ pages, registry })` — so a full build would render an empty/placeholder graph. The unit test itself passes against `templates.mjs` directly once Plan 2's renderLanding override exists. If `templates.mjs` has NOT yet been overridden (out-of-order execution), the failure is:
  ```
  AssertionError [ERR_ASSERTION]: landing HTML must contain a graph-svg <svg> block
  ```
  Do not proceed past this step until that exact assertion message (or a clean import error naming `renderLanding`) is what you see — it proves the test exercises the graph path, not a stub.

- [ ] **Step 3: Read the current `renderLanding` call site in `scripts/build-docs.mjs`**

  Run:
  ```bash
  cd /tmp/wt-docs-html-generator && grep -n "renderLanding\|collectEdges\|parseRoutingTable\|buildReport\|report\." scripts/build-docs.mjs
  ```
  Confirm the entry already computes `const { edges, unresolved } = collectEdges(pages, registry)` and `const routingRows = parseRoutingTable(claudeMdText)` (both produced in Plan 1). Note the exact variable names and the object literal passed to `renderLanding(...)` and the build-report object so the edits in Step 4–5 match verbatim. If `edges`/`routingRows` are named differently in the merged Plan 1 output, adapt the two edits below to those names (the contract names are `edges` and `routingRows`).

- [ ] **Step 4: Edit `scripts/build-docs.mjs` — pass `edges` + `routingRows` into `renderLanding`**

  Change the landing render call from the Plan-1 form to the full graph form. Apply this exact edit (the `old_string` is what Plan 1 shipped; if your merged tree differs only in whitespace, match it precisely):

  Replace:
  ```javascript
    const landingHtml = renderLanding({ pages, registry });
    writeFileSync(join(OUT_DIR, 'index.html'), landingHtml, 'utf8');
  ```
  With:
  ```javascript
    const landingHtml = renderLanding({ pages, registry, edges, routingRows });
    writeFileSync(join(OUT_DIR, 'index.html'), landingHtml, 'utf8');
  ```

  `edges` comes from `collectEdges(pages, registry)` and `routingRows` from `parseRoutingTable(claudeMdText)`, both already in scope from Plan 1's `main()`. No new imports are needed.

- [ ] **Step 5: Edit `scripts/build-docs.mjs` — surface graph counts in the build report**

  Just before the report is printed, build the graph once for reporting (the same deterministic `buildGraph` + `layoutGraph` the landing uses), and add three fields: graph node count, graph edge count, and any nodes that could not be placed. First add the imports at the top of the file (alongside the existing `docs-gen` imports):

  ```javascript
  import { buildGraph } from './docs-gen/graph-data.mjs';
  import { layoutGraph } from './docs-gen/graph-layout.mjs';
  ```

  Then, in `main()`, immediately after the `renderLanding` block from Step 4, insert the report-instrumentation block:

  ```javascript
    // Graph metrics for the build report (same deterministic inputs the landing uses).
    const reportGraph = buildGraph(pages, edges, routingRows);
    const reportLayout = layoutGraph(reportGraph, { width: 1600, height: 1000 });
    const placedIds = new Set(reportLayout.nodes.map((n) => n.id));
    const unplacedNodes = reportGraph.nodes
      .filter((n) => !placedIds.has(n.id))
      .map((n) => n.id)
      .sort();
  ```

  Finally, extend the printed report. Locate the existing report `console.log` block (Plan 1 prints page counts by type, unresolved cross-refs, diagram fallbacks, skipped plugin sources, legacy rewrapped vs copied, passthrough pages) and add these three lines at the end of it, before the trailing summary line:

  ```javascript
    console.log(`  graph nodes:        ${reportGraph.nodes.length}`);
    console.log(`  graph edges:        ${reportGraph.edges.length}`);
    console.log(`  unplaced nodes:     ${unplacedNodes.length}${unplacedNodes.length ? ' (' + unplacedNodes.join(', ') + ')' : ''}`);
  ```

  If Plan 1 collected report data into a structured object (e.g. `const report = { ... }`) rather than ad-hoc `console.log`s, add `graphNodes: reportGraph.nodes.length`, `graphEdges: reportGraph.edges.length`, and `unplacedNodes` to that object and render them in its print function instead — keep the same three labels.

- [ ] **Step 6: Run the determinism test and confirm it PASSES**

  Run exactly:
  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/graph-determinism.test.mjs
  ```
  Expected PASS (3 tests):
  ```
  # tests 3
  # pass 3
  # fail 0
  ```

- [ ] **Step 7: Confirm the `test:docs-gen` glob already covers the new test (no Taskfile change expected)**

  Plan 1 created `test:docs-gen` with the glob `scripts/docs-gen/*.test.mjs`. Verify the new file matches and the task runs it:
  ```bash
  cd /tmp/wt-docs-html-generator && grep -n "docs-gen/\*.test.mjs\|test:docs-gen" Taskfile.yml
  ```
  Expected: the `test:docs-gen` task body contains `node --test scripts/docs-gen/*.test.mjs` (which globs in `graph-determinism.test.mjs`). If — and only if — the merged `test:docs-gen` enumerates files explicitly instead of globbing (so `graph-determinism.test.mjs` is NOT picked up), apply this edit to restore the glob:

  Replace (the explicit-list form, adapt to the exact merged text):
  ```yaml
  test:docs-gen:
    desc: "Run docs-gen unit tests (node:test)"
    cmds:
      - node --test scripts/build-docs.test.mjs
  ```
  With:
  ```yaml
  test:docs-gen:
    desc: "Run docs-gen unit tests (node:test)"
    cmds:
      - node --test scripts/docs-gen/*.test.mjs scripts/build-docs.test.mjs
  ```
  Then re-run `grep` to confirm the glob is present. In the common case (Plan 1 already globs), make NO Taskfile edit and just record the confirmation in the step note.

- [ ] **Step 8: Run the full docs-gen suite via the Taskfile task**

  Run exactly:
  ```bash
  cd /tmp/wt-docs-html-generator && task test:docs-gen
  ```
  Expected PASS — every `scripts/docs-gen/*.test.mjs` (including `graph-determinism.test.mjs`) plus the entry test reports `# fail 0`. The aggregate footer must show `# fail 0`.

- [ ] **Step 9: Run `task test:all` and confirm green**

  This is the acceptance criterion ("Unit tests pass under `task test:all`"). Run exactly:
  ```bash
  cd /tmp/wt-docs-html-generator && task test:all
  ```
  Expected: all deps (`test:unit`, `test:manifests`, `test:art-library`, `test:menu-gate`, `test:dry-run`, and the Plan-1-added `test:docs-gen`) complete with exit code 0. If `test:docs-gen` is missing from the `test:all` deps (Plan 1 regression), STOP and fix Plan 1's `test:all` block — the determinism test only protects CI if `test:docs-gen` is a dependency of `test:all`. Confirm with:
  ```bash
  cd /tmp/wt-docs-html-generator && task test:all 2>&1 | tail -20; echo "EXIT=${PIPESTATUS[0]}"
  ```
  Expected `EXIT=0`.

- [ ] **Step 10: Commit the wiring + determinism test**

  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/build-docs.mjs scripts/docs-gen/graph-determinism.test.mjs Taskfile.yml
  git commit -m "$(cat <<'EOF'
feat(docs-gen): wire graph landing into build entry + determinism CI

renderLanding now receives edges + routingRows so the entry point builds
the full domain-clustered graph instead of a placeholder. The build report
gains graph node/edge counts and lists any nodes that could not be placed.
Adds a node:test determinism guard asserting the landing graph SVG is
byte-identical across renders and independent of input array order; it is
picked up by the existing test:docs-gen glob so it runs under task test:all.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```
  (If Step 7 made no Taskfile change, drop `Taskfile.yml` from the `git add`.)

- [ ] **Step 11: Run the full build and verify the landing renders the graph**

  Run exactly:
  ```bash
  cd /tmp/wt-docs-html-generator && node scripts/build-docs.mjs
  ```
  Expected in the build report tail (counts approximate to this repo):
  ```
    graph nodes:        <N>     # ~16 repo skills + superpowers subskills + 6 repo agents + ~73 plugin skills + ~22 plugin agents + docs
    graph edges:        <M>     # wikilink + mdlink + routing-table edges
    unplaced nodes:     0
  ```
  `unplaced nodes: 0` is the success signal — every graph node landed in a domain region. Then confirm the SVG was actually written into the landing:
  ```bash
  cd /tmp/wt-docs-html-generator && grep -c 'class="graph-svg"' k3d/docs-content-built/index.html && grep -c 'data-neighbors=' k3d/docs-content-built/index.html && grep -c '<noscript>' k3d/docs-content-built/index.html
  ```
  Expected: `1` (one graph SVG), a positive count for `data-neighbors=` (per-node), and `1` for the `<noscript>` fallback list of sections.

- [ ] **Step 12: Verify graph interactivity in a browser**

  The landing is a self-contained static file (`app.js` is inlined/loaded relative; no server needed for the SVG + client JS). Open it directly and exercise the four behaviors:
  ```bash
  cd /tmp/wt-docs-html-generator && (xdg-open k3d/docs-content-built/index.html 2>/dev/null || echo "open file://$(pwd)/k3d/docs-content-built/index.html in a browser")
  ```
  Verify, in order:
  1. **Graph renders** — domain region backdrops + labels are visible, nodes are colored by type, a legend is present.
  2. **Hover dims non-neighbors** — hovering a node keeps that node + its `data-neighbors` highlighted and dims everything else (the `graphJs()` hover-highlight from `theme.mjs`).
  3. **Click navigates** — clicking a node follows its `<a href>` to the corresponding page (e.g. `agents/bachelorprojekt-infra.html`).
  4. **Zoom/pan works** — scroll-to-zoom and drag-to-pan on the graph container; clicking the empty background resets the view.

  Alternative without a local browser: deploy the dev docs surface and browse it. Per the dev-stack docs, reach the dev cluster via `ssh -i ~/.ssh/gekko_id_ed25519 gekko@k3s-1`, then load the built landing through the dev docs route, or use the Playwright MCP browser tools against `file://.../index.html` to assert the same four behaviors programmatically. Record the observed result of each of the four checks in the step note.

- [ ] **Step 13: Deploy note (post-merge — do NOT auto-run)**

  After this branch merges to `main`, ship the regenerated docs to both brands with:
  ```bash
  task docs:deploy
  ```
  This runs the new `scripts/build-docs.mjs` entry (Plan 1 repointed `docs:deploy` to it), builds + pushes `ghcr.io/paddione/workspace-docs:latest`, then `kubectl apply k3d/docs.yaml` + `rollout restart deployment/docs` for `env in korczewski mentolder` on the `fleet` context (namespace `workspace` for mentolder, `workspace-korczewski` for korczewski). Do NOT run it as part of plan execution — it touches production. Confirm afterwards at `https://docs.mentolder.de` and `https://docs.korczewski.de` (behind oauth2-proxy) that the landing graph renders. No separate commit for this step.

---

Reference facts the executor will need (verified against the worktree at `/tmp/wt-docs-html-generator`):
- `Taskfile.yml` `test:all` (line 339) deps are currently `test:unit, test:manifests, test:art-library, test:menu-gate, test:dry-run` — Plan 1 Task 2 must have added `test:docs-gen` here; Step 9 hard-checks that.
- `docs:build` (line 2069), `docs:deploy` (line 2076), `docs:refresh-diagrams` (line 2100), `datamodel:build` (line 1166) all currently invoke `node scripts/build-docs.js` — Plan 1 repoints them to `scripts/build-docs.mjs`; this task assumes that repoint and does not redo it.
- `OUT_DIR` is `k3d/docs-content-built`; landing output is `index.html`; the Dockerfile bakes `k3d/docs-content-built` into the image (read-only rootfs at runtime), so the landing must be a fully static self-contained file — the determinism test guards exactly that byte-stability.

---

## Manual Verification

These steps are run from the worktree root `/tmp/wt-docs-html-generator` after `npm install` has installed the new `gray-matter` devDependency and `node_modules/.bin/mmdc`.

- [ ] **Unit tests (incl. determinism) green.** Run `node --test scripts/docs-gen/*.test.mjs` and confirm all suites pass with no failures. In particular confirm the graph determinism test (`graph-layout.test.mjs`) passes: it lays out the same graph twice — once with the source arrays in original order and once with them shuffled — and asserts the two `layoutGraph(...)` results (region rects, node x/y/r, edge endpoints) are deeply equal, and that `renderGraphSvg(layout)` returns a byte-identical string both times.
- [ ] **`task test:all` green.** Run `task test:all` and confirm it now invokes `test:docs-gen` (added to the `deps:` list in Plan 1) and that the graph module suites run inside CI's offline gate. The job must exit 0.
- [ ] **Build determinism — diff two runs.** Run the full build twice and diff the landing page:
  ```bash
  node scripts/build-docs.mjs && cp k3d/docs-content-built/index.html /tmp/index-run1.html
  node scripts/build-docs.mjs && cp k3d/docs-content-built/index.html /tmp/index-run2.html
  diff /tmp/index-run1.html /tmp/index-run2.html && echo "DETERMINISTIC"
  ```
  Confirm `diff` reports no differences and prints `DETERMINISTIC`. The embedded graph SVG must be byte-stable (no wall-clock timestamps, no PRNG, input-order-independent).
- [ ] **Open the landing graph and verify rendering.** Open `k3d/docs-content-built/index.html` in a browser. Confirm:
  - [ ] **Domain-clustered regions** are visible — each routing domain (`website`, `ops`, `infra`, `test`, `db`, `security`, `general`) renders as a labeled, colored backdrop rectangle, and nodes sit inside their domain's region.
  - [ ] **Nodes colored by type** — skill, agent, and doc nodes are visually distinct, and a **legend** maps each type color to its label.
  - [ ] **Hover-highlight-neighbors** — hovering a node highlights it plus the nodes connected to it via `data-neighbors`, and dims every other node and edge; moving off (hovering the background) resets the view.
  - [ ] **Click-to-navigate** — clicking a node follows its `<a href>` wrapper to that page's HTML (e.g. clicking the `bachelorprojekt-infra` node lands on `agents/bachelorprojekt-infra.html`).
  - [ ] **Zoom/pan** — scroll/drag zoom and pan on the graph container works, and clicking empty background resets the transform.
  - [ ] **`<noscript>` fallback** — with JavaScript disabled, the landing still shows the fallback section list (links to `skills.html`, `agents.html`, `docs.html`) so the page degrades gracefully.

## Acceptance Criteria

Plan 2 owns the **graph-related** acceptance criteria from the spec (`docs/superpowers/specs/2026-05-31-docs-html-generator-design.md`, lines 128–141). Mapping to this plan's tasks:

- **"Landing page is the interactive domain-clustered graph (hover-highlight, click-nav, zoom/pan); layout is deterministic across runs."**
  - *Domain-clustered graph data* (skills + agents + docs grouped by routing-table domain, colored by type) — Task: `graph-data.mjs` (`buildGraph`).
  - *Deterministic layout across runs* (no wall-clock, no PRNG, input-order-independent) — Tasks: `graph-layout.mjs` (`layoutGraph`) and its determinism test.
  - *Byte-stable SVG with interactivity hooks* (`data-node`/`data-domain`/`data-type`/`data-neighbors`, `<a href>` wrappers, region backdrops + labels, edges, legend) — Task: `graph-svg.mjs` (`renderGraphSvg`).
  - *Hover-highlight-neighbors, click-to-navigate, zoom/pan, reset-on-background* — Task: `theme.mjs` extended (`graphJs()` composed into `clientJs()`) plus graph CSS.
  - *Graph embedded as the landing hero with a `<noscript>` fallback section list* — Task: `templates.mjs` extended (`renderLanding` overridden to embed the SVG + fallback).
- **"Unit tests pass under `task test:all`."** — Partly owned here: Plan 1 creates the `test:docs-gen` task and wires it into `test:all`; Plan 2's graph module test files (`graph-data.test.mjs`, `graph-layout.test.mjs`, `graph-svg.test.mjs`) are picked up by the existing `node --test scripts/docs-gen/*.test.mjs` glob, so the new determinism test runs in CI without further Taskfile changes.

**Owned by Plan 1 (not this plan):** all non-graph criteria — the four-source-type build with provenance badges; editorial skill/agent/doc reading pages with working cross-links, search, copy buttons, and mermaid + Graphviz rendering (with graceful fallback); full `description: >` block-scalar rendering; `task docs:deploy` shipping the output unchanged; removal of `scripts/build-docs.js` and repointing `npm run build:docs` / `task docs:deploy` to the new entry; and the build report itself. Plan 2 only **overrides** `renderLanding` and **extends** `clientJs()`/`theme.mjs`; it relies on Plan 1's registry, edges (`collectEdges`), routing-table parse (`parseRoutingTable`), domain assignment, and entry orchestration being in place first.

## Notes / Out of scope

- **No live force-directed physics.** The graph is laid out **once, at build time**, by the deterministic `layoutGraph` (spec Decision 6, Out-of-scope line 121). There is no runtime simulation, no animation loop, and no client-side layout — the client JS only does hover-highlight, click-nav, and zoom/pan transforms over a static, pre-positioned SVG. Do not introduce `Math.random()`, `Date.now()`, or any iterative settling step into `graph-layout.mjs`.
- **Node scope: skills + agents + docs only.** The graph covers `type` `skill`, `agent`, and `doc` nodes. `docs/superpowers/specs/` and `docs/superpowers/plans/` are excluded upstream by Plan 1's discovery filter (internal process artifacts), so no spec/plan nodes ever reach `buildGraph`.
- **Conservative edges only.** Graph edges come from the same conservative set as the rest of the generator: explicit `[[name]]` wikilinks, real relative markdown links between sources (both via Plan 1's `collectEdges`), plus the routing-table domain clustering (signals → agent regions, via `parseRoutingTable`). There is **no** prose-mention auto-linking — a slug appearing as plain text in another page's body does not create an edge.
- **Deterministic ordering is load-bearing.** `buildGraph`, `layoutGraph`, and `renderGraphSvg` must each sort their inputs internally (by slug, then domain) so output is independent of the order sources were discovered in. This is what makes the twice-build diff identical and keeps the SVG diff-reviewable in PRs.
- **Landing override, not duplication.** Plan 2's `renderLanding` replaces Plan 1's editorial card-grid landing for `index.html`; the card-grid section indexes (`skills.html`, `agents.html`, `docs.html`) from Plan 1 are unchanged and serve as the `<noscript>` fallback targets.
