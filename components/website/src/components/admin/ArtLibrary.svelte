<script lang="ts">
  type Asset = {
    id: string; kind: string; name_de: string; name_en: string;
    tags: string[]; palette?: Record<string, string>;
    animated?: boolean; files: Record<string, string>;
  };

  let assets = $state<Asset[]>([]);
  let selected = $state<Asset | null>(null);
  let loaded = $state(false);

  async function load() {
    try {
      const res = await fetch('/api/admin/art-library');
      const data = await res.json();
      assets = Array.isArray(data?.assets) ? data.assets : [];
    } catch {
      assets = [];
    } finally {
      loaded = true;
    }
  }

  $effect(() => { load(); });

  function thumb(a: Asset): string | null {
    return a.files.icon ?? a.files.portrait ?? a.files.swatch ?? a.files.svg ?? null;
  }
</script>

{#if loaded && assets.length === 0}
  <div class="art-empty">Keine Kunstbibliothek konfiguriert — No art library configured.</div>
{:else}
  <div class="art-grid">
    {#each assets as a (a.id)}
      <button class="art-card" type="button" onclick={() => (selected = a)}>
        {#if thumb(a)}
          <img src={thumb(a)} alt={a.name_de} loading="lazy" />
        {/if}
        <span class="art-card-name">{a.name_de}</span>
      </button>
    {/each}
  </div>

  {#if selected}
    <aside class="art-panel">
      <button class="art-panel-close" type="button" onclick={() => (selected = null)}>×</button>
      <h3>{selected.name_de} <small>{selected.name_en}</small></h3>
      <p class="art-panel-tags">{selected.tags.join(' · ')}</p>
      {#if selected.palette}
        <div class="art-palette">
          {#each Object.entries(selected.palette) as [name, hex]}
            <div class="art-palette-row">
              <span class="art-swatch" style={`background:${hex}`}></span>
              <span class="art-palette-name">{name}</span>
              <span class="art-palette-hex">{hex}</span>
            </div>
          {/each}
        </div>
      {/if}
    </aside>
  {/if}
{/if}

<style>
  .art-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); gap: 0.75rem; }
  .art-card { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 0.6rem; border: 1px solid var(--border, #2a3343); border-radius: 0.6rem; background: transparent; cursor: pointer; }
  .art-card img { width: 100%; height: 5rem; object-fit: contain; }
  .art-card-name { font-size: 0.78rem; text-align: center; }
  .art-panel { position: fixed; top: 0; right: 0; width: min(22rem, 90vw); height: 100%; padding: 1.25rem; background: var(--panel-bg, #0d1420); border-left: 1px solid var(--border, #2a3343); overflow-y: auto; }
  .art-panel-close { position: absolute; top: 0.75rem; right: 0.75rem; background: none; border: none; font-size: 1.4rem; cursor: pointer; color: inherit; }
  .art-palette-row { display: flex; align-items: center; gap: 0.6rem; margin: 0.3rem 0; }
  .art-swatch { width: 1.2rem; height: 1.2rem; border-radius: 0.3rem; border: 1px solid rgba(255,255,255,0.15); }
  .art-palette-hex { margin-left: auto; font-family: monospace; font-size: 0.78rem; opacity: 0.8; }
  .art-empty { padding: 2rem; text-align: center; opacity: 0.7; }
</style>
