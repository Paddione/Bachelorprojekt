<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { SoftwareAsset } from '../../../lib/platform-db';
  const dispatch = createEventDispatcher();

  export let asset: Partial<SoftwareAsset> & { clusters: string[] };

  let loading = false;
  let error: string | null = null;

  async function save() {
    loading = true;
    error = null;
    try {
      const method = asset.id ? 'PUT' : 'POST';
      const url = asset.id ? `/api/admin/platform/software/${asset.id}` : '/api/admin/platform/software';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asset)
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Speichern');
      }
      
      dispatch('save');
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  const categories = [
    { id: 'frontend', label: 'Frontend' },
    { id: 'auth', label: 'Auth / Identity' },
    { id: 'storage', label: 'Storage / Files' },
    { id: 'messaging', label: 'Messaging' },
    { id: 'security', label: 'Security' },
    { id: 'dev', label: 'Dev / Ops' },
    { id: 'other', label: 'Sonstiges' }
  ];

  const clusters = ['mentolder', 'korczewski'];
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-admin-bg/80 backdrop-blur-md">
  <div class="admin-card w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border-admin-primary/20">
    <header class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold text-white">{asset.id ? 'Asset bearbeiten' : 'Neues Asset'}</h2>
      <button on:click={() => dispatch('close')} class="text-admin-text-mute hover:text-white transition-all text-2xl">&times;</button>
    </header>

    {#if error}
      <div class="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
        {error}
      </div>
    {/if}

    <form on:submit|preventDefault={save} class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-2">
          <label class="text-xs font-bold text-admin-text-mute uppercase">Name</label>
          <input type="text" bind:value={asset.name} required class="admin-input w-full" placeholder="z.B. Nextcloud" />
        </div>
        <div class="space-y-2">
          <label class="text-xs font-bold text-admin-text-mute uppercase">Slug (ID)</label>
          <input type="text" bind:value={asset.slug} required class="admin-input w-full" placeholder="z.B. nextcloud" disabled={!!asset.id} />
        </div>
      </div>

      <div class="space-y-2">
        <label class="text-xs font-bold text-admin-text-mute uppercase">Beschreibung</label>
        <textarea bind:value={asset.description} class="admin-input w-full h-20" placeholder="Kurze Beschreibung des Assets..."></textarea>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="space-y-2">
          <label class="text-xs font-bold text-admin-text-mute uppercase">Kategorie</label>
          <select bind:value={asset.category} class="admin-input w-full">
            {#each categories as cat}
              <option value={cat.id}>{cat.label}</option>
            {/each}
          </select>
        </div>
        <div class="space-y-2">
          <label class="text-xs font-bold text-admin-text-mute uppercase">Emoji</label>
          <input type="text" bind:value={asset.emoji} class="admin-input w-full" />
        </div>
        <div class="space-y-2">
          <label class="text-xs font-bold text-admin-text-mute uppercase">Sortierung</label>
          <input type="number" bind:value={asset.sort_order} class="admin-input w-full" />
        </div>
      </div>

      <div class="p-4 bg-admin-bg/50 rounded-2xl border border-admin-border space-y-4">
        <h3 class="text-sm font-bold text-white border-b border-admin-border pb-2 mb-2">Kubernetes Verknüpfung</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="text-xs font-bold text-admin-text-mute uppercase">Namespace</label>
            <input type="text" bind:value={asset.namespace} class="admin-input w-full font-mono text-[10px]" placeholder="workspace" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-bold text-admin-text-mute uppercase">Deployment Name</label>
            <input type="text" bind:value={asset.deployment_name} class="admin-input w-full font-mono text-[10px]" placeholder="nextcloud" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="text-xs font-bold text-admin-text-mute uppercase">Subdomain</label>
            <input type="text" bind:value={asset.subdomain} class="admin-input w-full font-mono text-[10px]" placeholder="z.B. auth" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-bold text-admin-text-mute uppercase">URL-Override</label>
            <input type="text" bind:value={asset.url} class="admin-input w-full font-mono text-[10px]" placeholder="https://… (überschreibt Subdomain)" />
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-bold text-admin-text-mute uppercase">Health-URL (Template, {'{ns}'} erlaubt)</label>
          <input type="text" bind:value={asset.health_url} class="admin-input w-full font-mono text-[10px]" placeholder="http://svc.{'{ns}'}.svc.cluster.local/health" />
        </div>

        <div class="space-y-2">
          <label class="text-xs font-bold text-admin-text-mute uppercase">Aktiv auf Clustern</label>
          <div class="flex gap-4">
            {#each clusters as c}
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={asset.clusters.includes(c)} on:change={(e) => {
                  if (e.currentTarget.checked) asset.clusters = [...asset.clusters, c];
                  else asset.clusters = asset.clusters.filter(x => x !== c);
                }} />
                <span class="text-sm text-white capitalize">{c}</span>
              </label>
            {/each}
          </div>
        </div>
      </div>

      <footer class="flex justify-end gap-3 pt-4 border-t border-admin-border">
        <button type="button" on:click={() => dispatch('close')} class="px-6 py-2 rounded-xl text-sm font-bold text-admin-text-mute hover:text-white transition-all">Abbrechen</button>
        <button type="submit" disabled={loading} class="px-8 py-2 bg-admin-primary text-admin-bg rounded-xl font-bold hover:scale-105 transition-all disabled:opacity-50">
          {loading ? 'Speichere...' : 'Speichern'}
        </button>
      </footer>
    </form>
  </div>
</div>
