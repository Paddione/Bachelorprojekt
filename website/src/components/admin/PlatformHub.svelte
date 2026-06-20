<script lang="ts">
  import SoftwareTab from './platform/SoftwareTab.svelte';
  import HardwareTab from './platform/HardwareTab.svelte';
  import HealthTab from './platform/HealthTab.svelte';
  import AktionenTab from './aktionen/AktionenTab.svelte';
  import DienstTab from './ops/DienstTab.svelte';
  import ObservabilityTab from './ops/ObservabilityTab.svelte';
  import DatenbankTab from './ops/DatenbankTab.svelte';
  import DnsZertTab from './ops/DnsZertTab.svelte';
  import BackupStatusCard from './platform/BackupStatusCard.svelte';

  export let cluster: string;
  export let grafanaUrl: string;

  let activeTab = 'software';

  const tabs = [
    { id: 'software', label: 'Software', premium: true },
    { id: 'hardware', label: 'Hardware' },
    { id: 'health', label: 'Integrität', premium: true },
    { id: 'dienste', label: 'Dienste' },
    { id: 'aktionen', label: 'Aktionen' },
    { id: 'logs', label: 'Observability' },
    { id: 'db', label: 'Datenbank' },
    { id: 'dns', label: 'Netzwerk' }
  ];
</script>

<div class="p-6 max-w-7xl mx-auto">
  <div class="tab-scroll">
    <div class="tab-bar">
      {#each tabs as tab}
        <button
          on:click={() => activeTab = tab.id}
          class="tab"
          class:tab-active={activeTab === tab.id}
        >
          {tab.label}
          {#if tab.premium}
            <span class="tab-premium">✨</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <main class="transition-all duration-300">
    {#if activeTab === 'software'}
      <SoftwareTab {cluster} />
    {:else if activeTab === 'hardware'}
      <HardwareTab {cluster} />
    {:else if activeTab === 'health'}
      <HealthTab {cluster} />
    {:else if activeTab === 'dienste'}
      <div class="admin-card">
        <DienstTab {cluster} />
      </div>
    {:else if activeTab === 'aktionen'}
      <div class="admin-card">
        <AktionenTab {cluster} />
      </div>
    {:else if activeTab === 'logs'}
      <ObservabilityTab {cluster} {grafanaUrl} />
    {:else if activeTab === 'db'}
      <div class="admin-card">
        <DatenbankTab {cluster} />
      </div>
    {:else if activeTab === 'dns'}
      <div class="admin-card">
        <DnsZertTab />
      </div>
    {/if}
  </main>
  
  <footer class="mt-12 pt-8 border-t border-admin-border grid grid-cols-1 md:grid-cols-4 gap-6">
    <BackupStatusCard {cluster} />
    <a href="/admin/software-history" class="p-4 rounded-2xl bg-admin-surface border border-admin-border hover:border-admin-primary/30 transition-all group">
      <h4 class="text-sm font-bold text-white group-hover:text-admin-primary">Software-History</h4>
      <p class="text-xs text-admin-text-mute">Versionsverlauf der Plattform-Komponenten.</p>
    </a>
    <a href="/admin/systemtest/board" class="p-4 rounded-2xl bg-admin-surface border border-admin-border hover:border-admin-primary/30 transition-all group">
      <h4 class="text-sm font-bold text-white group-hover:text-admin-primary">Systemtest Board</h4>
      <p class="text-xs text-admin-text-mute">Automatisierte E2E-Testergebnisse.</p>
    </a>
    <a href="/admin/bugs" class="p-4 rounded-2xl bg-admin-surface border border-admin-border hover:border-admin-primary/30 transition-all group">
      <h4 class="text-sm font-bold text-white group-hover:text-admin-primary">Fehlermeldungen</h4>
      <p class="text-xs text-admin-text-mute">Interne Tickets und Debug-Logs.</p>
    </a>
  </footer>
</div>

<style>
  .tab-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
  }
  .tab-bar {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.25rem;
    width: fit-content;
    margin-bottom: 2rem;
    padding: 0.25rem;
    border-radius: 1rem;
    background: var(--admin-sidebar-bg);
    border: 1px solid var(--admin-border);
  }
  .tab {
    white-space: nowrap;
    min-height: 44px;
    padding: 0.5rem 1.25rem;
    border-radius: 0.75rem;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--admin-text-mute);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: color 0.2s ease, background 0.2s ease;
  }
  .tab:hover {
    color: var(--admin-text);
  }
  .tab-active {
    background: var(--admin-primary);
    color: var(--admin-bg);
  }
  .tab-premium {
    margin-left: 0.25rem;
    font-size: 0.5rem;
    opacity: 0.5;
  }
</style>
