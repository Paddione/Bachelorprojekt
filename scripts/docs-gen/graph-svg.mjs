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

  // Accessible name + description. <title>/<desc> are the first children of the
  // <svg> (the SVG-AAM contract) and are wired up via aria-labelledby, in addition
  // to the pre-existing aria-label, so screen readers announce a meaningful name
  // and a short explanation of what the regions/edges/nodes mean.
  const titleText = 'Dokumentations-Beziehungsgraph';
  const descText =
    'Eine nach Domänen geclusterte Karte der Dokumentation. Die getönten Regionen ' +
    'gruppieren zusammengehörige Bereiche, die Knoten stehen für Skills, Agents und ' +
    'Docs, und die Kanten zeigen, welche Seiten aufeinander verweisen.';

  return (
    `<svg class="graph-svg" xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="0 0 ${width} ${height}" role="img" ` +
    `aria-label="Documentation relationship graph" ` +
    `aria-labelledby="graph-svg-title graph-svg-desc">` +
    `<title id="graph-svg-title">${esc(titleText)}</title>` +
    `<desc id="graph-svg-desc">${esc(descText)}</desc>` +
    `<g class="graph-regions">${regions}</g>` +
    `<g class="graph-edges">${edges}</g>` +
    `<g class="graph-nodes">${nodes}</g>` +
    legend +
    `</svg>`
  );
}

export default { renderGraphSvg };
