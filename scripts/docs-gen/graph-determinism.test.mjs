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
