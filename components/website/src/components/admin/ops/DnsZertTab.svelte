<script lang="ts">
  import { onMount } from 'svelte';

  type CertResult = { notAfter: string | null; daysLeft: number | null; error?: string };
  type CertsData = { results: Record<string, CertResult>; checkedAt: string };

  let certsData: CertsData | null = null;
  let certsLoading = true;
  let certsError: string | null = null;

  const CLUSTER_LABELS: Record<string, string> = { mentolder: 'mentolder.de', korczewski: 'korczewski.de' };

  async function loadCerts() {
    certsLoading = true; certsError = null;
    try {
      const res = await fetch('/sdlc/api/ops/certs');
      if (res.ok) { certsData = await res.json(); }
      else { const j = await res.json().catch(() => ({})); certsError = j.error ?? `Fehler ${res.status}`; }
    } catch (e) { certsError = (e as Error).message; }
    finally { certsLoading = false; }
  }

  function certLedCls(days: number | null) {
    if (days === null) return 'led-unknown';
    if (days < 10) return 'led-critical';
    if (days < 30) return 'led-warning';
    return 'led-healthy';
  }

  onMount(loadCerts);
</script>

<div class="dns-chassis">
  <!-- Mechatronic Header -->
  <div class="dns-header">
    <div class="dns-title-block">
      <div class="dns-tag-row">
        <span class="dns-tag">PANEL 07 // TLS CRYPTO-CARTRIDGES & DNS RELAYS</span>
        <h3 class="dns-title">Wildcard TLS-Zertifikate & Zonen</h3>
      </div>
      <span class="dns-sub">AUTOMATISIERTE LET'S ENCRYPT DNS-01 CHALLENGES · CERT-MANAGER CRDS</span>
    </div>

    <div class="dns-controls">
      {#if certsData}
        <div class="probe-cycle">
          <span class="probe-dot"></span>
          <span>CYCLE: {new Date(certsData.checkedAt).toLocaleTimeString()}</span>
        </div>
      {/if}
      <button on:click={loadCerts} disabled={certsLoading} class="dns-act-btn">
        <span class="btn-pin"></span>
        <span>{certsLoading ? 'PRÜFE…' : '↻ REFRESH'}</span>
      </button>
    </div>
  </div>

  {#if certsError}
    <div class="dns-fault">
      <span class="fault-badge">FAULT</span>
      <span class="fault-text">{certsError}</span>
    </div>
  {/if}

  {#if certsLoading && !certsData}
    <div class="dns-skeleton">
      <div class="skeleton-cartridge"></div>
      <div class="skeleton-cartridge"></div>
    </div>
  {:else if certsData}
    <div class="cartridge-grid">
      {#each Object.entries(certsData.results) as [cluster, cert]}
        <div class="crypto-cartridge">
          <div class="cartridge-faceplate">
            <div class="domain-id-group">
              <span class="domain-badge">ZONE: {cluster.toUpperCase()}</span>
              <h4 class="domain-name">*.{CLUSTER_LABELS[cluster] ?? cluster}</h4>
            </div>

            <div class="cert-led-box">
              <span class="cert-led {certLedCls(cert.daysLeft)}"></span>
              <span class="cert-status-text">
                {cert.daysLeft !== null ? (cert.daysLeft < 10 ? 'CRITICAL' : cert.daysLeft < 30 ? 'EXPIRING' : 'VALID') : 'UNKNOWN'}
              </span>
            </div>
          </div>

          {#if cert.error}
            <div class="cert-error-row">
              <span class="error-icon">⚠</span>
              <span class="error-msg">{cert.error}</span>
            </div>
          {:else}
            <!-- Expiration VU Gauge Track -->
            <div class="gauge-section">
              <div class="gauge-metrics">
                <span class="gauge-label">Laufzeit-Reserve:</span>
                <span class="gauge-value">{cert.daysLeft !== null ? `${cert.daysLeft} TAGE` : '–'}</span>
              </div>
              <div class="gauge-track">
                <div 
                  class="gauge-fill {cert.daysLeft && cert.daysLeft < 10 ? 'fill-red' : cert.daysLeft && cert.daysLeft < 30 ? 'fill-yellow' : 'fill-green'}"
                  style="width: {Math.min(100, Math.max(8, ((cert.daysLeft ?? 0) / 90) * 100))}%"
                ></div>
              </div>
            </div>

            <div class="cartridge-meta">
              <div class="meta-item">
                <span class="meta-k">ABLAUFDATUM:</span>
                <span class="meta-v">{cert.notAfter ? new Date(cert.notAfter).toLocaleDateString('de-DE') : '–'}</span>
              </div>
              <div class="meta-item">
                <span class="meta-k">CIPHER/AUTH:</span>
                <span class="meta-v">ECDSA / ACME DNS-01</span>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .dns-chassis {
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

  .dns-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid #1E2634;
    padding-bottom: 16px;
    gap: 16px;
    flex-wrap: wrap;
  }

  .dns-title-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .dns-tag-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .dns-tag {
    font-size: 10px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.1em;
  }

  .dns-title {
    font-size: 16px;
    font-weight: 700;
    color: #F0F6FC;
    margin: 0;
  }

  .dns-sub {
    font-size: 10px;
    color: #8B949E;
    letter-spacing: 0.05em;
  }

  .dns-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .probe-cycle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: #8B949E;
  }

  .probe-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #58A6FF;
  }

  .dns-act-btn {
    background: #161F2E;
    border: 1px solid #2D3A4F;
    border-radius: 6px;
    padding: 6px 12px;
    font-family: inherit;
    font-size: 10px;
    font-weight: 700;
    color: #58A6FF;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .dns-act-btn:hover {
    background: #1C273A;
    border-color: #58A6FF;
  }

  .btn-pin {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3FB950;
  }

  .cartridge-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
  }

  .crypto-cartridge {
    background: #111722;
    border: 1px solid #1F293D;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    transition: all 0.15s ease;
  }

  .crypto-cartridge:hover {
    border-color: #58A6FF;
    background: #151D2A;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }

  .cartridge-faceplate {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .domain-id-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .domain-badge {
    font-size: 9px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.08em;
  }

  .domain-name {
    font-size: 13px;
    font-weight: 700;
    color: #F0F6FC;
    margin: 0;
  }

  .cert-led-box {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0B0E14;
    border: 1px solid #232D3F;
    border-radius: 4px;
    padding: 3px 6px;
  }

  .cert-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .led-healthy { background: #3FB950; box-shadow: 0 0 6px #3FB950; }
  .led-warning { background: #E3B341; box-shadow: 0 0 6px #E3B341; }
  .led-critical { background: #F85149; box-shadow: 0 0 6px #F85149; }
  .led-unknown { background: #8B949E; }

  .cert-status-text {
    font-size: 9px;
    font-weight: 700;
    color: #8B949E;
  }

  .gauge-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .gauge-metrics {
    display: flex;
    justify-content: space-between;
    font-size: 9.5px;
  }

  .gauge-label {
    color: #8B949E;
  }

  .gauge-value {
    color: #58A6FF;
    font-weight: 700;
  }

  .gauge-track {
    height: 4px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 2px;
    overflow: hidden;
  }

  .gauge-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .fill-green { background: #3FB950; box-shadow: 0 0 4px #3FB950; }
  .fill-yellow { background: #E3B341; box-shadow: 0 0 4px #E3B341; }
  .fill-red { background: #F85149; box-shadow: 0 0 4px #F85149; }

  .cartridge-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    padding-top: 10px;
    font-size: 9px;
  }

  .meta-item {
    display: flex;
    justify-content: space-between;
  }

  .meta-k {
    color: #8B949E;
  }

  .meta-v {
    color: #E2E8F0;
    font-weight: 600;
  }

  .cert-error-row {
    background: rgba(248, 81, 73, 0.08);
    border: 1px solid rgba(248, 81, 73, 0.3);
    border-radius: 4px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: #FF7B72;
  }

  .dns-fault {
    background: rgba(248, 81, 73, 0.08);
    border: 1px solid rgba(248, 81, 73, 0.3);
    border-radius: 6px;
    padding: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .fault-badge {
    background: #F85149;
    color: #FFF;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .fault-text {
    font-size: 11px;
    color: #FF7B72;
  }

  .dns-skeleton {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
  }

  .skeleton-cartridge {
    height: 140px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    animation: pulse 1.5s infinite ease-in-out;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }
</style>

