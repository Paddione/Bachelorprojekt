<script lang="ts">
  import type { ServiceOverride, LeistungCategoryOverride } from '../../../lib/website-db';

  let { initialServices, initialLeistungen, initialPriceListUrl }: {
    initialServices: ServiceOverride[];
    initialLeistungen: LeistungCategoryOverride[];
    initialPriceListUrl: string;
  } = $props();

  let services = $state(structuredClone(initialServices));
  let leistungen = $state(structuredClone(initialLeistungen));
  let priceListUrl = $state(initialPriceListUrl);
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/angebote/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services, leistungen, priceListUrl }),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler beim Speichern.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Angebote</h2>
      <p class="text-muted mt-1 text-sm">Leistungskarten, Leistungskatalog und Preisliste</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <!-- Services -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Leistungskarten</h3>
    {#each services as svc}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-3">
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={svc.hidden} class="accent-gold" />
            <span class="text-xs text-muted">Ausblenden</span>
          </label>
          <span class="text-xs font-mono text-muted">{svc.slug}</span>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class={labelCls}>Titel</label><input type="text" bind:value={svc.title} class={inputCls} /></div>
          <div><label class={labelCls}>Preis</label><input type="text" bind:value={svc.price} class={inputCls} /></div>
        </div>
        <div><label class={labelCls}>Beschreibung</label><textarea bind:value={svc.description} rows={2} class="{inputCls} resize-none"></textarea></div>
        <div>
          <label class={labelCls}>Features (eine pro Zeile)</label>
          <textarea
            value={svc.features.join('\n')}
            oninput={(e) => { svc.features = (e.currentTarget as HTMLTextAreaElement).value.split('\n').map(f => f.trim()).filter(Boolean); }}
            rows={4} class="{inputCls} resize-none font-mono"
          ></textarea>
        </div>
        <details class="text-xs text-muted">
          <summary class="cursor-pointer hover:text-light">Seiteninhalte (pageContent)</summary>
          <div class="mt-3 space-y-3">
            <div><label class={labelCls}>Überschrift</label><input type="text" bind:value={svc.pageContent!.headline} class={inputCls} /></div>
            <div><label class={labelCls}>Intro</label><textarea bind:value={svc.pageContent!.intro} rows={3} class="{inputCls} resize-none"></textarea></div>
            <div>
              <label class={labelCls}>Für wen (eine pro Zeile)</label>
              <textarea
                value={(svc.pageContent!.forWhom ?? []).join('\n')}
                oninput={(e) => { if (!svc.pageContent) svc.pageContent = {}; svc.pageContent.forWhom = (e.currentTarget as HTMLTextAreaElement).value.split('\n').map(f => f.trim()).filter(Boolean); }}
                rows={4} class="{inputCls} resize-none font-mono"
              ></textarea>
            </div>
          </div>
        </details>
      </div>
    {/each}
  </div>

  <!-- Price list URL -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Preisliste</h3>
    <div><label class={labelCls}>Nextcloud-Freigabe-URL</label><input type="url" bind:value={priceListUrl} class={inputCls} placeholder="https://files.mentolder.de/s/..." /></div>
  </div>

  <!-- Leistungskatalog -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Leistungskatalog</h3>
    {#each leistungen as cat}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-3">
        <div class="grid grid-cols-2 gap-4">
          <div><label class={labelCls}>Kategorie-Titel</label><input type="text" bind:value={cat.title} class={inputCls} /></div>
          <div><label class={labelCls}>Icon</label><input type="text" bind:value={cat.icon} class={inputCls} /></div>
        </div>
        {#each (cat.services ?? []) as svc}
          <div class="p-3 bg-dark-lighter/30 rounded-lg space-y-2">
            <p class="text-xs font-mono text-muted">{svc.key}</p>
            <div class="grid grid-cols-3 gap-3">
              <div><label class={labelCls}>Name</label><input type="text" bind:value={svc.name} class={inputCls} /></div>
              <div><label class={labelCls}>Preis</label><input type="text" bind:value={svc.price} class={inputCls} /></div>
              <div><label class={labelCls}>Einheit</label><input type="text" bind:value={svc.unit} class={inputCls} /></div>
            </div>
            <div><label class={labelCls}>Beschreibung</label><textarea bind:value={svc.desc} rows={2} class="{inputCls} resize-none"></textarea></div>
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>
