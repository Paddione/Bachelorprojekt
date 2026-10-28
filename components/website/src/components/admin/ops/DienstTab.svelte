<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let cluster: string = 'mentolder';

  type Deployment = { ns: string; nsLabel: string; name: string; desired: number; ready: number; status: string };
  type Action = { type: 'restart' | 'scale'; deployment: Deployment };

  let deployments: Deployment[] = [];
  let loading = true;
  let error: string | null = null;
  let pending: Action | null = null;
  let scaleTarget = 1;
  let actionLoading = false;
  let actionError: string | null = null;
  let successMsg: string | null = null;
  let interval: ReturnType<typeof setInterval>;

  async function load() {
    try {
      loading = deployments.length === 0;
      const res = await fetch('/sdlc/api/ops/deployments/list');
      if (res.ok) { const j = await res.json(); deployments = j.deployments; error = null; }
      else { const j = await res.json().catch(() => ({})); error = j.error ?? `Fehler ${res.status}`; }
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }

  async function confirm() {
    if (!pending) return;
    actionLoading = true; actionError = null;
    const { type, deployment: d } = pending;
    try {
      const body = type === 'scale' ? JSON.stringify({ replicas: scaleTarget }) : '{}';
      const res = await fetch(`/sdlc/api/ops/deployments/${d.ns}/${d.name}/${type}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      });
      const j = await res.json();
      if (!res.ok) { actionError = j.error ?? 'Fehler'; return; }
      successMsg = type === 'restart' ? `${d.name} wird neu gestartet…` : `${d.name} skaliert auf ${scaleTarget}`;
      pending = null;
      setTimeout(() => { successMsg = null; load(); }, 2000);
    } catch { actionError = 'Netzwerkfehler'; }
    finally { actionLoading = false; }
  }

  onMount(() => { load(); interval = setInterval(load, 30_000); });
  onDestroy(() => clearInterval(interval));

  $: grouped = deployments.reduce<Record<string, Deployment[]>>((acc, d) => {
    (acc[d.nsLabel] ??= []).push(d); return acc;
  }, {});
</script>

<div class="deployment-deck">
  <!-- Mechatronic Header -->
  <div class="deck-header">
    <div class="deck-title-block">
      <div class="deck-tag-row">
        <span class="deck-tag">PANEL 03 // DEPLOYMENT ACTUATORS</span>
        <span class="deck-title">Orchestrierte K3s-Dienste & Replicas</span>
      </div>
      <span class="deck-sub">CLUSTER: {cluster.toUpperCase()} · REPLICA COILS · ZERO-DOWNTIME SWEEPS</span>
    </div>

    <div class="deck-controls">
      {#if successMsg}
        <div class="deck-success-badge">
          <span class="success-dot"></span>
          <span>{successMsg}</span>
        </div>
      {/if}
      <button on:click={load} disabled={loading} class="deck-actuator-btn">
        <span class="btn-pin"></span>
        <span>{loading ? 'LÄDT…' : '↻ REFRESH'}</span>
      </button>
    </div>
  </div>

  {#if error}
    <div class="deck-fault">
      <span class="fault-badge">FAULT</span>
      <span class="fault-text">{error}</span>
    </div>
  {/if}

  {#if loading && deployments.length === 0}
    <div class="deck-skeleton">
      <div class="skeleton-slot"></div>
      <div class="skeleton-slot"></div>
      <div class="skeleton-slot"></div>
    </div>
  {:else}
    <div class="group-list">
      {#each Object.entries(grouped) as [label, deps]}
        <div class="service-bank">
          <div class="bank-header">
            <div class="bank-title-group">
              <span class="screw-head"></span>
              <span class="bank-label">{label.toUpperCase()}</span>
            </div>
            <span class="bank-count">{deps.length} DEPLOYMENTS</span>
          </div>

          <div class="deployment-grid">
            {#each deps as d}
              <div class="deployment-card">
                <div class="dep-faceplate">
                  <div class="dep-id-group">
                    <span class="dep-ns-tag">{d.ns}</span>
                    <span class="dep-name">{d.name}</span>
                  </div>
                  <div class="dep-status-led-box">
                    <span class="status-led led-{d.status}"></span>
                    <span class="status-text">{d.status}</span>
                  </div>
                </div>

                <!-- Replica Pins & Gauge -->
                <div class="replica-rail">
                  <div class="replica-info">
                    <div class="replica-pins">
                      {#each Array(Math.max(d.desired, d.ready, 1)) as _, i}
                        <span class="replica-pin {i < d.ready ? 'pin-active' : 'pin-stale'}"></span>
                      {/each}
                    </div>
                    <span class="replica-count">{d.ready}/{d.desired} REPLICAS</span>
                  </div>

                  <div class="dep-actuators">
                    <button 
                      on:click={() => { pending = { type: 'restart', deployment: d }; }}
                      class="act-btn btn-restart"
                      title="Deployment neu starten"
                    >
                      RESTART
                    </button>
                    <button 
                      on:click={() => { pending = { type: 'scale', deployment: d }; scaleTarget = d.desired; }}
                      class="act-btn btn-scale"
                      title="Replicas anpassen"
                    >
                      SCALE
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Tactile Mechatronic Confirmation Modal -->
{#if pending}
  <div class="modal-backdrop" role="dialog">
    <div class="modal-chassis">
      <div class="modal-header">
        <span class="modal-screw"></span>
        <span class="modal-title">{pending.type === 'restart' ? 'NEUSTART BESTÄTIGEN' : 'REPLICAS SKALIEREN'}</span>
      </div>

      <div class="modal-body">
        {#if pending.type === 'restart'}
          <p class="modal-text">
            Das Deployment <span class="modal-target">{pending.deployment.name}</span> im Namespace <span class="modal-ns">[{pending.deployment.ns}]</span> wird rollierend neu gestartet.
          </p>
        {:else}
          <p class="modal-text">
            Ziel-Replica-Anzahl für <span class="modal-target">{pending.deployment.name}</span> konfigurieren:
          </p>
          <div class="scale-stepper">
            <input 
              type="number" 
              min="0" 
              max="20" 
              bind:value={scaleTarget}
              class="scale-input" 
            />
            <span class="scale-unit">POD SLOTS</span>
          </div>
        {/if}

        {#if actionError}
          <div class="modal-error">{actionError}</div>
        {/if}
      </div>

      <div class="modal-footer">
        <button on:click={() => pending = null} class="modal-btn-cancel">ABBRECHEN</button>
        <button on:click={confirm} disabled={actionLoading} class="modal-btn-confirm">
          {actionLoading ? 'SENDE BEFEHL…' : 'BESTÄTIGEN'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .deployment-deck {
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
    gap: 16px;
    flex-wrap: wrap;
  }

  .deck-title-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .deck-tag-row {
    display: flex;
    align-items: center;
    gap: 12px;
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
    color: #F0F6FC;
  }

  .deck-sub {
    font-size: 10px;
    color: #8B949E;
    letter-spacing: 0.05em;
  }

  .deck-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .deck-success-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: #3FB950;
    background: rgba(63, 185, 80, 0.1);
    border: 1px solid rgba(63, 185, 80, 0.3);
    padding: 4px 8px;
    border-radius: 4px;
  }

  .success-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3FB950;
    box-shadow: 0 0 6px #3FB950;
  }

  .deck-actuator-btn {
    background: #161F2E;
    border: 1px solid #2D3A4F;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 10px;
    font-weight: 700;
    color: #58A6FF;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .deck-actuator-btn:hover {
    border-color: #58A6FF;
    background: #1C273A;
  }

  .btn-pin {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3FB950;
  }

  .group-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .service-bank {
    background: #111722;
    border: 1px solid #1E283A;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .bank-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-bottom: 8px;
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

  .bank-label {
    font-size: 11px;
    font-weight: 700;
    color: #E2E8F0;
    letter-spacing: 0.08em;
  }

  .bank-count {
    font-size: 9.5px;
    color: #8B949E;
  }

  .deployment-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }

  .deployment-card {
    background: #151D2A;
    border: 1px solid #243044;
    border-radius: 6px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: all 0.15s ease;
  }

  .deployment-card:hover {
    border-color: #58A6FF;
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .dep-faceplate {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .dep-id-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dep-ns-tag {
    font-size: 9px;
    font-weight: 700;
    color: #58A6FF;
  }

  .dep-name {
    font-size: 12px;
    font-weight: 600;
    color: #F0F6FC;
  }

  .dep-status-led-box {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #0B0E14;
    border: 1px solid #2D3A4B;
    border-radius: 4px;
    padding: 2px 6px;
  }

  .status-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .led-healthy { background: #3FB950; box-shadow: 0 0 6px #3FB950; }
  .led-degraded { background: #E3B341; box-shadow: 0 0 6px #E3B341; }
  .led-stopped { background: #8B949E; }

  .status-text {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    color: #8B949E;
  }

  .replica-rail {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    padding-top: 8px;
  }

  .replica-info {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .replica-pins {
    display: flex;
    gap: 2px;
  }

  .replica-pin {
    width: 3px;
    height: 8px;
    border-radius: 1px;
  }

  .pin-active { background: #3FB950; box-shadow: 0 0 4px rgba(63, 185, 80, 0.6); }
  .pin-stale { background: #334155; }

  .replica-count {
    font-size: 9.5px;
    color: #8B949E;
    font-weight: 600;
  }

  .dep-actuators {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .act-btn {
    font-size: 9px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #2D3A4F;
    background: #111722;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-restart {
    color: #58A6FF;
  }

  .btn-restart:hover {
    background: rgba(88, 166, 255, 0.15);
    border-color: #58A6FF;
  }

  .btn-scale {
    color: #8B949E;
  }

  .btn-scale:hover {
    color: #F0F6FC;
    border-color: #475569;
    background: #1C273A;
  }

  /* Modal Styles */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 16px;
  }

  .modal-chassis {
    background: #111722;
    border: 1px solid #2D3A4F;
    border-radius: 10px;
    max-width: 420px;
    width: 100%;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: ui-monospace, monospace;
  }

  .modal-header {
    background: #161F2E;
    border-bottom: 1px solid #243044;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .modal-screw {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #334155;
    border: 1px solid #475569;
  }

  .modal-title {
    font-size: 11px;
    font-weight: 700;
    color: #F0F6FC;
    letter-spacing: 0.08em;
  }

  .modal-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .modal-text {
    font-size: 11.5px;
    color: #8B949E;
    line-height: 1.5;
    margin: 0;
  }

  .modal-target {
    color: #58A6FF;
    font-weight: 700;
  }

  .modal-ns {
    color: #E2E8F0;
  }

  .scale-stepper {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .scale-input {
    background: #0B0E14;
    border: 1px solid #2D3A4F;
    border-radius: 4px;
    color: #F0F6FC;
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    padding: 6px 12px;
    width: 80px;
  }

  .scale-input:focus {
    border-color: #58A6FF;
    outline: none;
  }

  .scale-unit {
    font-size: 10px;
    color: #8B949E;
    font-weight: 700;
  }

  .modal-error {
    background: rgba(248, 81, 73, 0.1);
    border: 1px solid rgba(248, 81, 73, 0.3);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 10px;
    color: #FF7B72;
  }

  .modal-footer {
    border-top: 1px solid #1E283A;
    padding: 12px 16px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    background: #0E131B;
  }

  .modal-btn-cancel {
    background: transparent;
    border: 1px solid #243044;
    border-radius: 4px;
    color: #8B949E;
    font-family: inherit;
    font-size: 10px;
    font-weight: 600;
    padding: 6px 12px;
    cursor: pointer;
  }

  .modal-btn-cancel:hover {
    color: #F0F6FC;
    border-color: #475569;
  }

  .modal-btn-confirm {
    background: #58A6FF;
    border: 1px solid #58A6FF;
    border-radius: 4px;
    color: #0E131B;
    font-family: inherit;
    font-size: 10px;
    font-weight: 700;
    padding: 6px 12px;
    cursor: pointer;
  }

  .modal-btn-confirm:hover {
    background: #79B8FF;
  }

  .modal-btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .deck-fault {
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

  .deck-skeleton {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .skeleton-slot {
    height: 60px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    animation: pulse 1.5s infinite ease-in-out;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }
</style>

