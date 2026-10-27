<script lang="ts">
  import { onMount } from 'svelte';

  interface GpuModelSlot {
    id: string;
    name: string;
    port: number;
    host: string;
    engine: string;
    status: 'online' | 'standby' | 'busy' | 'offline';
    vramUsedGb: number;
    vramTotalGb: number;
    tokensPerSec: number;
    contextLength: string;
  }

  interface GpuTelemetry {
    gpuHost: string;
    gpuHostIp: string;
    gpuName: string;
    totalVramGb: number;
    usedVramGb: number;
    freeVramGb: number;
    tempCelsius: number;
    powerWatts: number;
    slots: GpuModelSlot[];
    embeddingGateway: {
      host: string;
      ip: string;
      model: string;
      status: 'online' | 'standby' | 'offline';
      latencyMs: number;
    };
    checkedAt: string;
  }

  let telemetry = $state<GpuTelemetry | null>(null);
  let loading = $state<boolean>(true);
  let isLive = $state<boolean>(false);

  async function fetchGpuTelemetry() {
    try {
      const res = await fetch('/sdlc/api/platform/gpu-telemetry');
      if (res.ok) {
        telemetry = await res.json();
        isLive = true;
      }
    } catch {
      isLive = false;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchGpuTelemetry();
    const interval = setInterval(fetchGpuTelemetry, 5000);
    return () => clearInterval(interval);
  });
</script>

