<script lang="ts">
  import { onMount } from 'svelte';
  import { floorStore, acquireFloor } from '../lib/stores/factory-floor-store';

  interface GraphNode {
    id: string;
    title: string;
    status: string;
    priority: string;
    depth: number;
  }
  interface GraphEdge {
    from: string;
    to: string;
    type: string;
  }
  interface TicketGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    criticalPath: string[];
  }

  interface LayoutNode extends GraphNode {
    x: number;
    y: number;
    layer: number;
  }

  const NODE_W = 160;
  const NODE_H = 56;
  const LAYER_GAP_X = 200;
  const NODE_GAP_Y = 72;
  const PAD = 40;

  let graphData: TicketGraph | null = $state(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let svgEl: SVGSVGElement | undefined = $state(undefined);
  let viewBox = $state({ x: 0, y: 0, w: 800, h: 600 });
  let isPanning = $state(false);
  let panStart = { x: 0, y: 0 };
  let hoveredNode: string | null = $state(null);

  async function fetchGraph() {
    try {
      const r = await fetch('/api/tickets/graph');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      graphData = await r.json();
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  function layoutNodes(data: TicketGraph): LayoutNode[] {
    const adj = new Map<string, string[]>();
    const inDeg = new Map<string, number>();
    const nodeMap = new Map<string, GraphNode>();

    for (const n of data.nodes) {
      nodeMap.set(n.id, n);
      adj.set(n.id, []);
      inDeg.set(n.id, 0);
    }

    for (const e of data.edges) {
      if (!nodeMap.has(e.from) || !nodeMap.has(e.to)) continue;
      adj.get(e.to)?.push(e.from);
      inDeg.set(e.from, (inDeg.get(e.from) ?? 0) + 1);
    }

    const layers = new Map<string, number>();
    const queue: string[] = [];
    for (const [id, deg] of inDeg) {
      if (deg === 0) {
        queue.push(id);
        layers.set(id, 0);
      }
    }

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const curLayer = layers.get(cur) ?? 0;
      for (const next of adj.get(cur) ?? []) {
        const nextLayer = Math.max(layers.get(next) ?? 0, curLayer + 1);
        layers.set(next, nextLayer);
        inDeg.set(next, (inDeg.get(next) ?? 1) - 1);
        if (inDeg.get(next) === 0) queue.push(next);
      }
    }

    for (const n of data.nodes) {
      if (!layers.has(n.id)) layers.set(n.id, 0);
    }

    const layerBuckets = new Map<number, string[]>();
    for (const [id, layer] of layers) {
      if (!layerBuckets.has(layer)) layerBuckets.set(layer, []);
      layerBuckets.get(layer)!.push(id);
    }

    const result: LayoutNode[] = [];
    for (const [layer, ids] of layerBuckets) {
      ids.forEach((id, idx) => {
        const n = nodeMap.get(id)!;
        result.push({
          ...n,
          x: PAD + layer * LAYER_GAP_X,
          y: PAD + idx * NODE_GAP_Y,
          layer,
        });
      });
    }

    return result;
  }

  function nodeColor(status: string): string {
    switch (status) {
      case 'done': return 'var(--admin-success, #22c55e)';
      case 'in_progress': case 'in_review': return 'var(--admin-accent, #f59e0b)';
      case 'blocked': return 'var(--admin-error, #ef4444)';
      default: return 'var(--admin-text-muted, #737373)';
    }
  }

  function nodeFill(status: string): string {
    switch (status) {
      case 'done': return 'rgba(34, 197, 94, 0.15)';
      case 'in_progress': case 'in_review': return 'rgba(245, 158, 11, 0.15)';
      case 'blocked': return 'rgba(239, 68, 68, 0.15)';
      default: return 'var(--admin-surface, #161b22)';
    }
  }

  function isCriticalEdge(from: string, to: string): boolean {
    if (!graphData?.criticalPath) return false;
    const cp = graphData.criticalPath;
    for (let i = 0; i < cp.length - 1; i++) {
      if ((cp[i] === from && cp[i + 1] === to) || (cp[i] === to && cp[i + 1] === from)) return true;
    }
    return false;
  }

  function priorityColor(priority: string): string {
    switch (priority) {
      case 'hoch': return 'var(--admin-priority-high, #f97316)';
      case 'mittel': return 'var(--admin-priority-medium, #eab308)';
      default: return 'var(--admin-priority-low, #6b7280)';
    }
  }

  function onPointerDown(e: PointerEvent) {
    if ((e.target as Element).closest('.dag-node')) return;
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!isPanning) return;
    const dx = (e.clientX - panStart.x) * (viewBox.w / 800);
    const dy = (e.clientY - panStart.y) * (viewBox.h / 600);
    viewBox = { ...viewBox, x: viewBox.x - dx, y: viewBox.y - dy };
    panStart = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp() {
    isPanning = false;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const newW = viewBox.w * factor;
    const newH = viewBox.h * factor;
    viewBox = {
      x: viewBox.x + (viewBox.w - newW) / 2,
      y: viewBox.y + (viewBox.h - newH) / 2,
      w: newW,
      h: newH,
    };
  }

  onMount(() => {
    void fetchGraph();
    const release = acquireFloor();
    let seen: string | null = null;
    const unsub = floorStore.subscribe((s) => {
      const at = s.payload?.fetchedAt ?? null;
      if (at && at !== seen) { seen = at; void fetchGraph(); }
    });
    return () => { unsub(); release(); };
  });

  const layout = $derived(graphData ? layoutNodes(graphData) : []);
  const nodePos = $derived(new Map(layout.map(n => [n.id, n])));
</script>

<div class="dag-container">
  {#if loading && !graphData}
    <div class="dag-loading">Graph wird geladen...</div>
  {:else if error}
    <div class="dag-error">Fehler: {error}</div>
  {:else if !graphData || graphData.nodes.length === 0}
    <div class="dag-empty">Keine Abhängigkeiten vorhanden</div>
  {:else}
    <div class="dag-legend">
      <span class="legend-chip done">Done</span>
      <span class="legend-chip active">Aktiv</span>
      <span class="legend-chip blocked">Blockiert</span>
      <span class="legend-chip planned">Geplant</span>
      <span class="legend-chip critical">Kritischer Pfad</span>
    </div>
    <svg
      bind:this={svgEl}
      class="dag-svg"
      viewBox="{viewBox.x} {viewBox.y} {viewBox.w} {viewBox.h}"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onwheel={onWheel}
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--admin-border, #30363d)" />
        </marker>
        <marker id="arrow-critical" viewBox="0 0 10 10" refX="10" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--admin-accent, #f59e0b)" />
        </marker>
      </defs>

      {#each graphData.edges as edge}
        {@const fromN = nodePos.get(edge.to)}
        {@const toN = nodePos.get(edge.from)}
        {#if fromN && toN}
          {@const critical = isCriticalEdge(edge.from, edge.to)}
          <line
            x1={fromN.x + NODE_W}
            y1={fromN.y + NODE_H / 2}
            x2={toN.x}
            y2={toN.y + NODE_H / 2}
            stroke={critical ? 'var(--admin-accent, #f59e0b)' : 'var(--admin-border, #30363d)'}
            stroke-width={critical ? 2 : 1}
            marker-end={critical ? 'url(#arrow-critical)' : 'url(#arrow)'}
            class:critical-edge={critical}
          />
        {/if}
      {/each}

      {#each layout as node}
        <g
          class="dag-node"
          transform="translate({node.x}, {node.y})"
          onpointerenter={() => hoveredNode = node.id}
          onpointerleave={() => hoveredNode = null}
        >
          <rect
            width={NODE_W}
            height={NODE_H}
            rx={4}
            fill={nodeFill(node.status)}
            stroke={nodeColor(node.status)}
            stroke-width={hoveredNode === node.id ? 2 : 1}
          />
          <rect
            width={4}
            height={NODE_H}
            rx={2}
            fill={priorityColor(node.priority)}
          />
          <text
            x={12}
            y={20}
            font-family="var(--admin-font-mono, monospace)"
            font-size="11"
            font-weight="bold"
            fill="var(--admin-text-primary, #e5e5e5)"
          >{node.id}</text>
          <text
            x={12}
            y={38}
            font-family="var(--admin-font-mono, monospace)"
            font-size="10"
            fill="var(--admin-text-secondary, #a3a3a3)"
          >{node.title.length > 18 ? node.title.slice(0, 18) + '...' : node.title}</text>
          <text
            x={12}
            y={50}
            font-family="var(--admin-font-mono, monospace)"
            font-size="9"
            fill={nodeColor(node.status)}
          >{node.status}</text>

          {#if node.status === 'blocked'}
            <rect
              width={NODE_W}
              height={NODE_H}
              rx={4}
              fill="none"
              stroke="var(--admin-error, #ef4444)"
              stroke-width={1}
              class="pilot-light-pulse"
            />
          {/if}
        </g>
      {/each}
    </svg>
  {/if}
</div>

<style>
  .dag-container {
    background: var(--admin-bg, #0d1117);
    border: 1px solid var(--admin-border, #30363d);
    border-radius: var(--admin-radius-md, 0.375rem);
    overflow: hidden;
    position: relative;
    min-height: 400px;
  }

  .dag-svg {
    width: 100%;
    height: 500px;
    cursor: grab;
    touch-action: none;
  }

  .dag-svg:active {
    cursor: grabbing;
  }

  .dag-node {
    cursor: pointer;
  }

  .dag-loading, .dag-error, .dag-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    font-family: var(--admin-font-mono, monospace);
    font-size: var(--admin-text-sm, 0.875rem);
    color: var(--admin-text-muted, #737373);
  }

  .dag-error {
    color: var(--admin-error, #ef4444);
  }

  .dag-legend {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--admin-border, #30363d);
    flex-wrap: wrap;
  }

  .legend-chip {
    font-family: var(--admin-font-mono, monospace);
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 10px;
    border: 1px solid;
  }

  .legend-chip.done {
    color: var(--admin-success, #22c55e);
    border-color: var(--admin-success, #22c55e);
    background: rgba(34, 197, 94, 0.1);
  }

  .legend-chip.active {
    color: var(--admin-accent, #f59e0b);
    border-color: var(--admin-accent, #f59e0b);
    background: rgba(245, 158, 11, 0.1);
  }

  .legend-chip.blocked {
    color: var(--admin-error, #ef4444);
    border-color: var(--admin-error, #ef4444);
    background: rgba(239, 68, 68, 0.1);
  }

  .legend-chip.planned {
    color: var(--admin-text-muted, #737373);
    border-color: var(--admin-text-muted, #737373);
    background: rgba(115, 115, 115, 0.1);
  }

  .legend-chip.critical {
    color: var(--admin-accent, #f59e0b);
    border-color: var(--admin-accent, #f59e0b);
    background: rgba(245, 158, 11, 0.1);
    border-style: dashed;
  }

  .critical-edge {
    stroke-dasharray: none;
  }

  @keyframes pilot-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .pilot-light-pulse {
    animation: pilot-pulse 1.5s ease-in-out infinite;
  }
</style>
