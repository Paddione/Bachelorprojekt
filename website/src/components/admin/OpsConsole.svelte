<script lang="ts">
  import { onMount } from 'svelte';
  import GesundheitTab from './ops/GesundheitTab.svelte';
  import DienstTab from './ops/DienstTab.svelte';
  import LogsTab from './ops/LogsTab.svelte';
  import ArgoCDOpsTab from './ops/ArgoCDOpsTab.svelte';
  import DatenbankTab from './ops/DatenbankTab.svelte';
  import DnsZertTab from './ops/DnsZertTab.svelte';

  type Tab = 'gesundheit' | 'dienste' | 'logs' | 'argocd' | 'datenbank' | 'dns';
  const VALID_TABS: Tab[] = ['gesundheit', 'dienste', 'logs', 'argocd', 'datenbank', 'dns'];

  let activeTab: Tab = 'gesundheit';

  onMount(() => {
    const hash = location.hash.slice(1) as Tab;
    if (VALID_TABS.includes(hash)) activeTab = hash;
  });

  function setTab(tab: Tab) {
    activeTab = tab;
    history.replaceState(null, '', `#${tab}`);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'gesundheit', label: '🩺 Gesundheit' },
    { id: 'dienste',    label: '🔄 Dienste' },
    { id: 'logs',       label: '📋 Logs' },
    { id: 'argocd',     label: '🚀 ArgoCD' },
    { id: 'datenbank',  label: '💾 Datenbank' },
    { id: 'dns',        label: '🌐 DNS & Zertifikate' },
  ];
</script>

<div class="space-y-0">
  <div class="flex border-b border-gray-700 bg-gray-950 -mx-4 px-4 sm:-mx-6 sm:px-6 overflow-x-auto">
    {#each tabs as tab}
      <button
        on:click={() => setTab(tab.id)}
        class="px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === tab.id
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div class="pt-5">
    {#if activeTab === 'gesundheit'}
      <GesundheitTab />
    {:else if activeTab === 'dienste'}
      <DienstTab />
    {:else if activeTab === 'logs'}
      <LogsTab />
    {:else if activeTab === 'argocd'}
      <ArgoCDOpsTab />
    {:else if activeTab === 'datenbank'}
      <DatenbankTab />
    {:else if activeTab === 'dns'}
      <DnsZertTab />
    {/if}
  </div>
</div>
