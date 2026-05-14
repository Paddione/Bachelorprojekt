<!-- website/src/components/admin/TicketQuickEdit.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { ListedTicket, TicketPriority, TicketStatus } from '../../lib/tickets/admin';

  export let ticket: ListedTicket;
  export let admins: { id: string, name: string }[] = [];
  export let components: string[] = [];
  export let onSave: (ticket: ListedTicket) => void = () => {};
  export let onClose: () => void = () => {};

  let description = '';
  let component = ticket.component || '';
  let priority = ticket.priority;
  let attentionMode = ticket.attentionMode;
  let dueDate = ticket.dueDate ? new Date(ticket.dueDate).toISOString().split('T')[0] : '';
  let status = ticket.status;
  let assigneeId = ticket.assigneeId || '';

  let busy = false;
  let error = '';

  const isTriage = ticket.status === 'triage';

  onMount(async () => {
    // Fetch full detail to get description
    try {
      const r = await fetch(`/api/admin/tickets/${ticket.id}`);
      if (r.ok) {
        const j = await r.json();
        description = j.ticket.description || '';
      }
    } catch (err) {
      console.error('Failed to load ticket description', err);
    }
  });

  $: aiReadyCheck = (description.trim().length >= 20 && component.trim().length > 0 && !ticket.reporterEmail);
  $: showAiHint = attentionMode === 'auto' && isTriage;

  async function save(transitionToBacklog = false) {
    busy = true;
    error = '';

    const patch: any = {
      description,
      component: component || null,
      priority,
      attentionMode,
      dueDate: dueDate || null,
    };

    if (!isTriage) {
      patch.assigneeId = assigneeId || null;
    }

    try {
      const r = await fetch(`/api/admin/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

      if (!r.ok) {
        const j = await r.json();
        error = j.error || 'Speichern fehlgeschlagen';
        busy = false;
        return;
      }

      if (transitionToBacklog) {
        const tr = await fetch(`/api/admin/tickets/${ticket.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'backlog' }),
        });
        if (!tr.ok) {
          const j = await tr.json();
          error = j.error || 'Übergang zu Backlog fehlgeschlagen';
          busy = false;
          return;
        }
        status = 'backlog';
      }

      onSave({
        ...ticket,
        ...patch,
        status,
        effectiveAttentionMode: attentionMode !== 'auto' 
          ? attentionMode 
          : (aiReadyCheck ? 'ai_ready' : 'needs_human')
      });
      onClose();
    } catch (err) {
      error = 'Netzwerkfehler';
      busy = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="modal-backdrop" on:click|self={onClose}>
  <div class="modal-content">
    <div class="modal-header">
      <h2 class="font-serif">Ticket bearbeiten</h2>
      <button class="close-btn" on:click={onClose}>&times;</button>
    </div>

    <div class="modal-body space-y-4">
      <div class="field">
        <label>Titel</label>
        <div class="read-only">{ticket.title} <span class="mono text-xs">({ticket.externalId || ticket.id.slice(0,8)})</span></div>
      </div>

      {#if !isTriage}
        <div class="grid grid-cols-2 gap-4">
          <div class="field">
            <label>Zuständig</label>
            <select bind:value={assigneeId} disabled={busy}>
              <option value="">— niemand —</option>
              {#each admins as a}
                <option value={a.id}>{a.name}</option>
              {/each}
            </select>
          </div>
          <div class="field">
            <label>Fällig am</label>
            <input type="date" bind:value={dueDate} disabled={busy} />
          </div>
        </div>
      {/if}

      <div class="field">
        <label>Beschreibung {isTriage ? '(erforderlich für AI)' : ''}</label>
        <textarea bind:value={description} rows="4" disabled={busy} placeholder="Was ist zu tun?"></textarea>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="field">
          <label>Komponente {isTriage ? '(erforderlich für AI)' : ''}</label>
          <input list="components-list" bind:value={component} disabled={busy} placeholder="z.B. arena, website..." />
          <datalist id="components-list">
            {#each components as c}
              <option value={c} />
            {/each}
          </datalist>
        </div>
        <div class="field">
          <label>Priorität</label>
          <select bind:value={priority} disabled={busy}>
            <option value="hoch">▲ Hoch</option>
            <option value="mittel">● Mittel</option>
            <option value="niedrig">▼ Niedrig</option>
          </select>
        </div>
      </div>

      {#if isTriage}
        <div class="field">
          <label>Fällig am</label>
          <input type="date" bind:value={dueDate} disabled={busy} />
        </div>
      {/if}

      <div class="field">
        <label>Attention Mode</label>
        <div class="btn-group">
          <button class:active={attentionMode === 'ai_ready'} on:click={() => attentionMode = 'ai_ready'}>🤖 AI-ready</button>
          <button class:active={attentionMode === 'auto'}     on:click={() => attentionMode = 'auto'}>⚙️ Auto</button>
          <button class:active={attentionMode === 'needs_human'} on:click={() => attentionMode = 'needs_human'}>👤 Mensch</button>
        </div>
      </div>

      {#if showAiHint}
        <div class="ai-hint" class:valid={aiReadyCheck}>
          {#if aiReadyCheck}
            ✓ Wird AI-ready beim Speichern
          {:else}
            ⚠ Beschreibung (min. 20 Zeichen) und Komponente fehlen für AI-ready
          {/if}
        </div>
      {/if}

      {#if error}
        <div class="error-msg">{error}</div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn-cancel" on:click={onClose} disabled={busy}>Abbrechen</button>
      {#if isTriage}
        <button class="btn-primary" on:click={() => save(true)} disabled={busy}>Speichern & → Backlog</button>
      {:else}
        <button class="btn-primary" on:click={() => save(false)} disabled={busy}>Speichern</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.8);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
  }
  .modal-content {
    background: #1a2235; border: 1px solid #2a3a52; border-radius: 16px;
    width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
  }
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 24px; border-bottom: 1px solid #2a3a52;
  }
  .modal-header h2 { margin: 0; font-size: 1.25rem; color: #e8e8f0; }
  .close-btn { background: none; border: none; font-size: 1.5rem; color: #aabbcc; cursor: pointer; }
  .modal-body { padding: 24px; }
  .modal-footer {
    display: flex; justify-content: flex-end; gap: 12px;
    padding: 16px 24px; border-top: 1px solid #2a3a52;
  }
  
  .field label { display: block; font-size: 0.75rem; color: #aabbcc; margin-bottom: 4px; }
  .read-only { color: #e8e8f0; font-size: 0.9375rem; padding: 4px 0; }
  input, select, textarea {
    width: 100%; background: #0f1623; border: 1px solid #2a3a52;
    border-radius: 8px; padding: 8px 12px; color: #e8e8f0; font-size: 0.875rem;
  }
  input:focus, select:focus, textarea:focus { outline: 1px solid #e8c870; }
  
  .btn-group { display: flex; border: 1px solid #2a3a52; border-radius: 8px; overflow: hidden; }
  .btn-group button {
    flex: 1; padding: 8px; font-size: 0.75rem; background: #0f1623; color: #aabbcc;
    border: none; border-right: 1px solid #2a3a52; cursor: pointer; transition: all 0.15s;
  }
  .btn-group button:last-child { border-right: none; }
  .btn-group button.active { background: #e8c870; color: #0f1623; font-weight: 600; }
  
  .ai-hint { font-size: 0.75rem; padding: 8px 12px; border-radius: 6px; background: rgba(239,68,68,0.1); color: #f87171; }
  .ai-hint.valid { background: rgba(34,197,94,0.1); color: #4ade80; }
  
  .error-msg { color: #f87171; font-size: 0.75rem; margin-top: 8px; }
  
  .btn-cancel { background: none; border: none; color: #aabbcc; font-size: 0.875rem; cursor: pointer; }
  .btn-primary {
    background: #e8c870; border: none; border-radius: 8px;
    padding: 8px 16px; color: #0f1623; font-weight: 600; font-size: 0.875rem; cursor: pointer;
  }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  
  .mono { font-family: monospace; }
</style>