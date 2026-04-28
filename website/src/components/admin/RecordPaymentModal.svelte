<script lang="ts">
  export let invoiceId: string;
  export let invoiceNumber: string;
  export let outstanding: number;
  export let onClose: () => void;
  export let onSaved: () => void;

  let paidAt = new Date().toISOString().split('T')[0];
  let amount = outstanding;
  let method: 'sepa'|'cash'|'bank'|'other' = 'bank';
  let reference = '';
  let notes = '';
  let saving = false;
  let error = '';

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

<div class="modal-backdrop" on:click|self={onClose} role="dialog">
  <div class="modal">
    <h2>Zahlung erfassen — {invoiceNumber}</h2>
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

    <div class="actions">
      <button on:click={onClose} disabled={saving}>Abbrechen</button>
      <button class="primary" on:click={save} disabled={saving}>
        {saving ? 'Speichere…' : 'Speichern'}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4);
    display: grid; place-items: center; z-index: 1000; }
  .modal { background: white; padding: 1.5rem; border-radius: 8px; min-width: 400px;
    max-width: 90vw; }
  label { display: block; margin: .5rem 0; }
  label input, label select, label textarea { display: block; width: 100%; padding: .4rem; }
  .muted { color: #666; }
  .error { color: #c00; margin: .5rem 0; }
  .actions { display: flex; gap: .5rem; justify-content: flex-end; margin-top: 1rem; }
  .primary { background: #1a3d2e; color: white; border: none; padding: .5rem 1rem;
    border-radius: 4px; cursor: pointer; }
</style>
