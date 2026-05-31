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

test('renderGraphSvg: root carries the canonical graph-svg class', () => {
  const svg = renderGraphSvg(fixtureLayout());
  assert.ok(svg.includes('class="graph-svg"'), 'svg root uses the canonical graph-svg class (IC-1)');
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
