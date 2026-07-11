<script lang="ts">
  import AdminModal from './ui/AdminModal.svelte';

  type Props = {
    invoiceId: string;
    invoiceNumber: string;
    outstanding: number;
    onClose: () => void;
    onSaved: () => void;
  };

  const { invoiceId, invoiceNumber, outstanding, onClose, onSaved }: Props = $props();

  let open = $state(true);
  let paidAt = $state(new Date().toISOString().split('T')[0]);
  let amount = $state(outstanding);
  let method: 'sepa'|'cash'|'bank'|'other' = $state('bank');
  let reference = $state('');
  let notes = $state('');
  let saving = $state(false);
  let error = $state('');

  function close() {
    // Guard against double-invocation: the AdminModal primitive calls `onclose`
    // for every native close path (Escape, backdrop, dialog.close()), and this
    // function is also wired as the explicit "Abbrechen" handler — without the
    // `!open` check the parent's onClose() could fire twice for one dismissal.
    if (saving || !open) return;
    open = false;
    onClose();
  }

  async function save() {
    if (amount === 0) { error = 'Betrag darf nicht 0 sein.'; return; }
    if (amount < 0 && !notes) { error = 'Negative Buchung erfordert Notiz.'; return; }
    saving = true; error = '';
    const res = await fetch(`/api/admin/billing/${invoiceId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paidAt, amount, method, reference, notes }),
    });
    saving = false;
    if (!res.ok) { error = await res.text(); return; }
    onSaved();
  }
</script>

{#snippet modalBody()}
  <div>
    <p class="muted">Offen: <strong>{outstanding.toFixed(2)} €</strong></p>

    <label>Datum<input type="date" bind:value={paidAt} /></label>
    <label>Betrag (€)<input type="number" step="0.01" bind:value={amount} /></label>
    <label>Methode
      <select bind:value={method}>
        <option value="bank">Banküberweisung</option>
        <option value="sepa">SEPA-Lastschrift</option>
        <option value="cash">Bar</option>
        <option value="other">Sonstige</option>
      </select>
    </label>
    <label>Referenz<input type="text" bind:value={reference} placeholder="Buchungstext, Kontoauszug …"/></label>
    <label>Notiz<textarea bind:value={notes} rows="2" placeholder="Pflicht bei Korrekturbuchung (negativer Betrag)"></textarea></label>

    {#if error}<p class="error">{error}</p>{/if}
  </div>
{/snippet}

{#snippet modalFooter()}
  <div class="actions">
    <button onclick={close} disabled={saving}>Abbrechen</button>
    <button class="primary" onclick={save} disabled={saving}>
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>
{/snippet}

<AdminModal
  bind:open
  title="Zahlung erfassen — {invoiceNumber}"
  onclose={close}
  body={modalBody}
  footer={modalFooter}
/>

<style>
  label { display: block; margin: .5rem 0; }
  label input, label select, label textarea { display: block; width: 100%; padding: .4rem; }
  .muted { color: #666; }
  .error { color: #c00; margin: .5rem 0; }
  .actions { display: flex; gap: .5rem; justify-content: flex-end; margin-top: 1rem; }
  .primary { background: #1a3d2e; color: white; border: none; padding: .5rem 1rem;
    border-radius: 4px; cursor: pointer; }
</style>
