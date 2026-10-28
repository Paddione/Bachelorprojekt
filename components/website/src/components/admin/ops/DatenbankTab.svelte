<script lang="ts">
  import { onMount } from 'svelte';

  type BackupJob = { name: string; trigger: string; startTime: string | null; completionTime: string | null; succeeded: boolean; failed: boolean };

  export let cluster: string = 'mentolder';
  let jobs: BackupJob[] = [];
  let jobsLoading = false;
  let triggerLoading = false;
  let triggerMsg: string | null = null;
  let triggerError: string | null = null;

  let restoreJob: BackupJob | null = null;
  let restoreDb = 'all';
  let restoreLoading = false;
  let restoreError: string | null = null;
  let restoreMsg: string | null = null;
  let confirmRestore = false;

  const DBS = ['all', 'keycloak', 'nextcloud', 'vaultwarden', 'website', 'docuseal'];

  async function loadJobs() {
    jobsLoading = true;
    try {
      const res = await fetch(`/sdlc/api/ops/backup/list?cluster=${cluster}`);
      const j = await res.json();
      if (res.ok) jobs = j.jobs;
      else triggerError = j.error ?? `Fehler ${res.status}`;
    } catch (e) { triggerError = (e as Error).message; }
    finally { jobsLoading = false; }
  }

  async function triggerBackup() {
    triggerLoading = true; triggerMsg = null; triggerError = null;
    try {
      const res = await fetch('/sdlc/api/ops/backup/trigger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster }),
      });
      const j = await res.json();
      if (!res.ok) { triggerError = j.error ?? 'Fehler'; return; }
      triggerMsg = `Backup gestartet: ${j.jobName}`;
      setTimeout(() => { triggerMsg = null; loadJobs(); }, 3000);
    } catch { triggerError = 'Netzwerkfehler'; }
    finally { triggerLoading = false; }
  }

  async function doRestore() {
    if (!restoreJob) return;
    restoreLoading = true; restoreError = null;
    try {
      const res = await fetch('/sdlc/api/ops/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, db: restoreDb, backupJobName: restoreJob.name }),
      });
      const j = await res.json();
      if (!res.ok) { restoreError = j.error ?? 'Fehler'; return; }
      restoreMsg = `Restore-Job gestartet: ${j.jobName}`;
      restoreJob = null; confirmRestore = false;
      setTimeout(() => { restoreMsg = null; loadJobs(); }, 3000);
    } catch { restoreError = 'Netzwerkfehler'; }
    finally { restoreLoading = false; }
  }

  function fmtTime(t: string | null) {
    if (!t) return '–';
    return new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }

  onMount(loadJobs);
</script>

