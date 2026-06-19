<script lang="ts">
  let {
    ticketId,
    attachments = [],
  }: {
    ticketId: string;
    attachments: {
      id: string;
      filename: string;
      mimeType: string;
      fileSize: number | null;
      hasDataUrl: boolean;
    }[];
  } = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let uploadError = $state('');

  function fmtSize(bytes: number | null): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  async function handleUpload(e: Event) {
    e.preventDefault();
    uploadError = '';
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const r = await fetch(`/api/admin/tickets/${ticketId}/attachments`, {
      method: 'POST',
      body: fd,
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({ error: 'Upload-Fehler' }));
      uploadError = j.error ?? 'Upload-Fehler';
      return;
    }
    location.reload();
  }
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
  <div class="flex items-center justify-between mb-3">
    <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide">
      Anhänge ({attachments.length})
    </h2>
    <button
      type="button"
      onclick={() => dialogEl?.showModal()}
      class="px-3 py-1 text-xs bg-gold/20 text-gold border border-gold/30 rounded hover:bg-gold/30 transition-colors"
    >
      + Datei
    </button>
  </div>

  {#if attachments.length === 0}
    <p class="text-sm text-muted italic">Keine Anhänge.</p>
  {:else}
    <ul class="space-y-1 text-sm">
      {#each attachments as a (a.id)}
        <li class="flex items-center gap-3">
          {#if a.hasDataUrl}
            <a
              href={`/api/admin/tickets/${ticketId}/attachments/${a.id}`}
              download={a.filename}
              class="text-gold hover:underline flex-1 truncate"
            >{a.filename}</a>
          {:else}
            <span class="text-light flex-1 truncate">{a.filename}</span>
          {/if}
          <span class="text-xs text-muted">{a.mimeType}</span>
          <span class="text-xs text-muted font-mono">{fmtSize(a.fileSize)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<dialog
  bind:this={dialogEl}
  class="bg-dark-light border border-dark-lighter rounded-2xl p-6 w-full max-w-md backdrop:bg-black/60"
>
  <h2 class="text-lg font-semibold text-light mb-4 font-serif">Datei anhängen</h2>
  <form onsubmit={handleUpload} enctype="multipart/form-data" class="space-y-4">
    <div>
      <label class="block text-xs text-muted mb-1">Datei <span class="text-red-400">*</span></label>
      <input
        type="file" name="file" required
        class="w-full text-sm text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gold/20 file:text-gold hover:file:bg-gold/30 file:cursor-pointer cursor-pointer"
      />
      <p class="text-xs text-muted mt-1">Max. 5 MB</p>
    </div>
    {#if uploadError}
      <p class="text-red-400 text-xs">{uploadError}</p>
    {/if}
    <div class="flex gap-3 justify-end">
      <button
        type="button"
        onclick={() => dialogEl?.close()}
        class="px-4 py-2 text-sm text-muted hover:text-light transition-colors"
      >Abbrechen</button>
      <button
        type="submit"
        class="px-4 py-2 text-sm bg-gold hover:bg-gold-light text-dark font-semibold rounded-lg transition-colors"
      >Hochladen</button>
    </div>
  </form>
</dialog>
