<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as d3 from 'd3';
  import type { GraphNode, GraphEdge, NodeStatus } from '../../../lib/graph-utils';
  import GraphNodeComponent from './GraphNode.svelte';
  import GraphLegend from './GraphLegend.svelte';

  interface SimNode extends GraphNode {
    x: number;
    y: number;
    fx?: number | null;
    fy?: number | null;
  }

  interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
    from: string;
    to: string;
    via?: string;
    kind?: string;
    source?: SimNode | string;
    target?: SimNode | string;
  }

  interface Props {
    nodes: GraphNode[];
    edges: GraphEdge[];
    statusMap: Map<string, NodeStatus>;
    selectedNodeId: string | null;
    onNodeClick: (node: GraphNode) => void;
  }

  let { nodes, edges, statusMap, selectedNodeId, onNodeClick }: Props = $props();

  let svgEl: SVGSVGElement;
  let simNodes: SimNode[] = $state([]);
  let simEdges: SimEdge[] = $state([]);
  let simulation: d3.Simulation<SimNode, SimEdge> | null = null;
  let zoomTransform: d3.ZoomTransform = $state(d3.zoomIdentity);
  let nsRects: { ns: string; x: number; y: number; w: number; h: number }[] = $state([]);

  const NS_COLORS: Record<string, string> = {
    workspace: 'rgba(99,102,241,0.08)',
    'workspace-korczewski': 'rgba(168,85,247,0.08)',
    website: 'rgba(34,197,94,0.08)',
    'website-korczewski': 'rgba(236,72,153,0.08)',
    monitoring: 'rgba(234,179,8,0.08)',
    'workspace-dev': 'rgba(14,165,233,0.08)',
    default: 'rgba(100,116,139,0.06)',
  };

  function nsColor(ns: string): string {
    return NS_COLORS[ns] ?? NS_COLORS.default;
  }

  function computeNamespaceRects(nodes: SimNode[]) {
    const groups = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
    for (const n of nodes) {
      if (n.x == null || n.y == null) continue;
      const g = groups.get(n.namespace) ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      g.minX = Math.min(g.minX, n.x);
      g.minY = Math.min(g.minY, n.y);
      g.maxX = Math.max(g.maxX, n.x);
      g.maxY = Math.max(g.maxY, n.y);
      groups.set(n.namespace, g);
    }
    const pad = 50;
    return [...groups.entries()].map(([ns, g]) => ({
      ns,
      x: g.minX - pad,
      y: g.minY - pad,
      w: g.maxX - g.minX + pad * 2,
      h: g.maxY - g.minY + pad * 2,
    }));
  }

  onMount(() => {
    const rng = d3.randomLcg(42);
    const seeded = d3.randomUniform.source(rng)(-200, 200);

    simNodes = nodes.map(n => ({
      ...n,
      x: seeded(),
      y: seeded(),
    }));

    const nodeById = new Map(simNodes.map(n => [n.id, n]));
    simEdges = edges
      .filter(e => nodeById.has(e.from) && nodeById.has(e.to))
      .map(e => ({
        ...e,
        source: nodeById.get(e.from)!,
        target: nodeById.get(e.to)!,
      }));

    const nsGroups = new Map<string, SimNode[]>();
    for (const n of simNodes) {
      const arr = nsGroups.get(n.namespace) ?? [];
      arr.push(n);
      nsGroups.set(n.namespace, arr);
    }

    const nsCenters = new Map<string, { x: number; y: number }>();
    let idx = 0;
    const nsKeys = [...nsGroups.keys()];
    const cols = Math.ceil(Math.sqrt(nsKeys.length));
    for (const ns of nsKeys) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      nsCenters.set(ns, { x: col * 350 - (cols * 350) / 2, y: row * 350 - (Math.ceil(nsKeys.length / cols) * 350) / 2 });
      idx++;
    }

    simulation = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimEdge>(simEdges).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('collide', d3.forceCollide(35))
      .force('ns', (alpha: number) => {
        for (const n of simNodes) {
          const c = nsCenters.get(n.namespace);
          if (!c) continue;
          n.vx = (n.vx ?? 0) + (c.x - n.x) * alpha * 0.1;
          n.vy = (n.vy ?? 0) + (c.y - n.y) * alpha * 0.1;
        }
      })
      .alphaDecay(0.02)
      .on('tick', () => {
        simNodes = [...simNodes];
        nsRects = computeNamespaceRects(simNodes);
      });

    const svg = d3.select(svgEl);
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        zoomTransform = event.transform;
      });
    svg.call(zoom);
  });

  onDestroy(() => {
    simulation?.stop();
  });

  function edgeSource(e: SimEdge): { x: number; y: number } {
    const s = e.source as SimNode;
    return { x: s.x ?? 0, y: s.y ?? 0 };
  }

  function edgeTarget(e: SimEdge): { x: number; y: number } {
    const t = e.target as SimNode;
    return { x: t.x ?? 0, y: t.y ?? 0 };
  }
</script>

<div class="canvas-root">
  <svg bind:this={svgEl} class="graph-svg">
    <defs>
      <marker id="arrowhead" viewBox="0 0 10 7" refX="28" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
        <polygon points="0 0, 10 3.5, 0 7" fill="#475569" />
      </marker>
    </defs>
    <g transform="translate({zoomTransform.x},{zoomTransform.y}) scale({zoomTransform.k})">
      {#each nsRects as rect}
        <rect
          x={rect.x} y={rect.y} width={rect.w} height={rect.h}
          fill={nsColor(rect.ns)}
          stroke="#334155"
          stroke-width="1"
          stroke-dasharray="6,4"
          rx="12"
        />
        <text x={rect.x + 8} y={rect.y + 16} fill="#64748b" font-size="11" font-family="ui-monospace, monospace">{rect.ns}</text>
      {/each}

      {#each simEdges as edge}
        <line
          x1={edgeSource(edge).x} y1={edgeSource(edge).y}
          x2={edgeTarget(edge).x} y2={edgeTarget(edge).y}
          stroke="#475569"
          stroke-width="1"
          stroke-opacity="0.5"
          marker-end="url(#arrowhead)"
        />
      {/each}

      {#each simNodes as node (node.id)}
        <GraphNodeComponent
          node={node}
          status={statusMap.get(node.id) ?? null}
          selected={selectedNodeId === node.id}
          onclick={onNodeClick}
        />
      {/each}
    </g>
  </svg>

  <GraphLegend />
</div>

<style>
  .canvas-root {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .graph-svg {
    width: 100%;
    height: 100%;
    background: #0f172a;
    display: block;
  }
</style>
