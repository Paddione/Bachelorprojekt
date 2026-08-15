<script lang="ts">
  import ReleasesTab from './ReleasesTab.svelte';
  import BackupsTab from './BackupsTab.svelte';
  import UsersTab from './UsersTab.svelte';
  import KnowledgeTab from './KnowledgeTab.svelte';
  import AuditLog from './AuditLog.svelte';

  export let cluster: string;

  type SubTab = 'releases' | 'backups' | 'users' | 'knowledge' | 'audit';
  let activeSubTab: SubTab = 'releases';

  const subTabs: { id: SubTab; label: string }[] = [
    { id: 'releases',  label: 'Releases' },
    { id: 'backups',   label: 'Backups' },
    { id: 'users',     label: 'Anwender' },
    { id: 'knowledge', label: 'Wissens-Index' },
    { id: 'audit',     label: 'Verlauf' },
  ];
</script>

<div class="space-y-6">
  <div style="overflow-x: auto; padding-bottom: 2px;">
    <div class="flex gap-1 p-1 bg-admin-sidebar-bg border border-admin-border rounded-2xl w-fit" style="flex-wrap: nowrap;">
      {#each subTabs as t}
        <button
          on:click={() => activeSubTab = t.id}
          class="px-4 py-2 rounded-xl text-sm font-bold transition-all {activeSubTab === t.id ? 'bg-admin-primary text-admin-bg' : 'text-admin-text-mute hover:text-white'}"
          style="white-space: nowrap; min-height: 44px;"
          data-testid="aktionen-subtab-{t.id}"
        >
          {t.label}
        </button>
      {/each}
    </div>
  </div>

  <main>
    {#if activeSubTab === 'releases'}<ReleasesTab {cluster} />
    {:else if activeSubTab === 'backups'}<BackupsTab {cluster} />
    {:else if activeSubTab === 'users'}<UsersTab />
    {:else if activeSubTab === 'knowledge'}<KnowledgeTab {cluster} />
    {:else if activeSubTab === 'audit'}<AuditLog />{/if}
  </main>
</div>
