<script lang="ts">
  import type { GraphNode, PodEntry } from '../../../pages/api/admin/cluster/graph';

  interface Warning {
    namespace: string;
    reason: string;
    object: string;
    message: string;
    ts: string;
    count: number;
  }

  interface Props {
    node: GraphNode | null;
    podData: PodEntry[];
    warnings: Warning[];
    onClose: () => void;
  }

  let { node, podData, warnings, onClose }: Props = $props();

  const relevantWarnings = $derived(
    node
      ? warnings
          .filter(w => {
            const haystack = `${w.object} ${w.message}`.toLowerCase();
            return haystack.includes(node.name.toLowerCase()) ||
              podData.some(p => haystack.includes(p.name.toLowerCase()));
          })
          .slice(0, 5)
      : []
  );

  const firstPod = $derived(podData.length > 0 ? podData[0].name : '');
  const logsUrl = $derived(
    node && firstPod
      ? `/admin/platform?tab=logs&pod=${encodeURIComponent(firstPod)}&ns=${encodeURIComponent(node.namespace)}`
      : null
  );

  function phaseColor(phase: string): string {
    switch (phase) {
      case 'Running': return '#22c55e';
      case 'Pending': return '#eab308';
      case 'CrashLoopBackOff':
      case 'Error':
      case 'Failed': return '#ef4444';
      default: return '#6b7280';
    }
  }
</script>

{#if node}
  <div class="panel">
    <div class="panel-header">
      <h3 class="panel-title">{node.name}</h3>
      <button class="close-btn" on:click={onClose} aria-label="Schließen">&times;</button>
    </div>

    <div class="panel-meta">
      <span class="meta-badge">{node.type}</span>
      <span class="meta-ns">{node.namespace}</span>
    </div>

    <section class="panel-section">
      <h4>Pods ({podData.length})</h4>
      {#if podData.length === 0}
        <p class="empty-text">Keine Pods gefunden</p>
      {:else}
        <ul class="pod-list">
          {#each podData as pod}
            <li class="pod-item">
              <span class="pod-dot" style="background:{phaseColor(pod.phase)}"></span>
              <div class="pod-info">
                <span class="pod-name">{pod.name}</span>
                <span class="pod-detail">{pod.phase} &middot; {pod.ready ? 'ready' : 'not ready'} &middot; {pod.restarts} restarts</span>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel-section">
      <h4>Warnungen</h4>
      {#if relevantWarnings.length === 0}
        <p class="empty-text">Keine aktuellen Warnungen</p>
      {:else}
        <ul class="warning-list">
          {#each relevantWarnings as w}
            <li class="warning-item">
              <span class="warning-reason">{w.reason}</span>
              <span class="warning-msg">{w.message}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <div class="panel-actions">
      {#if logsUrl}
        <a href={logsUrl} class="logs-btn">Logs anzeigen</a>
      {:else}
        <button class="logs-btn disabled" disabled>Kein Pod verfügbar</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .panel {
    width: 320px;
    height: 100%;
    background: #0f172a;
    border-left: 1px solid #1e293b;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    flex-shrink: 0;
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid #1e293b;
  }
  .panel-title {
    font-size: 14px;
    font-weight: 700;
    color: #e2e8f0;
    font-family: ui-monospace, monospace;
    margin: 0;
    word-break: break-all;
  }
  .close-btn {
    background: none;
    border: none;
    color: #64748b;
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .close-btn:hover { color: #e2e8f0; }
  .panel-meta {
    display: flex;
    gap: 8px;
    padding: 8px 16px;
    align-items: center;
  }
  .meta-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(99,102,241,0.15);
    color: #818cf8;
    letter-spacing: 0.05em;
  }
  .meta-ns {
    font-size: 11px;
    color: #64748b;
    font-family: ui-monospace, monospace;
  }
  .panel-section {
    padding: 12px 16px;
    border-top: 1px solid #1e293b;
  }
  .panel-section h4 {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #64748b;
    margin: 0 0 8px 0;
    font-weight: 700;
  }
  .empty-text {
    font-size: 12px;
    color: #475569;
    margin: 0;
  }
  .pod-list, .warning-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .pod-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid #1e293b;
  }
  .pod-item:last-child { border-bottom: none; }
  .pod-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 4px;
    flex-shrink: 0;
  }
  .pod-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .pod-name {
    font-size: 11px;
    color: #e2e8f0;
    font-family: ui-monospace, monospace;
    word-break: break-all;
  }
  .pod-detail { font-size: 10px; color: #64748b; }
  .warning-item {
    padding: 6px 0;
    border-bottom: 1px solid #1e293b;
  }
  .warning-item:last-child { border-bottom: none; }
  .warning-reason {
    font-size: 10px;
    font-weight: 700;
    color: #eab308;
    text-transform: uppercase;
    display: block;
    margin-bottom: 2px;
  }
  .warning-msg { font-size: 11px; color: #94a3b8; word-break: break-word; }
  .panel-actions {
    padding: 12px 16px;
    margin-top: auto;
    border-top: 1px solid #1e293b;
  }
  .logs-btn {
    display: block;
    text-align: center;
    padding: 8px 16px;
    border-radius: 6px;
    background: #6366f1;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    text-decoration: none;
    border: none;
    cursor: pointer;
  }
  .logs-btn:hover { background: #4f46e5; }
  .logs-btn.disabled {
    background: #1e293b;
    color: #475569;
    cursor: not-allowed;
  }
</style>
