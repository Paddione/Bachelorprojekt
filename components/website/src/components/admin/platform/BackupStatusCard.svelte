<script lang="ts">
  import { onMount } from 'svelte';

  export let cluster: string;

  interface Pipeline {
    id: string;
    light: 'green' | 'yellow' | 'red' | 'gray';
    lastRun: string | null;
    lastSuccessfulUpload: string | null;
    succeeded: number;
    failed: number;
    active: number;
    schedule: string | null;
  }

  let pipelines: Pipeline[] = [];
  let loading = true;
  let error: string | null = null;

  async function fetchStatus() {
    loading = true;
    error = null;
    try {
      const r = await fetch('/sdlc/api/backup-status');
      if (!r.ok) throw new Error(`Backup-Status nicht verfügbar (${r.status})`);
      const data = await r.json();
      pipelines = data.pipelines ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Backup-Status nicht verfügbar';
    } finally {
      loading = false;
    }
  }

  onMount(fetchStatus);

  function formatTime(ts: string | null): string {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function pipelineLabel(id: string): string {
    return id === 'db-backup' ? 'RESTIC DB-ARCHIV' : 'RESTIC PVC-VOLUME';
  }
</script>

<div class="tape-cartridge">
  <!-- Tape Cartridge Top Bar -->
  <div class="cartridge-header">
    <div class="cartridge-title-group">
      <span class="screw-dot"></span>
      <span class="cartridge-tag">RESTIC TAPE DRIVE // ARCHIVE</span>
    </div>
    <button on:click={fetchStatus} class="cartridge-refresh" title="Snapshot-Katalog abfragen">
      SYNC
    </button>
  </div>

  {#if loading}
    <div class="cartridge-skeleton">
      <div class="skeleton-bar"></div>
      <div class="skeleton-bar"></div>
    </div>
  {:else if error}
    <div class="cartridge-error">
      <span>{error}</span>
    </div>
  {:else if pipelines.length === 0}
    <div class="cartridge-empty">
      Keine Restic-Archive registriert.
    </div>
  {:else}
    <div class="pipeline-list">
      {#each pipelines as p}
        <div class="pipeline-module">
          <!-- Tape Window / Spool Graphic -->
          <div class="spool-window">
            <div class="spool-reel left">
              <span class="spool-hub"></span>
            </div>
            <div class="tape-tape-bar"></div>
            <div class="spool-reel right">
              <span class="spool-hub"></span>
            </div>
          </div>

          <div class="pipeline-data">
            <div class="pipeline-top">
              <span class="pipeline-name">{pipelineLabel(p.id)}</span>
              <div class="pipeline-led-block">
                <span class="status-led led-{p.light}"></span>
                <span class="status-label">{p.light.toUpperCase()}</span>
              </div>
            </div>

            <div class="pipeline-timestamps">
              <div class="time-row">
                <span>SNAPSHOT:</span>
                <span class="time-val">{formatTime(p.lastRun)}</span>
              </div>
              <div class="time-row">
                <span>OFFSITE:</span>
                <span class="time-val">{formatTime(p.lastSuccessfulUpload)}</span>
              </div>
              {#if p.schedule}
                <div class="time-row">
                  <span>CRON:</span>
                  <span class="time-val code">{p.schedule}</span>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tape-cartridge {
    background: #0E131B;
    border: 1px solid #1E2634;
    border-radius: 10px;
    padding: 16px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
  }

  .cartridge-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-bottom: 8px;
  }

  .cartridge-title-group {
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

  .cartridge-tag {
    font-size: 10px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.08em;
  }

  .cartridge-refresh {
    font-size: 9px;
    font-weight: 700;
    color: #8B949E;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    padding: 2px 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .cartridge-refresh:hover {
    color: #58A6FF;
    border-color: #58A6FF;
  }

  .pipeline-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .pipeline-module {
    background: #111722;
    border: 1px solid #1E283A;
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  .spool-window {
    height: 16px;
    background: #080B0F;
    border: 1px solid #1E2634;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    position: relative;
    overflow: hidden;
  }

  .tape-tape-bar {
    position: absolute;
    left: 28px;
    right: 28px;
    height: 2px;
    background: #334155;
  }

  .spool-reel {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid #475569;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #161F2E;
    z-index: 1;
  }

  .spool-hub {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: #94A3B8;
  }

  .pipeline-data {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pipeline-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .pipeline-name {
    font-size: 11px;
    font-weight: 700;
    color: #E2E8F0;
  }

  .pipeline-led-block {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0B0E14;
    border: 1px solid #232D3F;
    border-radius: 4px;
    padding: 2px 6px;
  }

  .status-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .led-green { background: #3FB950; box-shadow: 0 0 6px #3FB950; }
  .led-yellow { background: #E3B341; box-shadow: 0 0 6px #E3B341; }
  .led-red { background: #F85149; box-shadow: 0 0 6px #F85149; }
  .led-gray { background: #64748B; }

  .status-label {
    font-size: 8.5px;
    font-weight: 700;
    color: #8B949E;
  }

  .pipeline-timestamps {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 9.5px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    padding-top: 6px;
  }

  .time-row {
    display: flex;
    justify-content: space-between;
    color: #8B949E;
  }

  .time-val {
    color: #CBD5E1;
  }

  .time-val.code {
    color: #58A6FF;
    font-family: monospace;
  }

  .cartridge-skeleton {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-bar {
    height: 38px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
  }

  .cartridge-error, .cartridge-empty {
    font-size: 10px;
    color: #8B949E;
    text-align: center;
    padding: 8px;
  }
</style>
