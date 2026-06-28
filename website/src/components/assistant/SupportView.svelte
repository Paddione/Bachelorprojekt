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
  <div class="sv-intro">
    <span class="sv-eyebrow">
      <span class="sv-eyebrow-bar" aria-hidden="true"></span>
      Feedback &amp; Support
    </span>
    <p class="sv-headline">Fehler melden oder eine <em>Idee teilen</em>.</p>
    <p class="sv-desc">Was hat funktioniert, was nicht — wir lesen jede Meldung persönlich.</p>
  </div>
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
  .support-view { display: flex; flex-direction: column; gap: 0; }

  /* ── Intro block ── */
  .sv-intro {
    padding: 24px 22px 20px;
    border-bottom: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sv-eyebrow {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--brass);
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .sv-eyebrow-bar {
    width: 22px;
    height: 1px;
    background: currentColor;
    opacity: 0.8;
    flex-shrink: 0;
  }
  .sv-headline {
    margin: 0;
    font-family: var(--serif);
    font-size: 22px;
    line-height: 1.15;
    letter-spacing: -0.015em;
    color: var(--fg);
    font-weight: 400;
  }
  .sv-headline em {
    font-style: italic;
    color: var(--brass-2);
  }
  .sv-desc {
    margin: 0;
    font-size: 13px;
    color: var(--fg-soft);
    line-height: 1.55;
    max-width: 40ch;
  }

  /* ── Form ─────────────────────────────────────────────── */
  form {
    padding: 20px 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field { display: flex; flex-direction: column; gap: 6px; }
  label { font-family: var(--mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mute); }
  .req { color: var(--brass); }
  .opt { color: var(--mute-2); font-weight: 400; letter-spacing: 0.04em; text-transform: none; font-style: italic; }

  .inp {
    width: 100%;
    padding: 12px 14px;
    min-height: 44px;
    border-radius: var(--radius-md, 12px);
    border: 1px solid var(--line-2);
    background: var(--ink-850);
    color: var(--fg);
    font-family: var(--sans);
    font-size: 14px;
    box-sizing: border-box;
    outline: none;
    transition: border-color 180ms ease, background 180ms ease;
    appearance: none;
    -webkit-appearance: none;
  }
  .inp::placeholder { color: var(--mute-2); }
  .inp:hover { border-color: rgba(255,255,255,0.18); }
  .inp:focus { border-color: var(--brass); background: var(--ink-800); }
  textarea.inp { resize: vertical; min-height: 110px; line-height: 1.55; }
  select.inp {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23cda260' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    padding-right: 36px;
  }

  /* ── File picker ─────────────────────────────────────── */
  .file-inp {
    display: block;
    width: 100%;
    font-family: var(--sans);
    font-size: 13px;
    color: var(--fg-soft);
    cursor: pointer;
    box-sizing: border-box;
    padding: 4px 0;
  }
  .file-inp::file-selector-button { margin-right: 12px; padding: 10px 16px; min-height: 40px; border-radius: var(--radius-pill, 999px); border: 0; background: var(--brass); color: var(--ink-900); font-family: var(--mono); font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; transition: background 180ms ease; }
  .file-inp::file-selector-button:hover { background: var(--brass-2); }

  .file-list {
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .file-list li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--fg-soft);
    padding: 8px 10px;
    background: var(--ink-850);
    border: 1px solid var(--line);
    border-radius: var(--radius-md, 12px);
  }
  .file-list li > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rm-btn {
    background: transparent;
    border: none;
    color: oklch(0.78 0.14 22);
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    cursor: pointer;
    padding: 4px 8px;
    min-height: 28px;
    transition: color 180ms ease;
  }
  .rm-btn:hover { color: oklch(0.85 0.14 22); }

  .err {
    font-size: 12px;
    color: oklch(0.78 0.14 22);
    margin: 4px 0 0;
  }

  .submit-btn {
    width: 100%;
    padding: 14px;
    min-height: 48px;
    border-radius: var(--radius-pill, 999px);
    border: none;
    background: var(--brass);
    color: var(--ink-900);
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 180ms ease, transform 120ms ease;
    margin-top: 4px;
  }
  .submit-btn:not(:disabled):hover {
    background: var(--brass-2);
    transform: translateY(-1px);
  }
  .submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .result {
    padding: 14px 16px;
    border-radius: var(--radius-md, 12px);
    font-family: var(--sans);
    font-size: 13px;
    line-height: 1.55;
    border: 1px solid;
  }
  .result.success {
    background: oklch(0.80 0.06 160 / 0.1);
    color: var(--sage);
    border-color: oklch(0.80 0.06 160 / 0.4);
  }
  .result.error {
    background: oklch(0.62 0.18 22 / 0.1);
    color: oklch(0.78 0.14 22);
    border-color: oklch(0.62 0.18 22 / 0.4);
  }

  @media (max-width: 480px) {
    .sv-intro,
    form { padding-inline: 18px; }
    .sv-headline { font-size: 20px; }
  }
</style>
