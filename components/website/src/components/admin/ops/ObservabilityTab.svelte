<script lang="ts">
  import CentralizedLoggingPanel from './CentralizedLoggingPanel.svelte';
  import LogsTab from './LogsTab.svelte';

  export let cluster: string;
  export let grafanaUrl: string;
</script>

<div class="space-y-8">
  <CentralizedLoggingPanel {grafanaUrl} />
  <div class="admin-card">
    <h3 class="pod-heading">Pod-Logs</h3>
    <LogsTab {cluster} />
  </div>
</div>

<style>
  .pod-heading {
    font-weight: 700;
    color: var(--admin-text);
    margin: 0 0 1rem;
  }
</style>
