<script lang="ts">
  import CentralizedLoggingPanel from './CentralizedLoggingPanel.svelte';
  import LogsTab from './LogsTab.svelte';

  export let cluster: string;
  export let grafanaUrl: string;
</script>

<div class="observability-tab-stack">
  <CentralizedLoggingPanel {grafanaUrl} />
  
  <div class="logs-chassis">
    <div class="logs-header">
      <div class="logs-title-group">
        <span class="screw-head"></span>
        <h3 class="pod-heading">POD KERNEL & STDOUT BUFFER</h3>
      </div>
      <span class="logs-sub">LIVE STREAMING · DEVMESH TAILNET BUS</span>
    </div>
    <LogsTab {cluster} />
  </div>
</div>

<style>
  .observability-tab-stack {
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }

  .logs-chassis {
    background: #0E131B;
    border: 1px solid #1E2634;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .logs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #1E2634;
    padding-bottom: 12px;
  }

  .logs-title-group {
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

  .pod-heading {
    font-size: 12px;
    font-weight: 700;
    color: #F0F6FC;
    letter-spacing: 0.08em;
    margin: 0;
  }

  .logs-sub {
    font-size: 9.5px;
    color: #8B949E;
    letter-spacing: 0.05em;
  }
</style>

