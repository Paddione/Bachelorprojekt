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
    enableImageUpload = true,
  }: {
    value?: string;
    previewMode?: 'direct' | 'server';
    previewUrl?: string;
    previewBody?: () => object;
    placeholder?: string;
    rows?: number;
    label?: string;
    enableImageUpload?: boolean;
  } = $props();

  let viewMode = $state<ViewMode>('split');
  let serverPreviewHtml = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let uploading = $state(false);
  let dragOver = $state(false);
  let fileInput: HTMLInputElement;
  let textareaEl: HTMLTextAreaElement;

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

  async function uploadImage(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/admin/assets/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.url;
    } catch {
      return null;
    }
  }

  function insertAtCursor(text: string) {
    if (!textareaEl) {
      value += text;
      return;
    }
    const start = textareaEl.selectionStart;
    const end = textareaEl.selectionEnd;
    value = value.slice(0, start) + text + value.slice(end);
    requestAnimationFrame(() => {
      textareaEl.selectionStart = textareaEl.selectionEnd = start + text.length;
      textareaEl.focus();
    });
  }

  async function handleFiles(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter(f =>
      f.type === 'image/jpeg' || f.type === 'image/png' || f.type === 'image/webp'
    );
    if (imageFiles.length === 0) return;
    uploading = true;
    try {
      for (const file of imageFiles) {
        const url = await uploadImage(file);
        if (url) {
          insertAtCursor(`<img src="${url}" alt="">`);
        }
      }
    } finally {
      uploading = false;
    }
  }

  function onFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) {
      handleFiles(input.files);
      input.value = '';
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function onDragLeave() {
    dragOver = false;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files) {
      handleFiles(e.dataTransfer.files);
    }
  }
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

  {#if enableImageUpload && viewMode !== 'preview'}
    <div class="flex items-center gap-2">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        bind:this={fileInput}
        onchange={onFileSelect}
        class="hidden"
      />
      <button
        type="button"
        onclick={() => fileInput.click()}
        disabled={uploading}
        class="px-2.5 py-1 text-xs rounded bg-dark-lighter text-muted hover:text-light transition-colors disabled:opacity-50"
      >{uploading ? 'Lädt…' : 'Bild'}</button>
    </div>
  {/if}

  <div class={`flex gap-3 ${viewMode === 'split' ? 'flex-row' : 'flex-col'}`} style="min-height: {rows * 24}px">
    {#if viewMode !== 'preview'}
      <div class={`relative ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
        <textarea
          bind:this={textareaEl}
          bind:value
          {placeholder}
          {rows}
          ondragover={enableImageUpload ? onDragOver : undefined}
          ondragenter={enableImageUpload ? onDragOver : undefined}
          ondragleave={enableImageUpload ? onDragLeave : undefined}
          ondrop={enableImageUpload ? onDrop : undefined}
          class="bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm font-mono focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none resize-y w-full"
        ></textarea>
        {#if dragOver}
          <div class="absolute inset-0 flex items-center justify-center bg-gold/20 border-2 border-dashed border-gold rounded-lg pointer-events-none">
            <span class="text-gold font-semibold text-sm">Bild hier ablegen</span>
          </div>
        {/if}
      </div>
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
