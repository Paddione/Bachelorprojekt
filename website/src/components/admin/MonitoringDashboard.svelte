<script lang="ts">
  import { onMount } from 'svelte';
  import ClusterTab from './monitoring/ClusterTab.svelte';
  import DeploymentsTab from './monitoring/DeploymentsTab.svelte';
  import OverviewTab from './monitoring/OverviewTab.svelte';
  import BugsTab from './monitoring/BugsTab.svelte';
  import TrackingTab from './monitoring/TrackingTab.svelte';
  import ArgoCDTab from './monitoring/ArgoCDTab.svelte';
  import LogsTab from './monitoring/LogsTab.svelte';

  export let trackingUrl: string = '';

  type Tab = 'overview' | 'cluster' | 'deployments' | 'argocd' | 'logs' | 'bugs' | 'tracking';

  let activeTab: Tab = 'overview';
  const VALID_TABS: Tab[] = ['overview', 'cluster', 'deployments', 'argocd', 'logs', 'bugs', 'tracking'];

  onMount(() => {
    const hash = location.hash.slice(1) as Tab;
    if (VALID_TABS.includes(hash)) {
      activeTab = hash;
    }
  });

  function setTab(tab: Tab) {
    activeTab = tab;
    history.replaceState(null, '', `#${tab}`);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview',     label: 'Übersicht' },
    { id: 'cluster',      label: 'Cluster' },
    { id: 'deployments',  label: 'Deployments' },
    { id: 'argocd',       label: 'ArgoCD' },
    { id: 'logs',         label: 'Logs' },
    { id: 'bugs',         label: 'Bugs' },
    { id: 'tracking',     label: 'Tracking' },
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
      <OverviewTab on:navigate={(e) => setTab(e.detail)} />
    {:else if activeTab === 'cluster'}
      <ClusterTab />
    {:else if activeTab === 'deployments'}
      <DeploymentsTab />
    {:else if activeTab === 'argocd'}
      <ArgoCDTab />
    {:else if activeTab === 'logs'}
      <LogsTab />
    {:else if activeTab === 'bugs'}
      <BugsTab />
    {:else if activeTab === 'tracking'}
      <TrackingTab {trackingUrl} />
    {/if}
  </div>
</div>
