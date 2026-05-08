<script lang="ts">
  import type { ActiveCallRoom } from '../../../lib/nextcloud-talk-db';

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  let rooms = $state<ActiveCallRoom[]>([]);
  let intro = $state('Lade laufende Calls…');
  let result = $state<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  let busy = $state(false);

  async function load() {
    intro = 'Lade laufende Calls…';
    rooms = [];
    result = null;
    try {
      const res = await fetch('/api/admin/brett/broadcast');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { rooms: ActiveCallRoom[] };
      rooms = data.rooms ?? [];
      intro = rooms.length === 0
        ? 'Aktuell läuft kein Talk-Call.'
        : `Brett-Link wird in folgende ${rooms.length} laufende(n) Call(s) gepostet:`;
    } catch { intro = 'Fehler beim Laden der Calls.'; }
  }
  $effect(() => { if (open) load(); });

  async function broadcast() {
    busy = true;
    try {
      const res = await fetch('/api/admin/brett/broadcast', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { total: number; sent: number; failed: number };
      result = data.failed === 0
        ? { kind: 'ok',  text: `✓ Brett-Link an ${data.sent} Call(s) gesendet.` }
        : { kind: 'warn', text: `${data.sent}/${data.total} gesendet, ${data.failed} fehlgeschlagen.` };
    } catch { result = { kind: 'err', text: 'Senden fehlgeschlagen.' }; }
    finally { busy = false; }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
       onclick={(e) => { if (e.currentTarget === e.target) onclose(); }}
       role="presentation">
    <div class="bg-dark-light rounded-2xl border border-dark-lighter max-w-lg w-full p-6 shadow-xl">
      <h2 class="text-xl font-serif text-light mb-2">🎯 Systemisches Brett</h2>
      <p class="text-sm text-muted mb-4">{intro}</p>

      <ul class="max-h-64 overflow-y-auto space-y-1 mb-5 text-sm text-light">
        {#each rooms as r (r.token)}
          <li class="px-3 py-2 bg-dark rounded border border-dark-lighter">{r.displayName || r.name || r.token}</li>
        {/each}
      </ul>

      {#if result}
        <p class="mb-4 text-sm" class:text-green-400={result.kind==='ok'} class:text-yellow-400={result.kind==='warn'} class:text-red-400={result.kind==='err'}>{result.text}</p>
      {/if}

      <div class="flex justify-end gap-2">
        <button onclick={onclose}
                class="px-4 py-2 bg-dark rounded-lg border border-dark-lighter text-sm text-muted hover:text-light">
          Schließen
        </button>
        <button onclick={broadcast} disabled={busy || rooms.length===0}
                class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold disabled:opacity-40">
          {busy ? 'Sende…' : 'Senden'}
        </button>
      </div>
    </div>
  </div>
{/if}
