<script lang="ts">
  import type { FeatureNode, ProductNode } from '../../lib/tickets/cockpit-types';
  import { createTicket } from '../../lib/tickets/cockpit-table-actions';

  export let open = false;
  export let features: FeatureNode[] = [];
  // When products are supplied the feature dropdown groups by product (<optgroup>);
  // otherwise it falls back to a flat list of `features`.
  export let products: ProductNode[] = [];
  export let defaultFeatureId: string | null = null;
  export let onClose: () => void;
  export let onCreated: ((detail: { id?: string }) => void) | undefined = undefined;

  let parentId = '';
  let type = 'task';
  let title = '';
  let description = '';
  let priority = 'mittel';
  let component = '';
  let creating = false;
  let error: string | null = null;

  $: if (open && defaultFeatureId && !parentId) parentId = defaultFeatureId;
  $: if (!open) { parentId = ''; title = ''; description = ''; component = ''; error = null; }
  $: canCreate = title.trim().length > 0 && !creating;

  function close() {
    parentId = '';
    title = '';
    description = '';
    component = '';
    error = null;
    onClose();
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!canCreate) return;
    creating = true; error = null;
    const r = await createTicket({ type, title, priority, description, component,
      parentId: parentId || undefined });
    creating = false;
    if (!r.ok) { error = r.error ?? 'Fehler'; return; }
    title = ''; description = ''; component = '';
    onCreated?.({ id: (r.body as { id?: string } | undefined)?.id });
    close();
  }

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
</script>

<svelte:window on:keydown={onKey} />

{#if open}
  <div class="backdrop" role="presentation" on:click={close}></div>
  <div class="create-modal" data-testid="create-modal" role="dialog" aria-modal="true" aria-label="Ticket erstellen">
    <header><h3>Neues Ticket</h3>
      <button class="close" aria-label="Schließen" on:click={close}>×</button></header>

    <form on:submit={submit}>
      <label>Feature
        <select data-testid="feature-select" bind:value={parentId}>
          <option value="">— kein Feature —</option>
          {#if products.length > 0}
            {#each products as p (p.id)}
              <optgroup label={p.title}>
                {#each p.features as f (f.id)}<option value={f.id}>{f.title}</option>{/each}
              </optgroup>
            {/each}
          {:else}
            {#each features as f (f.id)}<option value={f.id}>{f.title}</option>{/each}
          {/if}
        </select>
      </label>
      <label>Typ
        <select data-testid="type-select" bind:value={type}>
          <option value="task">Aufgabe</option>
          <option value="bug">Bug</option>
          <option value="feature">Feature</option>
          <option value="project">Projekt</option>
        </select>
      </label>
      <label>Titel *
        <input data-testid="create-title" type="text" bind:value={title}
          placeholder="Kurzer Titel…" required />
      </label>
      <label>Beschreibung
        <textarea bind:value={description} rows="3" placeholder="Details…"></textarea>
      </label>
      <label>Priorität
        <select bind:value={priority}>
          <option value="niedrig">Niedrig</option>
          <option value="mittel">Mittel</option>
          <option value="hoch">Hoch</option>
          <option value="kritisch">Kritisch</option>
        </select>
      </label>
      <label>Komponente
        <input type="text" bind:value={component} placeholder="z.B. website, auth…" />
      </label>

      {#if error}<p class="error">{error}</p>{/if}

      <footer>
        <button type="button" on:click={close}>Abbrechen</button>
        <button type="submit" class="primary" data-testid="create-submit" disabled={!canCreate}>
          {creating ? 'Wird erstellt…' : 'Erstellen →'}
        </button>
      </footer>
    </form>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 70; }
  .create-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(480px, 92vw); max-height: 90vh; overflow-y: auto; z-index: 75;
    background: var(--admin-surface, #14171d); border: 1px solid var(--admin-border, #2a2e37);
    border-radius: 12px; padding: 1rem; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .close { background: none; border: none; color: inherit; font-size: 1.4rem; cursor: pointer; }
  form { display: flex; flex-direction: column; gap: 0.6rem; }
  label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; color: var(--admin-text-mute, #9ca3af); }
  input, select, textarea { background: var(--admin-bg, #1c1f26); border: 1px solid var(--admin-border, #2a2e37);
    color: var(--admin-text, #e5e7eb); border-radius: 6px; padding: 0.4rem 0.55rem; font: inherit; }
  .error { color: #ef4444; font-size: 0.82rem; margin: 0; }
  footer { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem; }
  .primary { background: var(--admin-primary, #818cf8); color: var(--admin-bg, #0b0d12); border: none;
    border-radius: 6px; padding: 0.45rem 0.9rem; cursor: pointer; font-weight: 600; }
  .primary:disabled { opacity: 0.4; cursor: not-allowed; }
  button { background: var(--admin-bg, #1c1f26); border: 1px solid var(--admin-border, #2a2e37);
    color: inherit; border-radius: 6px; padding: 0.45rem 0.9rem; cursor: pointer; }

  @media (max-width: 767px) {
    .create-modal { top: auto; bottom: 0; left: 0; transform: none;
      width: 100%; max-height: 85vh; border-radius: 12px 12px 0 0; }
  }
</style>
