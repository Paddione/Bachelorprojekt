<script lang="ts">
  import { onMount } from 'svelte';
  import type { HardwareAsset } from '../../../lib/platform-db';
  import ClusterTopologyRig from './ClusterTopologyRig.svelte';
  import GpuSensorDeck from './GpuSensorDeck.svelte';

  export let cluster: string;

  type EnrichedHardwareAsset = HardwareAsset & { live_status: string; ready_status: string };

  let assets: EnrichedHardwareAsset[] = [];
  let loading = true;
  let error: string | null = null;

  async function loadAssets() {
    loading = true;
    try {
      const res = await fetch('/sdlc/api/platform/hardware');
      if (!res.ok) throw new Error('Failed to fetch hardware');
      const data = await res.json();
      assets = data.assets;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to fetch hardware';
    } finally {
      loading = false;
    }
  }

  onMount(loadAssets);
</script>

<div class="hardware-container">
  <!-- 1. Primary Isometric Dual-Bay Cluster Rig -->
  <div class="flex justify-center w-full">
    <ClusterTopologyRig />
  </div>

  <!-- 2. Bare-Metal GPU & Model Sensor Deck -->
  <div class="w-full">
    <GpuSensorDeck />
  </div>

  <!-- 3. Bare-Metal Hardware Inventory Manifest -->
  <div class="inventory-card">
    <div class="inventory-header">
      <div class="inventory-title-group">
        <span class="screw-dot"></span>
        <span class="inventory-tag">REGISTER 04 // BARE-METAL NODE LEDGER</span>
      </div>
      <span class="inventory-sub">12 ACTIVE BARE-METAL & EDGE KNOTEN · TAILNET 100.64.0.0/10</span>
    </div>

    {#if loading}
      <div class="inventory-skeleton">
        {#each Array(4) as _}
          <div class="skeleton-row"></div>
        {/each}
      </div>
    {:else if error}
      <div class="inventory-error">
        <span>{error}</span>
      </div>
    {:else}
      <div class="inventory-table-wrapper">
        <table class="inventory-table">
          <thead>
            <tr>
              <th>STATUS</th>
              <th>NODE IDENTIFIER</th>
              <th>CLUSTER ROLLE</th>
              <th>STANDORT / BUCHT</th>
              <th>TAILNET IP & OS</th>
              <th>K8S NODE NAME</th>
            </tr>
          </thead>
          <tbody>
            {#each assets as asset}
              <tr class="node-row">
                <td>
                  <div class="status-cell">
                    <span class="node-led {asset.live_status === 'ready' ? 'led-ok' : 'led-err'}"></span>
                    <span class="status-text {asset.live_status === 'ready' ? 'text-ok' : 'text-err'}">
                      {asset.ready_status}
                    </span>
                  </div>
                </td>
                <td class="node-name">{asset.name}</td>
                <td>
                  <span class="role-badge">{asset.role}</span>
                </td>
                <td class="location-text">{asset.location || 'Bay 1 (Devmesh Core)'}</td>
                <td>
                  <div class="ip-block">
                    <span class="ip-code">{asset.ip || '—'}</span>
                    <span class="os-label">{asset.os || 'Linux (k3s)'}</span>
                  </div>
                </td>
                <td>
                  <code class="k8s-badge">
                    {asset.k8s_node_name}
                  </code>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<style>
  .hardware-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    color: #E6EDF3;
  }

  .inventory-card {
    background: #0E131B;
    border: 1px solid #1E2634;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .inventory-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #1E2634;
    padding-bottom: 14px;
  }

  .inventory-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .screw-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #475569;
    border: 1px solid #64748B;
  }

  .inventory-tag {
    font-size: 11px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.08em;
  }

  .inventory-sub {
    font-size: 9.5px;
    color: #8B949E;
  }

  .inventory-table-wrapper {
    overflow-x: auto;
  }

  .inventory-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    text-align: left;
  }

  .inventory-table th {
    background: #111722;
    color: #8B949E;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 10px 14px;
    border-bottom: 1px solid #1E2634;
  }

  .inventory-table td {
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    vertical-align: middle;
  }

  .node-row:hover {
    background: rgba(88, 166, 255, 0.04);
  }

  .status-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .node-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .led-ok { background: #3FB950; box-shadow: 0 0 6px #3FB950; }
  .led-err { background: #F85149; box-shadow: 0 0 6px #F85149; }

  .status-text {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .text-ok { color: #3FB950; }
  .text-err { color: #F85149; }

  .node-name {
    font-weight: 700;
    color: #F0F6FC;
  }

  .role-badge {
    background: #151D2A;
    border: 1px solid #243044;
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 9.5px;
    color: #93C5FD;
  }

  .location-text {
    color: #8B949E;
  }

  .ip-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ip-code {
    font-family: monospace;
    color: #58A6FF;
    font-size: 10.5px;
  }

  .os-label {
    font-size: 9px;
    color: #8B949E;
  }

  .k8s-badge {
    background: #111722;
    border: 1px solid #243044;
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 9.5px;
    color: #38BDF8;
  }

  .inventory-skeleton {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-row {
    height: 40px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
  }

  .inventory-error {
    font-size: 11px;
    color: #F85149;
    padding: 12px;
    text-align: center;
  }
</style>
