<script lang="ts">
  let {
    mode = $bindable<'browser' | 'obs'>('browser'),
    streamDomain,
    rtmpKey,
  }: { mode?: 'browser' | 'obs'; streamDomain: string; rtmpKey: string } = $props();

  function setMode(m: 'browser' | 'obs') { mode = m; }
</script>

<div class="space-y-4">
  <div class="flex gap-2" role="tablist" aria-label="Sendemodus">
    <button type="button" role="tab" aria-selected={mode==='browser'}
            onclick={() => setMode('browser')}
            class={mode==='browser'
              ? 'px-4 py-2 rounded-lg text-sm font-semibold border bg-gold text-dark border-gold'
              : 'px-4 py-2 rounded-lg text-sm font-semibold border bg-dark border-dark-lighter text-light hover:border-gold'}>
      📹 Im Browser senden
    </button>
    <button type="button" role="tab" aria-selected={mode==='obs'}
            onclick={() => setMode('obs')}
            class={mode==='obs'
              ? 'px-4 py-2 rounded-lg text-sm font-semibold border bg-gold text-dark border-gold'
              : 'px-4 py-2 rounded-lg text-sm font-semibold border bg-dark border-dark-lighter text-light hover:border-gold'}>
      🎬 Mit OBS (RTMP)
    </button>
  </div>

  {#if mode === 'obs'}
    <div class="bg-dark-light border border-dark-lighter rounded-xl p-5">
      <h2 class="text-sm font-semibold text-light mb-3">OBS / RTMP Zugangsdaten</h2>
      <div class="space-y-2 text-sm">
        <div>
          <span class="text-muted">Server URL</span>
          <code class="block mt-1 bg-dark px-3 py-2 rounded text-gold font-mono">rtmp://{streamDomain}/live</code>
        </div>
        <div>
          <span class="text-muted">Stream Key</span>
          <code class="block mt-1 bg-dark px-3 py-2 rounded text-gold font-mono">{rtmpKey}</code>
        </div>
      </div>
    </div>
  {/if}
</div>
