<!-- website/src/components/admin/TestResultsPanel.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  type TestStep = {
    question_id: string;
    question_text: string;
    test_expected_result: string | null;
    test_function_url: string | null;
    test_role: 'admin' | 'user' | null;
    position: number;
    last_result: 'erfüllt' | 'teilweise' | 'nicht_erfüllt' | null;
    last_result_at: string | null;
    last_success_at: string | null;
  };

  type TemplateResult = {
    template_id: string;
    template_title: string;
    questions: TestStep[];
  };

  let results: TemplateResult[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);

  // Bug ticket modal state
  let modalStep: TestStep | null = $state(null);
  let modalDescription = $state('');
  let modalCategory = $state('fehler');
  let modalLoading = $state(false);
  let modalError: string | null = $state(null);
  let modalSuccessId: string | null = $state(null);
  let modalCloseTimer: ReturnType<typeof setTimeout> | null = null;

  let expandedTemplates = $state<Set<string>>(new Set());

  async function load() {
    try {
      loading = true; error = null;
      const r = await fetch('/api/admin/test-results');
      if (r.ok) {
        results = await r.json();
        // Auto-expand all on first load
        expandedTemplates = new Set(results.map(r => r.template_id));
      } else {
        error = `Fehler ${r.status}`;
      }
    } catch {
      error = 'Netzwerkfehler';
    } finally {
      loading = false;
    }
  }

  onMount(() => { load(); });

  function fmtDate(d: string | null) {
    if (!d) return null;
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtDateTime(d: string | null) {
    if (!d) return null;
    return new Date(d).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function resultLabel(r: TestStep['last_result']) {
    if (r === 'erfüllt') return 'Erfüllt';
    if (r === 'teilweise') return 'Teilweise';
    if (r === 'nicht_erfüllt') return 'Nicht erfüllt';
    return 'Noch nicht getestet';
  }

  function resultClasses(r: TestStep['last_result']) {
    if (r === 'erfüllt') return 'bg-green-900/30 text-green-400 border-green-500/30';
    if (r === 'teilweise') return 'bg-amber-900/30 text-amber-400 border-amber-500/30';
    if (r === 'nicht_erfüllt') return 'bg-red-900/30 text-red-400 border-red-500/30';
    return 'bg-dark text-muted border-dark-lighter';
  }

  function openBugModal(step: TestStep) {
    if (modalCloseTimer) clearTimeout(modalCloseTimer);
    modalStep = step;
    modalDescription = `Test-Schritt ${step.position}: ${step.question_text}\n\nErgebnis: ${resultLabel(step.last_result)}\n\nErwartet: ${step.test_expected_result ?? '—'}`;
    modalCategory = 'fehler';
    modalLoading = false;
    modalError = null;
    modalSuccessId = null;
  }

  function closeModal() {
    if (modalCloseTimer) { clearTimeout(modalCloseTimer); modalCloseTimer = null; }
    modalStep = null;
    modalSuccessId = null;
    modalError = null;
  }

  async function submitTicket() {
    if (!modalStep) return;
    modalLoading = true; modalError = null;
    try {
      const res = await fetch('/api/admin/bugs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: modalDescription, category: modalCategory }),
      });
      const data = await res.json();
      if (!res.ok) { modalError = data.error ?? 'Unbekannter Fehler'; return; }
      modalSuccessId = data.ticketId;
      modalCloseTimer = setTimeout(closeModal, 3000);
    } catch {
      modalError = 'Netzwerkfehler';
    } finally {
      modalLoading = false;
    }
  }

  function toggleTemplate(id: string) {
    const next = new Set(expandedTemplates);
    if (next.has(id)) next.delete(id); else next.add(id);
    expandedTemplates = next;
  }
</script>

<div class="mb-2">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-sm font-medium text-muted uppercase tracking-wide">System-Testprotokolle</h2>
    <button onclick={load} class="text-xs text-muted hover:text-gold transition-colors">↻ Aktualisieren</button>
  </div>

  {#if loading}
    <p class="text-muted text-sm animate-pulse">Lade Testergebnisse…</p>
  {:else if error}
    <p class="text-red-400 text-sm">{error}</p>
  {:else if results.length === 0}
    <div class="p-4 bg-dark rounded-xl border border-dark-lighter text-muted text-sm">
      Keine System-Testvorlagen gefunden. Starte den Website-Pod neu, um die Seed-Templates zu erstellen.
    </div>
  {:else}
    {#each results as tpl}
      {@const passed = tpl.questions.filter(q => q.last_result === 'erfüllt').length}
      {@const untested = tpl.questions.filter(q => !q.last_result).length}
      {@const issues = tpl.questions.filter(q => q.last_result && q.last_result !== 'erfüllt').length}
      <div class="mb-4 bg-dark rounded-xl border border-dark-lighter overflow-hidden">
        <!-- Template header -->
        <button
          onclick={() => toggleTemplate(tpl.template_id)}
          class="w-full flex items-center justify-between p-4 hover:bg-dark-lighter/40 transition-colors text-left"
        >
          <div class="flex items-center gap-3 flex-wrap">
            <span class="text-light font-medium text-sm">{tpl.template_title}</span>
            <div class="flex gap-1.5">
              {#if passed > 0}
                <span class="px-2 py-0.5 rounded-full text-xs bg-green-900/30 text-green-400 border border-green-500/20">{passed} ✓</span>
              {/if}
              {#if issues > 0}
                <span class="px-2 py-0.5 rounded-full text-xs bg-red-900/30 text-red-400 border border-red-500/20">{issues} ✗</span>
              {/if}
              {#if untested > 0}
                <span class="px-2 py-0.5 rounded-full text-xs bg-dark text-muted border border-dark-lighter">{untested} offen</span>
              {/if}
            </div>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
            class={`w-4 h-4 text-muted flex-shrink-0 transition-transform ${expandedTemplates.has(tpl.template_id) ? 'rotate-180' : ''}`}>
            <path d="M4 6l4 4 4-4"/>
          </svg>
        </button>

        {#if expandedTemplates.has(tpl.template_id)}
          <div class="border-t border-dark-lighter divide-y divide-dark-lighter">
            {#each tpl.questions as step}
              <div class="flex items-start gap-3 px-4 py-3">
                <!-- Status indicator -->
                <div class="flex-shrink-0 mt-0.5">
                  {#if step.last_result === 'erfüllt'}
                    <div class="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-green-400"><path d="M3 8l3.5 3.5L13 5"/></svg>
                    </div>
                  {:else if step.last_result === 'teilweise'}
                    <div class="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                      <span class="text-amber-400 text-xs font-bold leading-none">~</span>
                    </div>
                  {:else if step.last_result === 'nicht_erfüllt'}
                    <div class="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-red-400"><path d="M4 4l8 8M12 4l-8 8"/></svg>
                    </div>
                  {:else}
                    <div class="w-5 h-5 rounded-full bg-dark border border-dark-lighter flex items-center justify-center">
                      <span class="text-muted text-xs">—</span>
                    </div>
                  {/if}
                </div>

                <!-- Step info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap mb-0.5">
                    <span class="text-muted text-xs">#{step.position}</span>
                    <span class={`px-1.5 py-0 rounded text-xs border ${
                      step.test_role === 'admin'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {step.test_role === 'admin' ? 'Admin' : 'Nutzer'}
                    </span>
                    {#if step.test_function_url}
                      <a href={step.test_function_url} target="_blank" rel="noopener noreferrer"
                        class="text-xs text-gold hover:underline truncate max-w-[200px]">
                        {step.test_function_url}
                      </a>
                    {/if}
                  </div>
                  <p class="text-light text-sm leading-snug">{step.question_text}</p>
                  <!-- Date info -->
                  <div class="flex items-center gap-3 mt-1 flex-wrap">
                    {#if step.last_result}
                      <span class={`text-xs px-2 py-0.5 rounded border ${resultClasses(step.last_result)}`}>
                        {resultLabel(step.last_result)}{step.last_result_at ? ` · ${fmtDate(step.last_result_at)}` : ''}
                      </span>
                    {/if}
                    {#if step.last_success_at && step.last_result !== 'erfüllt'}
                      <span class="text-xs text-muted">Zuletzt erfolgreich: {fmtDate(step.last_success_at)}</span>
                    {:else if step.last_result === 'erfüllt' && step.last_result_at}
                      <span class="text-xs text-green-500/70">Erfolgreich getestet: {fmtDateTime(step.last_result_at)}</span>
                    {/if}
                    {#if !step.last_result}
                      <span class="text-xs text-muted italic">Noch nicht getestet</span>
                    {/if}
                  </div>
                </div>

                <!-- Bug ticket button for failures/partial -->
                {#if step.last_result && step.last_result !== 'erfüllt'}
                  <button
                    onclick={() => openBugModal(step)}
                    class="flex-shrink-0 text-xs text-muted hover:text-red-400 border border-dark-lighter hover:border-red-500/40 rounded px-2 py-1 transition-colors"
                    title="Bug-Ticket erstellen"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                      <circle cx="8" cy="9" r="3.5"/><path d="M8 5.5V3.5M5 7H2.5M11 7h2.5M5.5 5l-2-2M10.5 5l2-2M5 12l-2 1.5M11 12l2 1.5"/>
                    </svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<!-- Bug ticket modal -->
{#if modalStep}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    role="dialog" aria-modal="true">
    <div class="bg-dark-light border border-dark-lighter rounded-2xl shadow-2xl w-full max-w-lg p-6">
      {#if modalSuccessId}
        <div class="text-center py-4">
          <div class="text-3xl mb-3">✓</div>
          <p class="text-green-400 font-semibold mb-1">Ticket erstellt</p>
          <p class="text-muted text-sm font-mono">{modalSuccessId}</p>
          <a href="/admin/bugs" class="text-gold text-xs hover:underline mt-2 block">Zu den Bugs →</a>
        </div>
      {:else}
        <div class="flex items-start justify-between mb-4">
          <div>
            <h3 class="text-light font-semibold">Bug-Ticket erstellen</h3>
            <p class="text-muted text-xs mt-1">Test-Schritt #{modalStep.position}: {modalStep.question_text}</p>
          </div>
          <button onclick={closeModal} class="text-muted hover:text-light p-1 ml-4">✕</button>
        </div>
        <div class="mb-4">
          <label class="block text-xs text-muted mb-1">Beschreibung</label>
          <textarea
            bind:value={modalDescription}
            rows="5"
            maxlength="2000"
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none resize-y"
          ></textarea>
          <p class="text-right text-xs text-muted mt-1">{modalDescription.length}/2000</p>
        </div>
        <div class="mb-4">
          <label class="block text-xs text-muted mb-1">Kategorie</label>
          <select bind:value={modalCategory}
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none">
            <option value="fehler">Fehler</option>
            <option value="verbesserung">Verbesserung</option>
            <option value="erweiterungswunsch">Erweiterungswunsch</option>
          </select>
        </div>
        {#if modalError}
          <p class="text-red-400 text-sm mb-3">{modalError}</p>
        {/if}
        <div class="flex gap-3 justify-end">
          <button onclick={closeModal}
            class="px-4 py-2 border border-dark-lighter text-muted rounded-lg text-sm hover:text-light transition-colors">
            Abbrechen
          </button>
          <button onclick={submitTicket} disabled={modalLoading}
            class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-500 disabled:opacity-50 transition-colors">
            {modalLoading ? 'Erstelle…' : 'Ticket erstellen'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