<div class="db-chassis">
  <!-- Mechatronic Header -->
  <div class="db-header">
    <div class="db-title-block">
      <div class="db-tag-row">
        <span class="db-tag">PANEL 06 // DATABASE PERSISTENCE & RESTIC TAPE</span>
        <h3 class="db-title">Postgres Snapshot & Restore Deck</h3>
      </div>
      <span class="db-sub">AUTOMATISIERTE DUMP-SEQUENZEN · RESTIC REPO VAULT · POINT-IN-TIME RESTORE</span>
    </div>

    <!-- Cluster Bus & Trigger Actuators -->
    <div class="db-actuator-bar">
      <div class="bus-select-housing">
        <span class="bus-label">BUS:</span>
        <select bind:value={cluster} on:change={loadJobs} class="bus-select">
          <option value="mentolder">mentolder.de</option>
          <option value="korczewski">korczewski.de</option>
        </select>
      </div>

      <button 
        on:click={triggerBackup} 
        disabled={triggerLoading}
        class="db-act-btn btn-backup"
        title="Sofortiges Snapshot-Backup auslösen"
      >
        <span class="btn-pin"></span>
        <span>{triggerLoading ? 'TRIGGERT…' : 'SNAPSHOT AUSLÖSEN'}</span>
      </button>

      <button 
        on:click={loadJobs} 
        disabled={jobsLoading}
        class="db-act-btn btn-refresh"
        title="Jobs neu laden"
      >
        <span>{jobsLoading ? 'LÄDT…' : '↻ REFRESH'}</span>
      </button>
    </div>
  </div>

  {#if triggerMsg}
    <div class="status-banner banner-success">
      <span class="banner-dot"></span>
      <span>{triggerMsg}</span>
    </div>
  {/if}
  {#if triggerError}
    <div class="status-banner banner-fault">
      <span class="fault-badge">FAULT</span>
      <span>{triggerError}</span>
    </div>
  {/if}
  {#if restoreMsg}
    <div class="status-banner banner-success">
      <span class="banner-dot"></span>
      <span>{restoreMsg}</span>
    </div>
  {/if}

  <!-- Backup Job Ledger -->
  <div class="tape-ledger-frame">
    <div class="ledger-header">
      <div class="ledger-title-group">
        <span class="screw-head"></span>
        <span class="ledger-title">RESTIC SNAPSHOT JOB LEDGER</span>
      </div>
      <span class="ledger-count">{jobs.length} PROTOKOLLIERTE DUMPS</span>
    </div>

    <div class="table-container">
      <table class="tape-table">
        <thead>
          <tr>
            <th class="th-job">SNAPSHOT JOB</th>
            <th class="th-time">GESTARTET</th>
            <th class="th-time">ABGESCHLOSSEN</th>
            <th class="th-status">INTEGRITÄT</th>
            <th class="th-action">AKTION</th>
          </tr>
        </thead>
        <tbody>
          {#each jobs as job}
            <tr class="ledger-row">
              <td class="td-job">
                <span class="job-tape-icon">📼</span>
                <span class="job-name">{job.name}</span>
              </td>
              <td class="td-time">{fmtTime(job.startTime)}</td>
              <td class="td-time">{fmtTime(job.completionTime)}</td>
              <td class="td-status">
                {#if job.succeeded}
                  <span class="status-pill pill-success">
                    <span class="dot-success"></span>
                    <span>ERFOLGREICH</span>
                  </span>
                {:else if job.failed}
                  <span class="status-pill pill-error">
                    <span class="dot-error"></span>
                    <span>FEHLGESCHLAGEN</span>
                  </span>
                {:else}
                  <span class="status-pill pill-running">
                    <span class="dot-running"></span>
                    <span>LÄUFT…</span>
                  </span>
                {/if}
              </td>
              <td class="td-action">
                {#if job.succeeded}
                  <button 
                    on:click={() => { restoreJob = job; restoreError = null; confirmRestore = false; }}
                    class="restore-btn"
                    title="Diesen Stand wiederherstellen"
                  >
                    RESTORE ↵
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
          {#if jobs.length === 0 && !jobsLoading}
            <tr>
              <td colspan="5" class="empty-cell">KEINE RESTIC-BACKUP-JOBS IM AKTUELLEN BUS GEFUNDEN</td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Interlock Restore Confirmation Modal -->
{#if restoreJob}
  <div class="modal-backdrop" role="dialog">
    <div class="modal-chassis">
      <div class="modal-header">
        <span class="modal-screw"></span>
        <span class="modal-title">DATENBANK-RESTORE INTERLOCK</span>
      </div>

      <div class="modal-body">
        <div class="target-card">
          <span class="target-label">QUELL-SNAPSHOT:</span>
          <span class="target-name">{restoreJob.name}</span>
          <span class="target-time">Zeitstempel: {fmtTime(restoreJob.startTime)}</span>
        </div>

        <div class="field-block">
          <label for="restore-db-select" class="field-label">ZIEL-DATENBANK WÄHLEN</label>
          <select id="restore-db-select" bind:value={restoreDb} class="restore-select">
            {#each DBS as db}
              <option value={db}>{db === 'all' ? 'Alle Datenbanken' : db}</option>
            {/each}
          </select>
        </div>

        <div class="hazard-card">
          <label class="hazard-label">
            <input type="checkbox" bind:checked={confirmRestore} class="hazard-checkbox" />
            <span class="hazard-text">
              <strong>WARNUNG // UNWIDERRUFLICHER SCHREIBZUGRIFF:</strong> Diese Operation überschreibt den Live-Datenbestand der gewählten Datenbank unwiderruflich.
            </span>
          </label>
        </div>

        {#if restoreError}
          <div class="modal-error">{restoreError}</div>
        {/if}
      </div>

      <div class="modal-footer">
        <button on:click={() => restoreJob = null} class="modal-btn-cancel">ABBRECHEN</button>
        <button 
          on:click={doRestore} 
          disabled={!confirmRestore || restoreLoading}
          class="modal-btn-danger"
        >
          {restoreLoading ? 'RESTORE LÄUFT…' : 'RESTORE JETZT AUSFÜHREN'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .db-chassis {
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

  .db-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid #1E2634;
    padding-bottom: 16px;
    gap: 16px;
    flex-wrap: wrap;
  }

  .db-title-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .db-tag-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .db-tag {
    font-size: 10px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.1em;
  }

  .db-title {
    font-size: 16px;
    font-weight: 700;
    color: #F0F6FC;
    margin: 0;
  }

  .db-sub {
    font-size: 10px;
    color: #8B949E;
    letter-spacing: 0.05em;
  }

  .db-actuator-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .bus-select-housing {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #111722;
    border: 1px solid #232D3F;
    border-radius: 6px;
    padding: 2px 8px;
  }

  .bus-label {
    font-size: 9px;
    font-weight: 700;
    color: #58A6FF;
  }

  .bus-select {
    background: transparent;
    border: none;
    color: #F0F6FC;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 0;
    cursor: pointer;
  }

  .bus-select:focus {
    outline: none;
  }

  .db-act-btn {
    border-radius: 6px;
    padding: 6px 12px;
    font-family: inherit;
    font-size: 10px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-backup {
    background: #161F2E;
    border: 1px solid rgba(63, 185, 80, 0.4);
    color: #3FB950;
  }

  .btn-backup:hover {
    background: rgba(63, 185, 80, 0.15);
    border-color: #3FB950;
  }

  .btn-refresh {
    background: #161F2E;
    border: 1px solid #2D3A4F;
    color: #58A6FF;
  }

  .btn-refresh:hover {
    background: #1C273A;
    border-color: #58A6FF;
  }

  .btn-pin {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3FB950;
    box-shadow: 0 0 6px #3FB950;
  }

  .status-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 11px;
  }

  .banner-success {
    background: rgba(63, 185, 80, 0.1);
    border: 1px solid rgba(63, 185, 80, 0.3);
    color: #3FB950;
  }

  .banner-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3FB950;
  }

  .banner-fault {
    background: rgba(248, 81, 73, 0.1);
    border: 1px solid rgba(248, 81, 73, 0.3);
    color: #FF7B72;
  }

  .fault-badge {
    background: #F85149;
    color: #FFF;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .tape-ledger-frame {
    background: #111722;
    border: 1px solid #1E283A;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .ledger-header {
    background: #151D2A;
    border-bottom: 1px solid #1E283A;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .ledger-title-group {
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
  }

  .ledger-title {
    font-size: 11px;
    font-weight: 700;
    color: #E2E8F0;
    letter-spacing: 0.08em;
  }

  .ledger-count {
    font-size: 9.5px;
    color: #8B949E;
  }

  .table-container {
    overflow-x: auto;
  }

  .tape-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  .tape-table th {
    background: #0E131B;
    border-bottom: 1px solid #1E283A;
    color: #8B949E;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 10px 14px;
    text-align: left;
  }

  .ledger-row {
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    transition: background 0.15s ease;
  }

  .ledger-row:hover {
    background: #151D2A;
  }

  .tape-table td {
    padding: 10px 14px;
  }

  .td-job {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .job-tape-icon {
    font-size: 13px;
  }

  .job-name {
    font-weight: 600;
    color: #F0F6FC;
  }

  .td-time {
    color: #8B949E;
    font-size: 10.5px;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .pill-success {
    background: rgba(63, 185, 80, 0.12);
    border: 1px solid rgba(63, 185, 80, 0.3);
    color: #3FB950;
  }

  .dot-success { width: 5px; height: 5px; border-radius: 50%; background: #3FB950; box-shadow: 0 0 6px #3FB950; }

  .pill-error {
    background: rgba(248, 81, 73, 0.12);
    border: 1px solid rgba(248, 81, 73, 0.3);
    color: #F85149;
  }

  .dot-error { width: 5px; height: 5px; border-radius: 50%; background: #F85149; }

  .pill-running {
    background: rgba(227, 179, 65, 0.12);
    border: 1px solid rgba(227, 179, 65, 0.3);
    color: #E3B341;
  }

  .dot-running { width: 5px; height: 5px; border-radius: 50%; background: #E3B341; animation: pulse 1s infinite; }

  .restore-btn {
    background: #161F2E;
    border: 1px solid rgba(227, 179, 65, 0.4);
    border-radius: 4px;
    color: #E3B341;
    font-family: inherit;
    font-size: 9.5px;
    font-weight: 700;
    padding: 3px 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .restore-btn:hover {
    background: rgba(227, 179, 65, 0.15);
    border-color: #E3B341;
  }

  .empty-cell {
    text-align: center;
    color: #8B949E;
    padding: 24px;
    font-size: 10.5px;
  }

  /* Modal */
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
    max-width: 440px;
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
    gap: 14px;
  }

  .target-card {
    background: #0E131B;
    border: 1px solid #1E283A;
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .target-label {
    font-size: 9px;
    color: #8B949E;
    font-weight: 700;
  }

  .target-name {
    font-size: 12px;
    font-weight: 700;
    color: #58A6FF;
  }

  .target-time {
    font-size: 10px;
    color: #8B949E;
  }

  .field-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 9.5px;
    font-weight: 700;
    color: #E2E8F0;
  }

  .restore-select {
    background: #0B0E14;
    border: 1px solid #2D3A4F;
    border-radius: 4px;
    color: #F0F6FC;
    font-family: inherit;
    font-size: 12px;
    padding: 8px 10px;
  }

  .restore-select:focus {
    border-color: #58A6FF;
    outline: none;
  }

  .hazard-card {
    background: rgba(248, 81, 73, 0.08);
    border: 1px solid rgba(248, 81, 73, 0.4);
    border-radius: 6px;
    padding: 10px 12px;
  }

  .hazard-label {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
  }

  .hazard-checkbox {
    margin-top: 2px;
  }

  .hazard-text {
    font-size: 10.5px;
    color: #FF7B72;
    line-height: 1.4;
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

  .modal-btn-danger {
    background: #F85149;
    border: 1px solid #F85149;
    border-radius: 4px;
    color: #FFF;
    font-family: inherit;
    font-size: 10px;
    font-weight: 700;
    padding: 6px 12px;
    cursor: pointer;
  }

  .modal-btn-danger:hover {
    background: #DA3633;
  }

  .modal-btn-danger:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
</style>

