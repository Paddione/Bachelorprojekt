<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  export let slug: string;

  interface AssetTicket {
    id: string;
    external_id: string;
    title: string;
    status: string;
    created_at: string;
  }

  let tickets: AssetTicket[] = [];
  let loading = true;
  let error: string | null = null;

  async function loadTickets() {
    loading = true;
    try {
      const res = await fetch(`/api/admin/platform/assets/${slug}/tickets`);
      if (!res.ok) throw new Error('Failed to fetch tickets');
      const data = await res.json();
      tickets = data.tickets;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  onMount(loadTickets);
</script>

<div class="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-admin-sidebar-bg border-l border-admin-border shadow-2xl backdrop-blur-xl flex flex-col">
  <header class="p-6 border-b border-admin-border flex justify-between items-center">
    <div>
      <h3 class="text-xl font-bold text-white">Verknüpfte Tickets</h3>
      <p class="text-xs text-admin-text-mute">Tickets mit Tag <code class="text-admin-primary">component:{slug}</code></p>
    </div>
    <button on:click={() => dispatch('close')} class="text-admin-text-mute hover:text-white transition-all text-2xl">&times;</button>
  </header>

  <div class="flex-1 overflow-y-auto p-6 space-y-4">
    {#if loading}
      {#each Array(3) as _}
        <div class="h-24 bg-admin-surface rounded-2xl animate-pulse"></div>
      {/each}
    {:else if error}
      <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
        {error}
      </div>
    {:else if tickets.length === 0}
      <div class="text-center py-12">
        <div class="text-4xl mb-4 grayscale">🎫</div>
        <p class="text-admin-text-mute text-sm">Keine Tickets für diese Komponente gefunden.</p>
      </div>
    {:else}
      {#each tickets as ticket}
        <a 
          href="/admin/tickets/{ticket.external_id}" 
          class="block p-4 bg-admin-surface border border-admin-border rounded-2xl hover:border-admin-primary/50 transition-all group"
        >
          <div class="flex justify-between items-start mb-2">
            <span class="text-[10px] font-bold text-admin-primary font-mono">{ticket.external_id}</span>
            <span class="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider {ticket.status === 'done' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}">
              {ticket.status}
            </span>
          </div>
          <h4 class="text-sm font-bold text-white group-hover:text-admin-primary transition-all line-clamp-2">{ticket.title}</h4>
          <p class="text-[10px] text-admin-text-mute mt-2">
            Erstellt am {new Date(ticket.created_at).toLocaleDateString('de-DE')}
          </p>
        </a>
      {/each}
    {/if}
  </div>

  <footer class="p-6 border-t border-admin-border bg-admin-bg/50">
    <a 
      href="/admin/bugs" 
      class="block w-full py-3 bg-admin-bg border border-admin-border rounded-xl text-center text-sm font-bold text-white hover:border-admin-primary/30 transition-all"
    >
      Alle Tickets anzeigen
    </a>
  </footer>
</div>

<div class="fixed inset-0 z-40 bg-admin-bg/20 backdrop-blur-[1px]" on:click={() => dispatch('close')}></div>
