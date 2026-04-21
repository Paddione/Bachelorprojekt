<script lang="ts">
  let email = $state('');
  let status: 'idle' | 'loading' | 'success' | 'error' = $state('idle');
  let errorMsg = $state('');

  async function submit(e: Event) {
    e.preventDefault();
    if (status === 'loading') return;
    status = 'loading';
    errorMsg = '';
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        status = 'success';
      } else {
        errorMsg = data.error ?? 'Ein Fehler ist aufgetreten.';
        status = 'error';
      }
    } catch {
      errorMsg = 'Verbindungsfehler. Bitte versuche es erneut.';
      status = 'error';
    }
  }
</script>

{#if status === 'success'}
  <p class="text-sm text-green-400">
    Bitte bestätige deine E-Mail-Adresse — wir haben dir einen Link geschickt.
  </p>
{:else}
  <form onsubmit={submit} class="flex gap-2 flex-wrap">
    <input
      type="email"
      bind:value={email}
      required
      placeholder="deine@email.de"
      disabled={status === 'loading'}
      class="flex-1 min-w-0 bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm placeholder:text-muted focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none disabled:opacity-50"
    />
    <button
      type="submit"
      disabled={status === 'loading'}
      class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 transition-colors disabled:opacity-50"
    >
      {status === 'loading' ? '…' : 'Anmelden'}
    </button>
  </form>
  {#if status === 'error'}
    <p class="text-sm text-red-400 mt-2">{errorMsg}</p>
  {/if}
{/if}
