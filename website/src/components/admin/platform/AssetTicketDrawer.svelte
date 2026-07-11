<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import AdminDrawer from '../ui/AdminDrawer.svelte';

  const dispatch = createEventDispatcher();

  let { slug }: { slug: string } = $props();

  interface AssetTicket {
    id: string;
    external_id: string;
    title: string;
    status: string;
    created_at: string;
  }

  let tickets: AssetTicket[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);
  let open = $state(true);

  // Guard against double-invocation: AdminDrawer calls `onclose` for every
  // native dismissal path (Escape, backdrop, dialog.close()) in addition to
  // the explicit header × button calling this function directly.
  function close() {
    if (!open) return;
    open = false;
    dispatch('close');
  }

  async function loadTickets() {
    loading = true;
    try {
      const res = await fetch(`/api/admin/platform/assets/${slug}/tickets`);
      if (!res.ok) throw new Error('Failed to fetch tickets');
      const data = await res.json();
      tickets = data.tickets;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(loadTickets);
</script>

{#snippet drawerBody()}
  <div class="tickets-panel">
    <p class="hint">Tickets mit Tag <code class="text-admin-primary">component:{slug}</code></p>

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
{/snippet}

{#snippet drawerFooter()}
  <a
    href="/admin/bugs"
    class="block w-full py-3 bg-admin-bg border border-admin-border rounded-xl text-center text-sm font-bold text-white hover:border-admin-primary/30 transition-all"
  >
    Alle Tickets anzeigen
  </a>
{/snippet}

<AdminDrawer
  bind:open
  title="Verknüpfte Tickets"
  onclose={close}
  body={drawerBody}
  footer={drawerFooter}
/>

<style>
  .tickets-panel { display: flex; flex-direction: column; gap: 1rem; }
  .hint { font-size: 0.75rem; color: var(--admin-text-mute, #71717a); }
</style>
