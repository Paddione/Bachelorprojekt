<script lang="ts">
  let open = $state(false);
  let description = $state('');
  let files = $state<File[]>([]);
  let fileError = $state('');
  let submitting = $state(false);
  let result = $state<{ success: boolean; message: string } | null>(null);
  let email = $state('');
  let category = $state<'fehler' | 'verbesserung' | 'erweiterungswunsch'>('fehler');

  let triggerButtonEl = $state<HTMLButtonElement | null>(null);
  let dialogEl = $state<HTMLDivElement | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_FILES = 3;
  const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    email = '';
    category = 'fehler';
    files = [];
    fileError = '';
    result = null;
    if (fileInputEl) fileInputEl.value = '';
  }

  function onFileChange(e: Event) {
    fileError = '';
    const input = e.target as HTMLInputElement;
    if (!input.files) return;

    const incoming = Array.from(input.files);
    for (const picked of incoming) {
      if (files.length >= MAX_FILES) {
        fileError = `Maximal ${MAX_FILES} Screenshots erlaubt.`;
        break;
      }
      if (picked.size > MAX_BYTES) {
        fileError = `"${picked.name}" ist zu groß (max. 5 MB).`;
        continue;
      }
      if (!ALLOWED.includes(picked.type)) {
        fileError = `"${picked.name}": Nur PNG, JPEG oder WEBP erlaubt.`;
        continue;
      }
      if (files.some(f => f.name === picked.name && f.size === picked.size)) {
        fileError = `"${picked.name}" ist bereits hinzugefügt.`;
        continue;
      }
      files = [...files, picked];
    }
    // Reset input so the same file can be re-added after removal
    input.value = '';
  }

  function removeFile(index: number) {
    files = files.filter((_, i) => i !== index);
    fileError = '';
  }

  const canSubmit = $derived(
    description.trim().length > 0 &&
    EMAIL_RE.test(email) &&
    !submitting &&
    !fileError
  );

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!canSubmit) return;
    submitting = true;
    result = null;

    const fd = new FormData();
    fd.append('description', description.trim());
    fd.append('email', email.trim());
    fd.append('category', category);
    fd.append('url', window.location.href);
    fd.append('userAgent', navigator.userAgent);
    fd.append('viewport', `${window.innerWidth}x${window.innerHeight}`);
    for (const file of files) {
      fd.append('screenshot', file, file.name);
    }

    try {
      const res = await fetch('/api/bug-report', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        const ticketId = data.ticketId ?? '';
        const successMsg = ticketId
          ? `Vielen Dank! Ihre Meldung wurde als ${ticketId} aufgenommen.`
          : 'Vielen Dank! Ihre Meldung wurde übermittelt.';
        result = { success: true, message: successMsg };
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

  let effectInitialized = false;
  $effect(() => {
    const isOpen = open;
    if (!effectInitialized) {
      effectInitialized = true;
      return;
    }
    if (isOpen && dialogEl) {
      const first = dialogEl.querySelector<HTMLElement>('textarea, button, input, [tabindex]:not([tabindex="-1"])');
      first?.focus();
    } else if (!isOpen && triggerButtonEl) {
      triggerButtonEl.focus();
    }
  });
</script>

<svelte:window onkeydown={onKeydown} />

<button
  type="button"
  bind:this={triggerButtonEl}
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
  >
    <div
      bind:this={dialogEl}
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
          <label for="bug-email" class="block text-sm font-medium text-light mb-1">
            Ihre E-Mail <span class="text-gold">*</span>
          </label>
          <input
            id="bug-email"
            type="email"
            bind:value={email}
            required
            placeholder="max@example.com"
            class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
          />
        </div>

        <div>
          <label for="bug-category" class="block text-sm font-medium text-light mb-1">
            Kategorie <span class="text-gold">*</span>
          </label>
          <select
            id="bug-category"
            bind:value={category}
            required
            class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
          >
            <option value="fehler">Fehler</option>
            <option value="verbesserung">Verbesserung</option>
            <option value="erweiterungswunsch">Erweiterungswunsch</option>
          </select>
        </div>

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
            class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim resize-y"
          ></textarea>
        </div>

        <div>
          <label for="bug-screenshot" class="block text-sm font-medium text-light mb-1">
            Screenshots <span class="text-muted-dark">(optional, bis zu 3, max. 5 MB je Bild)</span>
          </label>
          {#if files.length < 3}
            <input
              id="bug-screenshot"
              bind:this={fileInputEl}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onchange={onFileChange}
              class="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-gold file:text-dark file:font-semibold hover:file:bg-gold-light cursor-pointer"
            />
          {/if}
          {#if files.length > 0}
            <ul class="mt-2 space-y-1">
              {#each files as file, i}
                <li class="text-xs text-muted flex items-center gap-2">
                  <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                  <button
                    type="button"
                    onclick={() => removeFile(i)}
                    class="text-gold hover:underline bg-transparent border-0 cursor-pointer"
                  >Entfernen</button>
                </li>
              {/each}
            </ul>
          {/if}
          {#if fileError}
            <p class="text-xs text-red-400 mt-1">{fileError}</p>
          {/if}
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
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
