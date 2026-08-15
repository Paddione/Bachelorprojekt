<script lang="ts">
  import { onMount } from 'svelte';
  import { apiCall } from '../../../lib/admin-api';

  export let filter: string | undefined = undefined;
  export let limit = 50;
  export let compact = false;

  type Action = {
    id: number;
    actor: string;
    action: string;
    target?: string;
    cluster?: string;
    status: 'in_progress' | 'success' | 'failed' | 'partial_success';
    error?: string;
    created_at: string;
    completed_at?: string;
    payload?: unknown;
  };

  let actions: Action[] = [];
  let loading = true;
  let actionFilter = filter ?? '';
  let detailModal: Action | null = null;

  const STATUS_ICON = {
    in_progress: '🟡', success: '🟢', failed: '🔴', partial_success: '🟠',
  } as const;

  const ACTION_LABEL: Record<string, string> = {
    redeploy_website: 'Website neu laden', redeploy_docs: 'Docs neu laden', redeploy_brett: 'Brett neu laden',
    backup_create: 'Backup erstellen', backup_restore: 'Backup wiederherstellen',
    user_create: 'Anwender anlegen',
    ai_reindex: 'Wissens-Index reindexieren',
  };

  async function load() {
    loading = true;
    const url = `/api/admin/ops/audit/log?limit=${limit}${actionFilter ? `&action_filter=${encodeURIComponent(actionFilter)}` : ''}`;
    const r = await apiCall<{ actions: Action[] }>(url);
    actions = r.ok ? r.data.actions : [];
    loading = false;
  }

  function label(a: string): string {
    return ACTION_LABEL[a] ?? a;
  }

  onMount(load);
</script>

<div class="space-y-4">
  {#if !compact}
    <div class="flex flex-wrap items-center gap-2">
      <select bind:value={actionFilter} on:change={load} class="px-3 py-2 rounded-lg bg-admin-surface border border-admin-border text-white" style="min-height: 44px;">
        <option value="">Alle Aktionen</option>
        {#each Object.entries(ACTION_LABEL) as [k, v]}
          <option value={k}>{v}</option>
        {/each}
      </select>
      <button on:click={load} class="px-3 py-2 rounded-lg bg-admin-surface border border-admin-border text-admin-text-mute hover:text-white" style="min-height: 44px;">Aktualisieren</button>
    </div>
  {/if}

  {#if loading}
    <p class="text-admin-text-mute">Lade…</p>
  {:else if actions.length === 0}
    <p class="text-admin-text-mute">Noch keine Aktionen.</p>
  {:else}
    <table class="w-full text-sm">
      <thead class="text-admin-text-mute text-xs uppercase">
        <tr>
          <th class="text-left p-2">Datum</th>
          <th class="text-left p-2">Actor</th>
          <th class="text-left p-2">Aktion</th>
          <th class="text-left p-2">Target</th>
          <th class="text-left p-2">Status</th>
          <th class="text-left p-2"></th>
        </tr>
      </thead>
      <tbody>
        {#each actions as a}
          <tr class="border-t border-admin-border">
            <td class="p-2 text-xs">{new Date(a.created_at).toLocaleString('de-DE')}</td>
            <td class="p-2">{a.actor}</td>
            <td class="p-2">{label(a.action)}</td>
            <td class="p-2 text-xs">{a.target ?? '—'}</td>
            <td class="p-2">{STATUS_ICON[a.status]} {a.status}</td>
            <td class="p-2"><button on:click={() => detailModal = a} class="text-admin-primary hover:text-white text-xs">Details</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if detailModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" on:click={() => detailModal = null}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="bg-admin-surface p-6 rounded-2xl border border-admin-border max-w-2xl w-full" on:click|stopPropagation>
      <h3 class="text-lg font-bold text-white mb-3">Details</h3>
      <dl class="space-y-2 text-sm">
        <div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Datum</dt><dd class="col-span-2 text-white">{new Date(detailModal.created_at).toLocaleString('de-DE')}</dd></div>
        <div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Actor</dt><dd class="col-span-2 text-white">{detailModal.actor}</dd></div>
        <div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Aktion</dt><dd class="col-span-2 text-white">{label(detailModal.action)}</dd></div>
        <div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Target</dt><dd class="col-span-2 text-white">{detailModal.target ?? '—'}</dd></div>
        <div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Status</dt><dd class="col-span-2 text-white">{STATUS_ICON[detailModal.status]} {detailModal.status}</dd></div>
        {#if detailModal.error}<div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Fehler</dt><dd class="col-span-2 text-red-400 text-xs whitespace-pre-wrap">{detailModal.error}</dd></div>{/if}
        {#if detailModal.payload}<div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Payload</dt><dd class="col-span-2 text-xs"><pre class="bg-admin-bg p-2 rounded overflow-x-auto">{JSON.stringify(detailModal.payload, null, 2)}</pre></dd></div>{/if}
      </dl>
      <div class="flex justify-end mt-4">
        <button on:click={() => detailModal = null} class="px-4 py-2 rounded-lg bg-admin-surface border border-admin-border text-admin-text-mute">Schließen</button>
      </div>
    </div>
  </div>
{/if}
