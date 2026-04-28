<script lang="ts">
  import { validateLeitwegId } from '../../lib/leitweg';

  export let customerId: string;
  export let initialLeitwegId: string | null = null;

  let value: string = initialLeitwegId ?? '';
  let saving = false;
  let message: string | null = null;
  let messageKind: 'ok' | 'err' | null = null;

  $: liveError = value && value.length > 0 ? (validateLeitwegId(value).reason ?? '') : '';

  async function save() {
    saving = true;
    message = null;
    messageKind = null;
    try {
      const r = await fetch(`/api/admin/billing/customers/${customerId}/leitweg`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leitwegId: value || null }),
      });
      const data = await r.json();
      if (r.ok) {
        message = data.leitwegId ? `Gespeichert: ${data.leitwegId}` : 'Leitweg-ID entfernt';
        messageKind = 'ok';
      } else {
        message = data.error ?? 'Fehler';
        messageKind = 'err';
      }
    } catch (e) {
      message = (e as Error).message;
      messageKind = 'err';
    } finally {
      saving = false;
    }
  }
</script>

<form on:submit|preventDefault={save} class="leitweg-form">
  <label>
    Leitweg-ID (B2G, optional)
    <input
      type="text"
      bind:value
      name="leitwegId"
      placeholder="z. B. 991-01234-44"
      aria-invalid={!!liveError}
    />
  </label>
  {#if liveError}
    <span class="error">{liveError}</span>
  {/if}
  <button type="submit" disabled={saving || !!liveError}>
    {saving ? 'Speichere…' : 'Speichern'}
  </button>
  {#if message}
    <span class={messageKind === 'ok' ? 'ok' : 'error'}>{message}</span>
  {/if}
</form>

<style>
  .leitweg-form { display: flex; flex-direction: column; gap: .5rem; max-width: 28rem; }
  .leitweg-form input { padding: .4rem; font-family: monospace; }
  .error { color: #b91c1c; font-size: .85rem; }
  .ok { color: #15803d; font-size: .85rem; }
  button { align-self: flex-start; padding: .4rem 1rem; }
</style>
