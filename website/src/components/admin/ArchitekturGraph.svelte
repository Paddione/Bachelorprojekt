<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { GraphNode, GraphEdge, PodEntry, NodeStatus } from '../../lib/graph-utils';
  import { buildStatusMap } from '../../lib/graph-utils';
  import GraphCanvas from './graph/GraphCanvas.svelte';
  import NodeDetailPanel from './graph/NodeDetailPanel.svelte';

  interface Warning {
    namespace: string;
    reason: string;
    object: string;
    message: string;
    ts: string;
    count: number;
  }

  interface Props {
    cluster: string;
  }

  let { cluster }: Props = $props();

  let graphNodes: GraphNode[] = $state([]);
  let graphEdges: GraphEdge[] = $state([]);
  let resolvedNamespaces: string[] = $state([]);
  let statusMap: Map<string, NodeStatus> = $state(new Map());
  let warnings: Warning[] = $state([]);
  let selectedNode: GraphNode | null = $state(null);
  let graphLoaded = $state(false);
  let errorGraph = $state('');
  let errorPods = $state('');
  let lastUpdated = $state<Date | null>(null);
  let unassignedCount = $state(0);

  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const selectedPodData = $derived(
    selectedNode ? (statusMap.get(selectedNode.id)?.pods ?? []) : []
  );

  async function fetchGraph() {
    try {
      const res = await fetch('/api/admin/cluster/graph');
      if (!res.ok) {
        errorGraph = `Graph API: ${res.status}`;
        return;
      }
      const data = await res.json();
      graphNodes = data.nodes;
      graphEdges = data.edges;
      resolvedNamespaces = data.resolvedNamespaces ?? [];
      graphLoaded = true;
    } catch (e) {
      errorGraph = e instanceof Error ? e.message : 'Graph-Ladefehler';
    }
  }

  async function fetchPodStatus() {
    try {
      const results = await Promise.allSettled(
        resolvedNamespaces.map(ns =>
          fetch(`/api/admin/cluster/pods-list?ns=${encodeURIComponent(ns)}&context=${encodeURIComponent(cluster)}`)
            .then(r => r.ok ? r.json() as Promise<{ pods: PodEntry[]; namespace: string }> : Promise.reject(new String(r.status)))
        )
      );
      const newMap = new Map<string, PodEntry[]>();
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.pods) {
          newMap.set(r.value.namespace, r.value.pods);
        }
      }
      statusMap = buildStatusMap(graphNodes, newMap);
      unassignedCount = [...statusMap.values()].filter(s => !s.matched && s.color !== '#6b7280').length;
      lastUpdated = new Date();
      errorPods = '';
    } catch (e) {
      errorPods = e instanceof Error ? e.message : 'Pod-Status-Fehler';
    }
  }

  async function fetchWarnings() {
    try {
      const res = await fetch('/api/admin/cluster/warnings');
      if (res.ok) {
        const data = await res.json();
        warnings = data.warnings ?? [];
      }
    } catch { /* warnings are non-critical */ }
  }

  function handleNodeClick(node: GraphNode) {
    selectedNode = selectedNode?.id === node.id ? null : node;
  }

  function handleClose() {
    selectedNode = null;
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    } else {
      if (!pollInterval) {
        pollInterval = setInterval(fetchPodStatus, 10_000);
        fetchPodStatus();
      }
    }
  }

  onMount(async () => {
    await fetchGraph();
    if (graphLoaded) {
      await fetchPodStatus();
      fetchWarnings();
      pollInterval = setInterval(fetchPodStatus, 10_000);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });
</script>

<div class="arch-root">
  {#if !graphLoaded && !errorGraph}
    <div class="loading">
      <div class="spinner"></div>
      <p>Architektur-Graph wird geladen…</p>
    </div>
  {:else if errorGraph}
    <div class="error-box">
      <p>Fehler: {errorGraph}</p>
    </div>
  {:else}
    <div class="arch-layout">
      <div class="canvas-area">
        <GraphCanvas
          nodes={graphNodes}
          edges={graphEdges}
          {statusMap}
          selectedNodeId={selectedNode?.id ?? null}
          onNodeClick={handleNodeClick}
        />
        <div class="status-bar">
          {#if errorPods}
            <span class="status-error">{errorPods}</span>
          {:else if lastUpdated}
            <span class="status-ok">Letztes Update: {lastUpdated.toLocaleTimeString('de-DE')}</span>
          {/if}
          {#if unassignedCount > 0}
            <span class="status-warn">{unassignedCount} unzugeordnete Pods</span>
          {/if}
        </div>
      </div>
      <NodeDetailPanel
        node={selectedNode}
        podData={selectedPodData}
        {warnings}
        onClose={handleClose}
      />
    </div>
  {/if}
</div>

<style>
  .arch-root {
    height: calc(100vh - 4rem);
    width: 100%;
    display: flex;
    flex-direction: column;
    background: #0f172a;
  }
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
    color: #64748b;
    font-size: 14px;
  }
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #1e293b;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error-box {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #ef4444;
    font-size: 14px;
  }
  .arch-layout {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .canvas-area {
    flex: 1;
    position: relative;
    min-width: 0;
  }
  .status-bar {
    position: absolute;
    top: 8px;
    right: 12px;
    display: flex;
    gap: 12px;
    font-size: 11px;
    font-family: ui-monospace, monospace;
  }
  .status-ok { color: #22c55e; }
  .status-error { color: #ef4444; }
  .status-warn { color: #eab308; }
</style>