<div class="gpu-deck">
  <!-- Deck Instrument Header -->
  <div class="deck-header">
    <div class="deck-title-group">
      <div class="deck-tag-row">
        <span class="screw-metal"></span>
        <span class="deck-tag">PANEL 03 // BARE-METAL GPU INFERENCE & EMBEDDING GATEWAY</span>
      </div>
      <span class="deck-title">Lokale LLM-Sensorik & VRAM-Telemetrie</span>
      <span class="deck-sub">HOST: PK-DESKTOP (100.76.165.106) · EMBEDDING: PK-TABLET-LINUX (100.64.20.15)</span>
    </div>

    <div class="deck-badges">
      <div class="deck-badge">
        <span class="badge-led {isLive ? 'led-live' : 'led-offline'}"></span>
        <span class="badge-label">CUDA SENSOR</span>
        <span class="badge-val">{isLive ? 'ACTIVE' : 'IDLE'}</span>
      </div>
      {#if telemetry}
        <div class="deck-badge thermal">
          <span class="badge-label">THERMAL</span>
          <span class="badge-val">{telemetry.tempCelsius}°C · {telemetry.powerWatts}W</span>
        </div>
      {/if}
    </div>
  </div>

  {#if loading && !telemetry}
    <div class="deck-skeleton">
      <div class="skeleton-gauge"></div>
      <div class="skeleton-grid"></div>
    </div>
  {:else if telemetry}
    <!-- Top Row: VRAM Gauge & BGE Gateway Deck -->
    <div class="telemetry-gauges-row">
      <!-- VRAM VU Tube Gauge -->
      <div class="vram-gauge-card">
        <div class="gauge-header">
          <div class="gauge-label-group">
            <span class="gauge-title">VRAM ALLOCATION REGISTER</span>
            <span class="gauge-sub">{telemetry.gpuName}</span>
          </div>
          <span class="gauge-readout">{telemetry.usedVramGb} / {telemetry.totalVramGb} GiB ({Math.round((telemetry.usedVramGb / telemetry.totalVramGb) * 100)}%)</span>
        </div>

        <!-- Segmented VU Meter -->
        <div class="vu-meter-tube">
          <div 
            class="vu-fill" 
            style="width: {Math.min(100, (telemetry.usedVramGb / telemetry.totalVramGb) * 100)}%"
          ></div>
          <div class="vu-scale-ticks">
            <span class="tick">0G</span>
            <span class="tick">8G</span>
            <span class="tick">16G</span>
            <span class="tick">24G</span>
            <span class="tick">32G</span>
          </div>
        </div>

        <div class="gauge-footer">
          <div class="gauge-metric">
            <span class="m-label">RESERVED BUFFER:</span>
            <span class="m-val">{telemetry.usedVramGb} GiB</span>
          </div>
          <div class="gauge-metric">
            <span class="m-label">HEADROOM:</span>
            <span class="m-val highlight">{telemetry.freeVramGb} GiB</span>
          </div>
        </div>
      </div>

      <!-- Embedding Gateway Module -->
      <div class="embedding-gateway-card">
        <div class="gw-header">
          <div class="gw-title-group">
            <span class="gw-tag">DUAL-BOOT EMBEDDING SINK</span>
            <span class="gw-title">BGE Rerank & Vector Gateway</span>
          </div>
          <span class="gw-status-badge">ONLINE</span>
        </div>

        <div class="gw-body">
          <div class="gw-info-row">
            <span class="gw-key">HOST / NODE:</span>
            <span class="gw-val code">{telemetry.embeddingGateway.host} ({telemetry.embeddingGateway.ip})</span>
          </div>
          <div class="gw-info-row">
            <span class="gw-key">MODEL:</span>
            <span class="gw-val">{telemetry.embeddingGateway.model}</span>
          </div>
          <div class="gw-info-row">
            <span class="gw-key">INFERENCE LATENCY:</span>
            <span class="gw-val latency">{telemetry.embeddingGateway.latencyMs} ms</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Row: Active Model Inferenz-Slots -->
    <div class="model-slots-section">
      <div class="slots-header">
        <span class="slots-title">ACTIVE GPU INFERENCE ENGINES (PORTS 1234, 1919, 8089, 8094)</span>
        <span class="slots-rev">HOSTED ON PK-DESKTOP · TAILSCALE DIRECT BUS</span>
      </div>

      <div class="slots-grid">
        {#each telemetry.slots as slot}
          <div class="model-slot-card">
            <div class="slot-top">
              <div class="slot-info">
                <span class="slot-port">PORT :{slot.port}</span>
                <h4 class="slot-name">{slot.name}</h4>
              </div>
              <span class="slot-led led-{slot.status}"></span>
            </div>

            <div class="slot-meta">
              <span class="engine-tag">{slot.engine}</span>
              <span class="context-tag">{slot.contextLength}</span>
            </div>

            <div class="slot-footer">
              <div class="slot-metric">
                <span class="sub-label">VRAM:</span>
                <span class="metric-val">{slot.vramUsedGb} GiB</span>
              </div>
              <div class="slot-metric">
                <span class="sub-label">SAMPLING:</span>
                <span class="metric-val hi">{slot.tokensPerSec > 0 ? `${slot.tokensPerSec} tok/s` : 'IDLE'}</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .gpu-deck {
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

  .deck-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid #1E2634;
    padding-bottom: 16px;
  }

  .deck-title-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .deck-tag-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .screw-metal {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #475569;
    border: 1px solid #64748B;
  }

  .deck-tag {
    font-size: 10px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.1em;
  }

  .deck-title {
    font-size: 16px;
    font-weight: 700;
    color: #FFF;
    letter-spacing: 0.05em;
  }

  .deck-sub {
    font-size: 9.5px;
    color: #8B949E;
    letter-spacing: 0.08em;
  }

  .deck-badges {
    display: flex;
    gap: 10px;
  }

  .deck-badge {
    background: #111722;
    border: 1px solid #1F293D;
    border-radius: 6px;
    padding: 5px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10.5px;
  }

  .badge-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .led-live { background: #3FB950; box-shadow: 0 0 6px #3FB950; }
  .led-offline { background: #64748B; }

  .badge-label {
    color: #8B949E;
    font-size: 9.5px;
    letter-spacing: 0.05em;
  }

  .badge-val {
    font-weight: 700;
    color: #E2E8F0;
  }

  .telemetry-gauges-row {
    display: grid;
    grid-template-columns: 1.6fr 1fr;
    gap: 16px;
  }

  .vram-gauge-card {
    background: #111722;
    border: 1px solid #1E283A;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .gauge-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .gauge-label-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gauge-title {
    font-size: 11px;
    font-weight: 700;
    color: #93C5FD;
    letter-spacing: 0.08em;
  }

  .gauge-sub {
    font-size: 9.5px;
    color: #8B949E;
  }

  .gauge-readout {
    font-size: 12px;
    font-weight: 700;
    color: #38BDF8;
  }

  .vu-meter-tube {
    height: 18px;
    background: #080B0F;
    border: 1px solid #1E2634;
    border-radius: 4px;
    position: relative;
    overflow: hidden;
    padding: 2px;
  }

  .vu-fill {
    height: 100%;
    background: linear-gradient(90deg, #3FB950 0%, #38BDF8 70%, #F59E0B 100%);
    border-radius: 2px;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
    transition: width 0.3s ease;
  }

  .vu-scale-ticks {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: space-between;
    padding: 0 8px;
    align-items: center;
    pointer-events: none;
  }

  .tick {
    font-size: 8px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.5);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  }

  .gauge-footer {
    display: flex;
    justify-content: space-between;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    padding-top: 8px;
    font-size: 10px;
  }

  .gauge-metric {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .m-label { color: #8B949E; }
  .m-val { font-weight: 600; color: #E2E8F0; }
  .m-val.highlight { color: #3FB950; font-weight: 700; }

  .embedding-gateway-card {
    background: #111722;
    border: 1px solid #1E283A;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .gw-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .gw-title-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gw-tag {
    font-size: 9.5px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.08em;
  }

  .gw-title {
    font-size: 12px;
    font-weight: 700;
    color: #FFF;
  }

  .gw-status-badge {
    background: rgba(63, 185, 80, 0.12);
    border: 1px solid rgba(63, 185, 80, 0.3);
    color: #3FB950;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .gw-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 10px;
  }

  .gw-info-row {
    display: flex;
    justify-content: space-between;
  }

  .gw-key { color: #8B949E; }
  .gw-val { color: #E2E8F0; font-weight: 600; }
  .gw-val.code { color: #58A6FF; font-family: monospace; }
  .gw-val.latency { color: #3FB950; font-weight: 700; }

  .model-slots-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .slots-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9.5px;
    letter-spacing: 0.08em;
  }

  .slots-title { color: #93C5FD; font-weight: 700; }
  .slots-rev { color: #8B949E; }

  .slots-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .model-slot-card {
    background: #111722;
    border: 1px solid #1F293D;
    border-radius: 6px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .slot-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .slot-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .slot-port {
    font-size: 9px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.05em;
  }

  .slot-name {
    font-size: 11.5px;
    font-weight: 700;
    color: #F0F6FC;
    margin: 0;
  }

  .slot-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .led-online { background: #3FB950; box-shadow: 0 0 6px #3FB950; }
  .led-standby { background: #E3B341; box-shadow: 0 0 6px #E3B341; }
  .led-busy { background: #58A6FF; box-shadow: 0 0 6px #58A6FF; }
  .led-offline { background: #64748B; }

  .slot-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 9.5px;
  }

  .engine-tag { color: #8B949E; }
  .context-tag { color: #7DD3FC; font-weight: 600; }

  .slot-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    padding-top: 6px;
    font-size: 9px;
  }

  .slot-metric {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .sub-label { color: #8B949E; }
  .metric-val { font-weight: 600; color: #E2E8F0; }
  .metric-val.hi { color: #3FB950; font-weight: 700; }

  .deck-skeleton {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .skeleton-gauge {
    height: 80px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
  }

  .skeleton-grid {
    height: 100px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
  }

  @media (max-width: 900px) {
    .telemetry-gauges-row {
      grid-template-columns: 1fr;
    }
    .slots-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
