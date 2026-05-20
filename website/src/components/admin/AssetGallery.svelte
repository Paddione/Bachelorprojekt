<script lang="ts">
  import { onMount } from 'svelte';

  type AssetType = 'image' | 'audio' | 'video' | 'document';

  interface Asset {
    id: string;
    name: string;
    type: AssetType;
    file_path: string;
    tags: string[];
    metadata: Record<string, unknown>;
    created_at: string;
  }

  let assets: Asset[] = [];
  let loading = true;
  let error = '';
  let filter: AssetType | 'all' = 'all';
  let copied = '';

  onMount(async () => {
    try {
      const res = await fetch('/api/admin/assets');
      assets = res.ok ? await res.json() : [];
    } catch {
      error = 'Failed to load assets';
    } finally {
      loading = false;
    }
  });

  function filtered(list: Asset[], f: typeof filter) {
    return f === 'all' ? list : list.filter(a => a.type === f);
  }

  async function copyPath(path: string) {
    await navigator.clipboard.writeText(path);
    copied = path;
    setTimeout(() => { copied = ''; }, 1800);
  }

  function counts(list: Asset[]) {
    return {
      all: list.length,
      image: list.filter(a => a.type === 'image').length,
      audio: list.filter(a => a.type === 'audio').length,
      video: list.filter(a => a.type === 'video').length,
      document: list.filter(a => a.type === 'document').length,
    };
  }

  // Map registry file_path to a public URL if one exists in the website build.
  // branding/korczewski/* → /brand/korczewski/*, branding/mentolder/* → /brand/mentolder/*
  function publicUrl(filePath: string): string | null {
    if (filePath.startsWith('branding/')) {
      return '/' + filePath.replace(/^branding\//, 'brand/');
    }
    return null;
  }

  function handleImgError(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    img.style.display = 'none';
    const fallback = img.nextElementSibling as HTMLElement | null;
    if (fallback) fallback.style.display = 'flex';
  }

  $: c = counts(assets);
  $: visible = filtered(assets, filter);

  const TAB_LABELS: Record<typeof filter, string> = {
    all: 'Alle',
    image: 'Bilder',
    audio: 'Audio',
    video: 'Video',
    document: 'Dokumente',
  };
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-white">Asset-Galerie</h1>
    <span class="text-sm text-gray-400">{assets.length} Assets indexiert</span>
  </div>

  <!-- Filter tabs -->
  <div class="flex gap-1 border-b border-gray-700 pb-0">
    {#each (['all', 'image', 'audio', 'video', 'document'] as const) as tab}
      <button
        on:click={() => filter = tab}
        class="px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors {filter === tab
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-gray-400 hover:text-gray-200'}"
      >
        {TAB_LABELS[tab]}
        <span class="ml-1 text-xs text-gray-500">({c[tab]})</span>
      </button>
    {/each}
  </div>

  {#if loading}
    <p class="text-gray-400 py-8 text-center">Lädt…</p>
  {:else if error}
    <p class="text-red-400 py-8 text-center">{error}</p>
  {:else if visible.length === 0}
    <div class="py-12 text-center">
      <p class="text-gray-400 mb-2">Keine Assets gefunden.</p>
      <p class="text-sm text-gray-600">Führe <code class="bg-gray-800 px-1 rounded">task assets:index ENV=mentolder</code> aus, um Assets zu indexieren.</p>
    </div>
  {:else}
    <!-- Image grid -->
    {#if filter === 'all' || filter === 'image'}
      {#if filtered(assets, 'image').length > 0}
        <section>
          {#if filter === 'all'}<h2 class="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Bilder</h2>{/if}
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {#each filtered(assets, 'image') as asset (asset.id)}
              {@const url = publicUrl(asset.file_path)}
              <div class="group relative bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors">
                <div class="aspect-square bg-gray-900 flex items-center justify-center overflow-hidden">
                  {#if url}
                    <img
                      src={url}
                      alt={asset.name}
                      class="w-full h-full object-contain p-2"
                      loading="lazy"
                      on:error={handleImgError}
                    />
                    <span class="hidden items-center justify-center text-2xl" aria-hidden="true">🖼</span>
                  {:else}
                    <span class="text-2xl" aria-hidden="true">🖼</span>
                  {/if}
                </div>
                <div class="p-2">
                  <p class="text-xs text-gray-300 truncate" title={asset.name}>{asset.name}</p>
                  <button
                    on:click={() => copyPath(asset.file_path)}
                    class="mt-1 text-xs text-gray-500 hover:text-blue-400 transition-colors"
                    title="Pfad kopieren"
                  >
                    {copied === asset.file_path ? '✓ Kopiert' : 'Pfad kopieren'}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {/if}

    <!-- Audio list -->
    {#if filter === 'all' || filter === 'audio'}
      {#if filtered(assets, 'audio').length > 0}
        <section>
          {#if filter === 'all'}<h2 class="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Audio</h2>{/if}
          <div class="space-y-2">
            {#each filtered(assets, 'audio') as asset (asset.id)}
              <div class="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3 border border-gray-700 hover:border-gray-500 transition-colors">
                <span class="text-xl" aria-hidden="true">🔊</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-gray-200 truncate">{asset.name}</p>
                  <p class="text-xs text-gray-500 font-mono truncate">{asset.file_path}</p>
                </div>
                <button
                  on:click={() => copyPath(asset.file_path)}
                  class="text-xs text-gray-500 hover:text-blue-400 transition-colors whitespace-nowrap"
                >
                  {copied === asset.file_path ? '✓ Kopiert' : 'Pfad kopieren'}
                </button>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {/if}

    <!-- Document list -->
    {#if filter === 'all' || filter === 'document'}
      {#if filtered(assets, 'document').length > 0}
        <section>
          {#if filter === 'all'}<h2 class="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Dokumente</h2>{/if}
          <div class="space-y-1">
            {#each filtered(assets, 'document') as asset (asset.id)}
              <div class="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-2 border border-gray-700 hover:border-gray-500 transition-colors">
                <span class="text-lg" aria-hidden="true">📄</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-gray-200 truncate">{asset.name}</p>
                  <p class="text-xs text-gray-500 font-mono truncate">{asset.file_path}</p>
                </div>
                <button
                  on:click={() => copyPath(asset.file_path)}
                  class="text-xs text-gray-500 hover:text-blue-400 transition-colors"
                >
                  {copied === asset.file_path ? '✓ Kopiert' : 'Pfad kopieren'}
                </button>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  {/if}
</div>
