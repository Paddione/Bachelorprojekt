<script lang="ts">
  import { onMount } from 'svelte';

  export let cluster: string;

  interface ServiceCheck {
    name: string;
    slug: string;
    url: string;
    status: 'ok' | 'slow' | 'error' | 'optional';
    latencyMs: number | null;
    optional: boolean;
    error?: string;
  }

  interface HealthData {
    results: Record<string, ServiceCheck[]>;
    checkedAt: string;
  }

  let data: HealthData | null = null;
  let loading = true;
  let error: string | null = null;
  let isRefreshing = false;

  async function fetchHealth() {
    isRefreshing = true;
    try {
      const r = await fetch('/sdlc/api/ops/health');
      if (!r.ok) throw new Error('Health fetch failed');
      data = await r.json();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Health fetch failed';
    } finally {
      loading = false;
      isRefreshing = false;
    }
  }

  onMount(fetchHealth);
</script>

<div class="relay-panel">
  <!-- Mechatronic Instrument Header -->
  <div class="panel-header">
    <div class="header-left">
      <div class="panel-title-row">
        <span class="panel-tag">PANEL 02 // INTELLIGENCE & HEALTH</span>
        <span class="panel-title">System-Integrität & Service-Relais</span>
      </div>
      <span class="panel-sub">DEVMESH CORE · CARRIER-GRADE RELAIS-ARRAY · 24/7 DEDICATED PROBES</span>
    </div>

    <div class="header-controls">
      {#if data}
        <div class="probe-timestamp">
          <span class="probe-dot"></span>
          <span>CYCLE: {new Date(data.checkedAt).toLocaleTimeString()}</span>
        </div>
      {/if}
      <button 
        on:click={fetchHealth} 
        disabled={isRefreshing}
        class="actuator-btn"
        class:actuator-spinning={isRefreshing}
        title="Trigger Immediate Health Sweep"
      >
        <span class="actuator-pin"></span>
        <span>{isRefreshing ? 'SWEEPING...' : 'MANUAL SWEEP'}</span>
      </button>
    </div>
  </div>

  {#if loading}
    <div class="panel-skeleton">
      <div class="skeleton-slot"></div>
      <div class="skeleton-slot"></div>
      <div class="skeleton-slot"></div>
    </div>
  {:else if error}
    <div class="panel-fault">
      <div class="fault-badge">FAULT DETECTED</div>
      <div class="fault-message">{error}</div>
    </div>
  {:else if data}
    {#each Object.entries(data.results) as [cName, results]}
      <div class="relay-bank">
        <div class="bank-header">
          <div class="bank-title-group">
            <span class="screw-head"></span>
            <span class="bank-title">{cName.toUpperCase()} CORE RELAY ARRAY</span>
            <span class="bank-badge">{cName === cluster ? 'PRIMARY BUS' : 'PEER BUS'}</span>
          </div>
          <span class="bank-count">{results.length} ACTIVE CHANNELS</span>
        </div>

        <div class="relay-grid">
          {#each results as svc}
            <div class="relay-module" class:optional={svc.optional} class:error={svc.status === 'error'}>
              <div class="relay-top">
                <div class="relay-coil">
                  <span class="coil-line"></span>
                  <span class="coil-line"></span>
                  <span class="coil-line"></span>
                </div>
                <div class="relay-name-group">
                  <span class="relay-name">{svc.name}</span>
                  <span class="relay-slug">{svc.slug}</span>
                </div>
                <div class="relay-led-housing">
                  <span class="relay-led led-{svc.status}"></span>
                </div>
              </div>

              <!-- Latency Scale / VU Meter Bar -->
              <div class="relay-bottom">
                <div class="relay-metrics">
                  <span class="relay-metric-label">LATENCY</span>
                  <span class="relay-latency">{svc.latencyMs !== null ? `${svc.latencyMs}ms` : 'TIMEOUT'}</span>
                </div>
                <div class="latency-bar">
                  <div 
                    class="latency-fill fill-{svc.status}"
                    style="width: {Math.min(100, Math.max(6, ((svc.latencyMs ?? 500) / 400) * 100))}%"
                  ></div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .relay-panel {
    background: #0E131B;
    border: 1px solid #1E2634;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    color: #E6EDF3;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid #1E2634;
    padding-bottom: 16px;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .panel-title-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .panel-tag {
    font-size: 10px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.1em;
  }

  .panel-title {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #FFF;
  }

  .panel-sub {
    font-size: 9.5px;
    color: #8B949E;
    letter-spacing: 0.08em;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .probe-timestamp {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: #8B949E;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    padding: 4px 8px;
    border-radius: 4px;
  }

  .probe-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3FB950;
    box-shadow: 0 0 6px #3FB950;
  }

  .actuator-btn {
    background: #161F2E;
    border: 1px solid #2D3A4F;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 10.5px;
    font-weight: 700;
    color: #58A6FF;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .actuator-btn:hover {
    border-color: #58A6FF;
    background: #1C273A;
  }

  .actuator-pin {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #58A6FF;
  }

  .relay-bank {
    background: #111722;
    border: 1px solid #1E283A;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .bank-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-bottom: 10px;
  }

  .bank-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .screw-head {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #334155;
    border: 1px solid #475569;
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.6);
  }

  .bank-title {
    font-size: 11px;
    font-weight: 700;
    color: #E2E8F0;
    letter-spacing: 0.08em;
  }

  .bank-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(88, 166, 255, 0.12);
    border: 1px solid rgba(88, 166, 255, 0.3);
    color: #58A6FF;
  }

  .bank-count {
    font-size: 9.5px;
    color: #8B949E;
  }

  .relay-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 12px;
  }

  .relay-module {
    background: #151D2A;
    border: 1px solid #243044;
    border-radius: 6px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    transition: all 0.15s ease;
  }

  .relay-module:hover {
    border-color: #58A6FF;
    transform: translateY(-1px);
  }

  .relay-module.optional {
    opacity: 0.75;
  }

  .relay-module.error {
    border-color: #F85149;
    background: rgba(248, 81, 73, 0.06);
  }

  .relay-top {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .relay-coil {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 3px;
  }

  .coil-line {
    width: 8px;
    height: 2px;
    background: #475569;
    border-radius: 1px;
  }

  .relay-name-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .relay-name {
    font-size: 11.5px;
    font-weight: 600;
    color: #F0F6FC;
  }

  .relay-slug {
    font-size: 9.5px;
    color: #8B949E;
  }

  .relay-led-housing {
    width: 14px;
    height: 14px;
    background: #0B0E14;
    border: 1px solid #2D3A4B;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .relay-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .led-ok {
    background: #3FB950;
    box-shadow: 0 0 8px #3FB950;
  }

  .led-slow {
    background: #E3B341;
    box-shadow: 0 0 8px #E3B341;
  }

  .led-optional {
    background: #8B949E;
  }

  .led-error {
    background: #F85149;
    box-shadow: 0 0 8px #F85149;
  }

  .relay-bottom {
    display: flex;
    flex-direction: column;
    gap: 5px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    padding-top: 8px;
  }

  .relay-metrics {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
  }

  .relay-metric-label {
    color: #8B949E;
    letter-spacing: 0.06em;
  }

  .relay-latency {
    font-weight: 700;
    color: #58A6FF;
  }

  .latency-bar {
    height: 3px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
  }

  .latency-fill {
    height: 100%;
    transition: width 0.3s ease;
  }

  .fill-ok { background: #3FB950; }
  .fill-slow { background: #E3B341; }
  .fill-optional { background: #8B949E; }
  .fill-error { background: #F85149; }

  .panel-skeleton {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .skeleton-slot {
    height: 48px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    animation: pulse 1.5s infinite ease-in-out;
  }

  .panel-fault {
    background: rgba(248, 81, 73, 0.08);
    border: 1px solid rgba(248, 81, 73, 0.3);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .fault-badge {
    background: #F85149;
    color: #FFF;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.08em;
  }

  .fault-message {
    font-size: 11px;
    color: #FF7B72;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }
</style>
