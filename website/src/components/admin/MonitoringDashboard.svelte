<script lang="ts">
  import { onMount } from 'svelte';
  import ClusterTab from './monitoring/ClusterTab.svelte';
  import DeploymentsTab from './monitoring/DeploymentsTab.svelte';
  import TestsTab from './monitoring/TestsTab.svelte';

  // Tab components (imported once each sub-component is created)
  // import OverviewTab from './monitoring/OverviewTab.svelte';
  // import BerichteTab from './monitoring/BerichteTab.svelte';

  type Tab = 'overview' | 'cluster' | 'tests' | 'deployments' | 'berichte';

  let activeTab: Tab = 'overview';

  // Allow deep-linking via hash: /admin/monitoring#tests
  onMount(() => {
    const hash = location.hash.slice(1) as Tab;
    if (['overview', 'cluster', 'tests', 'deployments', 'berichte'].includes(hash)) {
      activeTab = hash;
    }
  });

  function setTab(tab: Tab) {
    activeTab = tab;
    history.replaceState(null, '', `#${tab}`);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'cluster', label: 'Cluster' },
    { id: 'tests', label: 'Tests' },
    { id: 'deployments', label: 'Deployments' },
    { id: 'berichte', label: 'Berichte' },
  ];
</script>

<div class="space-y-0">
  <!-- Tab bar -->
  <div class="flex border-b border-gray-700 bg-gray-950 -mx-4 px-4 sm:-mx-6 sm:px-6">
    {#each tabs as tab}
      <button
        on:click={() => setTab(tab.id)}
        class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === tab.id
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Tab content -->
  <div class="pt-5">
    {#if activeTab === 'overview'}
      <p class="text-muted text-sm">OverviewTab — coming in next task</p>
      <!-- <OverviewTab on:navigate={(e) => setTab(e.detail)} /> -->
    {:else if activeTab === 'cluster'}
      <ClusterTab />
    {:else if activeTab === 'tests'}
      <TestsTab />
    {:else if activeTab === 'deployments'}
      <DeploymentsTab />
    {:else if activeTab === 'berichte'}
      <p class="text-muted text-sm">BerichteTab — coming in next task</p>
      <!-- <BerichteTab /> -->
    {/if}
  </div>
</div>
