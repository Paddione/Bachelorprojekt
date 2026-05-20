<script lang="ts">
  import SoftwareTab from './platform/SoftwareTab.svelte';
  import HardwareTab from './platform/HardwareTab.svelte';
  import HealthTab from './platform/HealthTab.svelte';
  import FluxCDTab from './platform/FluxCDTab.svelte';
  import DienstTab from './ops/DienstTab.svelte';
  import LogsTab from './ops/LogsTab.svelte';
  import DatenbankTab from './ops/DatenbankTab.svelte';
  import DnsZertTab from './ops/DnsZertTab.svelte';
  
  export let cluster: string;
  
  let activeTab = 'flux';
  
  const tabs = [
    { id: 'flux', label: 'GitOps', premium: true },
    { id: 'software', label: 'Software', premium: true },
    { id: 'hardware', label: 'Hardware' },
    { id: 'health', label: 'Integrität', premium: true },
    { id: 'dienste', label: 'Dienste' },
    { id: 'logs', label: 'Logs' },
    { id: 'db', label: 'Datenbank' },
    { id: 'dns', label: 'Netzwerk' }
  ];
</script>

<div class="p-6 max-w-7xl mx-auto">
  <header class="mb-10">
    <div class="flex items-center gap-3 mb-2">
      <span class="px-2 py-0.5 rounded-full bg-admin-primary/10 border border-admin-primary/20 text-[10px] font-bold text-admin-primary uppercase tracking-wider">{cluster} node</span>
      <h1 class="text-4xl font-extrabold text-white tracking-tight">Platform Control Center</h1>
    </div>
    <p class="text-admin-text-mute">Zentralisierte Steuerung der Multicluster-Infrastruktur und GitOps-Pipelines.</p>
  </header>

  <div class="flex flex-wrap gap-1 p-1 bg-admin-sidebar-bg backdrop-blur-xl border border-admin-border rounded-2xl w-fit mb-8">
    {#each tabs as tab}
      <button 
        on:click={() => activeTab = tab.id}
        class="px-5 py-2 rounded-xl text-sm font-bold transition-all {activeTab === tab.id ? 'bg-admin-primary text-admin-bg shadow-lg' : 'text-admin-text-mute hover:text-white'}"
      >
        {tab.label}
        {#if tab.premium}
          <span class="ml-1 text-[8px] opacity-50">✨</span>
        {/if}
      </button>
    {/each}
  </div>

  <main class="transition-all duration-300">
    {#if activeTab === 'flux'}
      <FluxCDTab {cluster} />
    {:else if activeTab === 'software'}
      <SoftwareTab {cluster} />
    {:else if activeTab === 'hardware'}
      <HardwareTab {cluster} />
    {:else if activeTab === 'health'}
      <HealthTab {cluster} />
    {:else if activeTab === 'dienste'}
      <div class="admin-card">
        <DienstTab />
      </div>
    {:else if activeTab === 'logs'}
      <div class="admin-card">
        <LogsTab />
      </div>
    {:else if activeTab === 'db'}
      <div class="admin-card">
        <DatenbankTab />
      </div>
    {:else if activeTab === 'dns'}
      <div class="admin-card">
        <DnsZertTab />
      </div>
    {/if}
  </main>
  
  <footer class="mt-12 pt-8 border-t border-admin-border grid grid-cols-1 md:grid-cols-3 gap-6">
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
