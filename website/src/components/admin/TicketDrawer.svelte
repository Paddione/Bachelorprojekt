<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  export let ticket: TicketRowT | null;
  export let open = false;
  // Svelte 5 callback props for testing + parent use
  export let onClose: (() => void) | undefined = undefined;
  export let onMutated: ((detail: { ticketId: string }) => void) | undefined = undefined;
  const dispatch = createEventDispatcher();

  let title = ''; let saving = false; let error: string | null = null;
  $: if (ticket) title = ticket.title;

  function close() {
    onClose?.();
    dispatch('close');
  }

  async function save() {
    if (!ticket) return;
    const old = ticket.title; saving = true; error = null;
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      const detail = { ticketId: ticket.id };
      onMutated?.(detail);
      dispatch('mutated', detail);
    } catch (e) { title = old; error = String((e as Error).message); }
    finally { saving = false; }
  }

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
</script>

<svelte:window on:keydown={onKey} />

{#if open && ticket}
  <div class="backdrop" on:click={close} role="presentation"></div>
  <aside class="drawer" data-testid="ticket-drawer" aria-label="Ticket-Details">
    <header>
      <h3>{ticket.extId}</h3>
      <button class="close" aria-label="Schließen" on:click={close}>×</button>
    </header>
    {#if error}<p class="error">{error}</p>{/if}
    <label>Titel<input bind:value={title} /></label>
    <!-- Comments / Links / Attachments reuse existing endpoints
         (/comments, /links, /attachments) — added via sub-forms if needed. -->
    <footer>
      <button class="primary" on:click={save} disabled={saving}>Speichern</button>
      <button on:click={close}>Abbrechen</button>
    </footer>
  </aside>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 40; }
  .drawer { position: fixed; top: 0; right: 0; height: 100%; width: min(420px, 90vw);
    background: #14171d; z-index: 50; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
  header { display: flex; justify-content: space-between; align-items: center; }
  .close { background: none; border: none; color: inherit; font-size: 1.4rem; cursor: pointer; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
  input { background: #1c1f26; border: 1px solid #2a2e37; color: inherit; padding: 0.4rem; border-radius: 4px; }
  .error { color: #ef4444; font-size: 0.85rem; }
  footer { margin-top: auto; display: flex; gap: 0.5rem; }
  .primary { background: #6ea8fe; color: #0b0d12; border: none; padding: 0.4rem 0.9rem; border-radius: 4px; cursor: pointer; }
</style>
