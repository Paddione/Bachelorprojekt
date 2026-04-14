<script lang="ts">
  let open = $state(false);
  let description = $state('');
  let file = $state<File | null>(null);
  let fileError = $state('');
  let submitting = $state(false);
  let result = $state<{ success: boolean; message: string } | null>(null);

  const MAX_BYTES = 5 * 1024 * 1024;
  const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

  function openModal() {
    open = true;
    result = null;
  }

  function closeModal() {
    if (submitting) return;
    open = false;
  }

  function resetForm() {
    description = '';
    file = null;
    fileError = '';
    result = null;
    const input = document.getElementById('bug-screenshot') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  function onFileChange(e: Event) {
    fileError = '';
    const input = e.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    if (!picked) { file = null; return; }
    if (picked.size > MAX_BYTES) {
      fileError = 'Datei zu groß (max. 5 MB).';
      file = null;
      input.value = '';
      return;
    }
    if (!ALLOWED.includes(picked.type)) {
      fileError = 'Nur PNG, JPEG oder WEBP erlaubt.';
      file = null;
      input.value = '';
      return;
    }
    file = picked;
  }

  function removeFile() {
    file = null;
    fileError = '';
    const input = document.getElementById('bug-screenshot') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  function canSubmit() {
    return description.trim().length > 0 && !submitting && !fileError;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!canSubmit()) return;
    submitting = true;
    result = null;

    const fd = new FormData();
    fd.append('description', description.trim());
    fd.append('url', window.location.href);
    fd.append('userAgent', navigator.userAgent);
    fd.append('viewport', `${window.innerWidth}x${window.innerHeight}`);
    if (file) fd.append('screenshot', file, file.name);

    try {
      const res = await fetch('/api/bug-report', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        result = { success: true, message: 'Vielen Dank! Ihre Meldung wurde übermittelt.' };
        resetForm();
        setTimeout(() => { open = false; result = null; }, 2000);
      } else {
        result = { success: false, message: data.error || 'Fehler beim Übermitteln.' };
      }
    } catch {
      result = { success: false, message: 'Verbindungsfehler. Bitte versuchen Sie es erneut.' };
    } finally {
      submitting = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) closeModal();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<button
  type="button"
  onclick={openModal}
  aria-label="Bug melden"
  class="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-gold hover:bg-gold-light text-dark px-4 py-3 rounded-full font-semibold shadow-lg transition-colors cursor-pointer"
>
  <span aria-hidden="true">🐞</span>
  <span>Bug melden</span>
</button>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    onclick={closeModal}
    role="presentation"
  >
    <div
      class="bg-dark border border-dark-lighter rounded-xl max-w-lg w-full p-6 shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-modal-title"
    >
      <div class="flex items-start justify-between mb-4">
        <h2 id="bug-modal-title" class="text-xl font-bold text-light">Fehler melden</h2>
        <button
          type="button"
          onclick={closeModal}
          aria-label="Schließen"
          class="text-muted hover:text-light text-2xl leading-none cursor-pointer bg-transparent border-0"
        >
          ×
        </button>
      </div>

      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="bug-description" class="block text-sm font-medium text-light mb-1">
            Beschreibung <span class="text-gold">*</span>
          </label>
          <textarea
            id="bug-description"
            bind:value={description}
            maxlength="2000"
            rows="5"
            required
            placeholder="Was ist passiert? Was haben Sie erwartet?"
            class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-1 focus:ring-gold-dim resize-y"
          ></textarea>
        </div>

        <div>
          <label for="bug-screenshot" class="block text-sm font-medium text-light mb-1">
            Screenshot <span class="text-muted-dark">(optional, max. 5 MB)</span>
          </label>
          <input
            id="bug-screenshot"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onchange={onFileChange}
            class="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-gold file:text-dark file:font-semibold hover:file:bg-gold-light cursor-pointer"
          />
          {#if file}
            <p class="text-xs text-muted mt-1">
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
              <button type="button" onclick={removeFile} class="text-gold hover:underline ml-2 bg-transparent border-0 cursor-pointer">Entfernen</button>
            </p>
          {/if}
          {#if fileError}
            <p class="text-xs text-red-400 mt-1">{fileError}</p>
          {/if}
        </div>

        <button
          type="submit"
          disabled={!canSubmit()}
          class="w-full bg-gold hover:bg-gold-light disabled:bg-dark-lighter disabled:text-muted-dark text-dark px-4 py-2.5 rounded font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {submitting ? 'Wird gesendet...' : 'Meldung senden'}
        </button>

        {#if result}
          <div
            class="p-3 rounded text-sm {result.success
              ? 'bg-green-900/30 text-green-300 border border-green-800'
              : 'bg-red-900/30 text-red-300 border border-red-800'}"
          >
            {result.message}
          </div>
        {/if}
      </form>
    </div>
  </div>
{/if}
