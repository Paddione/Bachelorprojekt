<script lang="ts">
  type Category = 'fehler' | 'verbesserung' | 'erweiterungswunsch' | 'zahlung';

  let { onCloseView }: { onCloseView?: () => void } = $props();

  let description = $state('');
  let files = $state<File[]>([]);
  let fileError = $state('');
  let submitting = $state(false);
  let result = $state<{ success: boolean; message: string } | null>(null);
  let email = $state('');
  let category = $state<Category>('verbesserung');
  let fileInputEl = $state<HTMLInputElement | null>(null);

  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_FILES = 3;
  const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function resetForm() {
    description = '';
    email = '';
    category = 'verbesserung';
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
        setTimeout(() => { onCloseView?.(); }, 2000);
      } else {
        result = { success: false, message: data.error || 'Fehler beim Übermitteln.' };
      }
    } catch {
      result = { success: false, message: 'Verbindungsfehler. Bitte versuchen Sie es erneut.' };
    } finally {
      submitting = false;
    }
  }
</script>

<div class="support-view">
  <form onsubmit={handleSubmit}>
    <div class="field">
      <label for="sv-email">Ihre E-Mail <span class="req">*</span></label>
      <input
        id="sv-email"
        type="email"
        bind:value={email}
        required
        placeholder="max@example.com"
        class="inp"
      />
    </div>

    <div class="field">
      <label for="sv-category">Kategorie <span class="req">*</span></label>
      <select id="sv-category" bind:value={category} required class="inp">
        <option value="verbesserung">Verbesserungsvorschlag</option>
        <option value="erweiterungswunsch">Idee / Wunsch</option>
        <option value="fehler">Problem / Fehler melden</option>
        <option value="zahlung">Zahlungsproblem</option>
      </select>
    </div>

    <div class="field">
      <label for="sv-description">Beschreibung <span class="req">*</span></label>
      <textarea
        id="sv-description"
        bind:value={description}
        maxlength="2000"
        rows="5"
        required
        placeholder="Was ist passiert? Was haben Sie erwartet?"
        class="inp"
      ></textarea>
    </div>

    <div class="field">
      <label for="sv-screenshot">
        Screenshots <span class="opt">(optional, bis zu 3, max. 5 MB je Bild)</span>
      </label>
      {#if files.length < 3}
        <input
          id="sv-screenshot"
          bind:this={fileInputEl}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onchange={onFileChange}
          class="file-inp"
        />
      {/if}
      {#if files.length > 0}
        <ul class="file-list">
          {#each files as file, i}
            <li>
              <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
              <button type="button" onclick={() => removeFile(i)} class="rm-btn">Entfernen</button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if fileError}
        <p class="err">{fileError}</p>
      {/if}
    </div>

    <button type="submit" disabled={!canSubmit} class="submit-btn">
      {submitting ? 'Wird gesendet...' : 'Meldung senden'}
    </button>

    {#if result}
      <div class="result {result.success ? 'success' : 'error'}">
        {result.message}
      </div>
    {/if}
  </form>
</div>

<style>
  .support-view { padding: 16px; display: flex; flex-direction: column; gap: 0; }
  form { display: flex; flex-direction: column; gap: 12px; }

  .field { display: flex; flex-direction: column; gap: 4px; }
  label { font-size: 12px; font-weight: 600; color: #e8e8f0; }
  .req { color: #e8c870; }
  .opt { color: #5566aa; font-weight: 400; }

  .inp {
    width: 100%;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid #243049;
    background: #0f1623;
    color: #e8e8f0;
    font-size: 13px;
    font-family: inherit;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.15s;
  }
  .inp:focus { border-color: #e8c870; }
  textarea.inp { resize: vertical; min-height: 80px; }

  .file-inp {
    display: block;
    width: 100%;
    font-size: 12px;
    color: #8899aa;
    cursor: pointer;
    box-sizing: border-box;
  }
  .file-inp::file-selector-button {
    margin-right: 10px;
    padding: 4px 10px;
    border-radius: 4px;
    border: 0;
    background: #e8c870;
    color: #0f1623;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .file-list { margin: 4px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
  .file-list li { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #8899aa; }
  .rm-btn { background: transparent; border: none; color: #e8c870; font-size: 11px; cursor: pointer; padding: 0; text-decoration: underline; }

  .err { font-size: 11px; color: #f87171; margin: 2px 0 0; }

  .submit-btn {
    width: 100%;
    padding: 10px;
    border-radius: 6px;
    border: none;
    background: #e8c870;
    color: #0f1623;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .result {
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.5;
  }
  .result.success { background: rgba(74,222,128,.08); color: #4ade80; border: 1px solid rgba(74,222,128,.2); }
  .result.error { background: rgba(248,113,113,.08); color: #f87171; border: 1px solid rgba(248,113,113,.2); }
</style>
