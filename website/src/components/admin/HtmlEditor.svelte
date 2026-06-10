<script lang="ts">
  type ViewMode = 'editor' | 'split' | 'preview';

  let {
    value = $bindable(''),
    previewMode = 'direct' as 'direct' | 'server',
    previewUrl = '',
    previewBody = (() => ({})) as () => object,
    placeholder = '<p>HTML hier eingeben…</p>',
    rows = 20,
    label = 'HTML-Inhalt',
  }: {
    value?: string;
    previewMode?: 'direct' | 'server';
    previewUrl?: string;
    previewBody?: () => object;
    placeholder?: string;
    rows?: number;
    label?: string;
  } = $props();

  let viewMode = $state<ViewMode>('split');
  let serverPreviewHtml = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const iframeSrcdoc = $derived(
    previewMode === 'direct'
      ? (value || '<p style="color:#666;font-family:sans-serif;padding:20px;">Vorschau erscheint hier…</p>')
      : (serverPreviewHtml || '<p style="color:#666;font-family:sans-serif;padding:20px;">Vorschau erscheint hier…</p>')
  );

  async function fetchServerPreview() {
    if (previewMode !== 'server' || !previewUrl) return;
    try {
      const res = await fetch(previewUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewBody()),
      });
      serverPreviewHtml = res.ok
        ? await res.text()
        : '<p style="color:#a33;font-family:sans-serif;padding:20px;">Vorschau konnte nicht geladen werden.</p>';
    } catch {
      serverPreviewHtml = '<p style="color:#a33;font-family:sans-serif;padding:20px;">Vorschau-Fehler (Verbindung).</p>';
    }
  }

  $effect(() => {
    void value;
    if (previewMode !== 'server') return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchServerPreview, 250);
  });

  const btnCls = (active: boolean) =>
    `px-2.5 py-1 text-xs rounded transition-colors ${active ? 'bg-gold text-dark font-semibold' : 'bg-dark-lighter text-muted hover:text-light'}`;
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center justify-between">
    <label class="block text-sm text-muted">{label}</label>
    <div class="flex gap-1">
      <button type="button" onclick={() => viewMode = 'editor'} class={btnCls(viewMode === 'editor')}>✏️ Editor</button>
      <button type="button" onclick={() => viewMode = 'split'} class={btnCls(viewMode === 'split')}>⬜ Split</button>
      <button type="button" onclick={() => viewMode = 'preview'} class={btnCls(viewMode === 'preview')}>👁 Vorschau</button>
    </div>
  </div>

  <div class={`flex gap-3 ${viewMode === 'split' ? 'flex-row' : 'flex-col'}`} style="min-height: {rows * 24}px">
    {#if viewMode !== 'preview'}
      <textarea
        bind:value
        {placeholder}
        {rows}
        class={`bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm font-mono focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none resize-y ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}
      ></textarea>
    {/if}

    {#if viewMode !== 'editor'}
      <iframe
        srcdoc={iframeSrcdoc}
        title="HTML Vorschau"
        class={`rounded-xl border border-dark-lighter bg-white block ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}
        style="height: {rows * 24}px"
      ></iframe>
    {/if}
  </div>
</div>
