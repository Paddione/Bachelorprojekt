<!-- website/src/components/portal/QuestionnaireWizard.svelte -->
<script lang="ts">
  type QuestionData = {
    id: string;
    position: number;
    question_text: string;
    question_type: string;
    test_expected_result?: string | null;
    test_function_url?: string | null;
    test_menu_path?: string | null;
    test_role?: string | null;
  };

  type Props = {
    assignmentId: string;
    title: string;
    instructions: string;
    questions: QuestionData[];
    initialAnswers: Array<{ question_id: string; option_key: string; details_text?: string | null }>;
  };
  const { assignmentId, title, instructions, questions, initialAnswers }: Props = $props();

  let answers = $state<Record<string, string>>(
    Object.fromEntries(initialAnswers.map(a => [a.question_id, a.option_key]))
  );
  let testDetails = $state<Record<string, string>>(
    Object.fromEntries(
      initialAnswers.filter(a => a.details_text).map(a => [a.question_id, a.details_text!])
    )
  );
  let pendingTestOption = $state('');
  const SESSION_KEY = `qwizard-${assignmentId}-index`;

  function readSavedIndex(): number | null {
    try {
      const v = sessionStorage.getItem(SESSION_KEY);
      if (v === null) return null;
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n >= 0 && n < questions.length ? n : null;
    } catch { return null; }
  }

  function resolveInitialIndex(): number {
    const saved = readSavedIndex();
    if (saved !== null) return saved;
    if (initialAnswers.length > 0) {
      const firstUnanswered = questions.findIndex(q => !(q.id in answers));
      return firstUnanswered >= 0 ? firstUnanswered : questions.length - 1;
    }
    return 0;
  }

  let currentIndex = $state(resolveInitialIndex());
  let phase: 'intro' | 'question' | 'done' | 'dismissed' = $state(initialAnswers.length === 0 ? 'intro' : 'question');
  let saving = $state(false);
  let submitting = $state(false);
  let error = $state('');

  // Skip modal state
  let showSkipModal = $state(false);
  let skipReason = $state('');
  let skipSaving = $state(false);
  let skipError = $state('');

  // Dismiss modal state
  let showDismissModal = $state(false);
  let dismissReason = $state('');
  let dismissing = $state(false);
  let dismissError = $state('');

  $effect(() => {
    try { sessionStorage.setItem(SESSION_KEY, String(currentIndex)); } catch { /* ignore */ }
  });

  $effect(() => {
    const qId = questions[currentIndex]?.id;
    pendingTestOption = qId ? (answers[qId] ?? '') : '';
  });

  const current = $derived(questions[currentIndex]);
  const answered = $derived(Object.keys(answers).length);
  const total = $derived(questions.length);
  const progressPct = $derived(Math.round((answered / total) * 100));
  const allAnswered = $derived(answered >= total);

  async function selectOption(optionKey: string) {
    if (!current || saving) return;
    saving = true; error = '';
    try {
      const r = await fetch(`/api/portal/questionnaires/${assignmentId}/answer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: current.id, option_key: optionKey }),
      });
      if (r.ok) {
        answers[current.id] = optionKey;
        if (currentIndex < questions.length - 1) {
          await new Promise(r => setTimeout(r, 200));
          currentIndex++;
        }
      } else {
        const d = await r.json().catch(() => ({}));
        error = d.error ?? 'Fehler beim Speichern.';
      }
    } catch {
      error = 'Netzwerkfehler.';
    } finally {
      saving = false;
    }
  }

  async function saveTestStep(questionId: string) {
    const optionKey = pendingTestOption || answers[questionId];
    if (!optionKey) return;
    saving = true; error = '';
    try {
      const r = await fetch(`/api/portal/questionnaires/${assignmentId}/answer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: questionId,
          option_key: optionKey,
          details_text: testDetails[questionId] ?? null,
        }),
      });
      if (r.ok) {
        answers[questionId] = optionKey;
        pendingTestOption = '';
        if (currentIndex < questions.length - 1) currentIndex++;
      } else {
        const d = await r.json().catch(() => ({}));
        error = d.error ?? 'Fehler beim Speichern.';
      }
    } catch {
      error = 'Netzwerkfehler.';
    } finally {
      saving = false;
    }
  }

  async function confirmSkip() {
    if (!skipReason.trim()) { skipError = 'Bitte geben Sie einen Grund an.'; return; }
    if (!current) return;
    skipSaving = true; skipError = '';
    try {
      const r = await fetch(`/api/portal/questionnaires/${assignmentId}/answer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: current.id,
          option_key: 'skipped',
          details_text: skipReason.trim(),
        }),
      });
      if (r.ok) {
        answers[current.id] = 'skipped';
        testDetails[current.id] = skipReason.trim();
        showSkipModal = false;
        skipReason = '';
        if (currentIndex < questions.length - 1) currentIndex++;
      } else {
        const d = await r.json().catch(() => ({}));
        skipError = d.error ?? 'Fehler beim Speichern.';
      }
    } catch {
      skipError = 'Netzwerkfehler.';
    } finally {
      skipSaving = false;
    }
  }

  async function confirmDismiss() {
    dismissing = true; dismissError = '';
    try {
      const r = await fetch(`/api/portal/questionnaires/${assignmentId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: dismissReason.trim() }),
      });
      if (r.ok) {
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
        showDismissModal = false;
        phase = 'dismissed';
      } else {
        const d = await r.json().catch(() => ({}));
        dismissError = d.error ?? 'Fehler.';
      }
    } catch {
      dismissError = 'Netzwerkfehler.';
    } finally {
      dismissing = false;
    }
  }

  async function submit() {
    submitting = true; error = '';
    try {
      const r = await fetch(`/api/portal/questionnaires/${assignmentId}/submit`, { method: 'POST' });
      if (r.ok) {
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
        phase = 'done';
      } else {
        const d = await r.json().catch(() => ({}));
        error = d.error ?? 'Fehler beim Absenden.';
      }
    } catch {
      error = 'Netzwerkfehler.';
    } finally {
      submitting = false;
    }
  }

  function likertOptions() { return ['1','2','3','4','5']; }

  function likertLabel(k: string) {
    const labels: Record<string, string> = { '1': 'Gar nicht', '2': 'Kaum', '3': 'Etwas', '4': 'Ziemlich', '5': 'Voll und ganz' };
    return labels[k] ?? k;
  }

  function abOptions(text: string) {
    const parts = text.split(/\n/).filter(Boolean);
    return parts.map(p => ({ key: p.charAt(0), label: p }));
  }
</script>

<!-- Skip reason modal -->
{#if showSkipModal}
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50" role="dialog">
    <div class="bg-dark-light border border-dark-lighter rounded-xl p-6 w-full max-w-md mx-4 space-y-4">
      <h3 class="text-light font-semibold">Frage überspringen</h3>
      <p class="text-muted text-sm">Bitte geben Sie einen Grund an, warum diese Frage übersprungen wird.</p>
      <textarea
        bind:value={skipReason}
        rows="3"
        placeholder="Grund für das Überspringen…"
        class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none resize-none"
      ></textarea>
      {#if skipError}<p class="text-red-400 text-xs">{skipError}</p>{/if}
      <div class="flex gap-2 justify-end">
        <button onclick={() => { showSkipModal = false; skipReason = ''; skipError = ''; }}
          class="px-4 py-2 text-sm text-muted hover:text-light transition-colors cursor-pointer">
          Abbrechen
        </button>
        <button onclick={confirmSkip} disabled={skipSaving || !skipReason.trim()}
          class="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-500 disabled:opacity-40 cursor-pointer">
          {skipSaving ? 'Speichere…' : 'Überspringen'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Dismiss questionnaire modal -->
{#if showDismissModal}
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50" role="dialog">
    <div class="bg-dark-light border border-dark-lighter rounded-xl p-6 w-full max-w-md mx-4 space-y-4">
      <h3 class="text-light font-semibold">Fragebogen ablehnen</h3>
      <p class="text-muted text-sm">Möchten Sie diesen Fragebogen wirklich ablehnen? Ihr Coach wird darüber informiert.</p>
      <textarea
        bind:value={dismissReason}
        rows="3"
        placeholder="Optionaler Grund für die Ablehnung…"
        class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none resize-none"
      ></textarea>
      {#if dismissError}<p class="text-red-400 text-xs">{dismissError}</p>{/if}
      <div class="flex gap-2 justify-end">
        <button onclick={() => { showDismissModal = false; dismissReason = ''; dismissError = ''; }}
          class="px-4 py-2 text-sm text-muted hover:text-light transition-colors cursor-pointer">
          Abbrechen
        </button>
        <button onclick={confirmDismiss} disabled={dismissing}
          class="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-semibold hover:bg-red-600 disabled:opacity-40 cursor-pointer">
          {dismissing ? '…' : 'Fragebogen ablehnen'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if phase === 'intro'}
  <div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold text-light font-serif mb-4">{title}</h1>
    {#if instructions}
      <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter mb-6">
        <p class="text-muted text-sm whitespace-pre-line">{instructions}</p>
      </div>
    {/if}
    <p class="text-muted text-sm mb-6">{total} Fragen · Ihre Antworten werden automatisch gespeichert.</p>
    <div class="flex items-center gap-4">
      <button onclick={() => { phase = 'question'; }}
        class="px-6 py-3 bg-gold text-dark rounded-xl font-semibold hover:bg-gold/80 transition-colors cursor-pointer">
        Fragebogen starten →
      </button>
      <button onclick={() => { showDismissModal = true; }}
        class="px-4 py-2 text-muted text-sm hover:text-red-400 transition-colors cursor-pointer underline underline-offset-2">
        Ablehnen
      </button>
    </div>
  </div>

{:else if phase === 'question' && current}
  <div class="max-w-2xl mx-auto">
    <!-- Progress -->
    <div class="mb-6">
      <div class="flex justify-between text-xs text-muted mb-2">
        <span>Frage {currentIndex + 1} von {total}</span>
        <span>{answered} von {total} beantwortet</span>
      </div>
      <div class="h-2 bg-dark-light rounded-full overflow-hidden">
        <div class="h-full bg-gold rounded-full transition-all duration-300" style={`width: ${progressPct}%`}></div>
      </div>
    </div>

    <!-- Question -->
    <div class="mb-6 p-6 bg-dark-light rounded-xl border border-dark-lighter">
      {#if current.question_type === 'test_step'}
        {#if current.test_role}
          <div class="flex items-center gap-2 mb-4">
            <span class={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${
              current.test_role === 'admin'
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}>
              {current.test_role === 'admin' ? '🔧 Admin-Schritt' : '👤 Nutzer-Schritt'}
            </span>
          </div>
        {/if}
        <p class="text-xs text-muted uppercase tracking-wide mb-1">Was zu testen:</p>
        <p class="text-light text-base mb-4 font-medium">{current.question_text}</p>
        {#if current.test_expected_result}
          <div class="mb-4 p-3 rounded-lg bg-dark border border-dark-lighter">
            <p class="text-xs text-muted uppercase tracking-wide mb-1">Erwartetes Ergebnis:</p>
            <p class="text-muted text-sm">{current.test_expected_result}</p>
          </div>
        {/if}
        {#if current.test_function_url || current.test_menu_path}
          <div class="flex flex-col gap-1.5 mb-5">
            {#if current.test_function_url}
              <a href={current.test_function_url} target="_blank" rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 text-gold text-xs hover:underline">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 flex-shrink-0">
                  <path d="M6.5 2.5h-4v11h11v-4M9.5 2.5H13.5V6.5M13.5 2.5L7 9"/>
                </svg>
                Direkt öffnen
              </a>
            {/if}
            {#if current.test_menu_path}
              <span class="inline-flex items-start gap-1.5 text-muted text-xs">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 flex-shrink-0 mt-px">
                  <path d="M2 4h12M2 8h8M2 12h5"/>
                </svg>
                Oder über Menü: <span class="text-light/70 ml-0.5">{current.test_menu_path}</span>
              </span>
            {/if}
          </div>
        {/if}
        {#if answers[current.id] === 'skipped'}
          <div class="mb-3 p-3 rounded-lg bg-amber-900/20 border border-amber-500/20">
            <p class="text-amber-400 text-xs font-semibold mb-1">Übersprungen</p>
            {#if testDetails[current.id]}
              <p class="text-muted text-xs">{testDetails[current.id]}</p>
            {/if}
          </div>
        {/if}
        <p class="text-xs text-muted uppercase tracking-wide mb-2">Testergebnis:</p>
        <div class="flex flex-col gap-2 mb-4">
          {#each [
            { key: 'erfüllt', label: 'Test erfüllt', cls: 'border-green-500 bg-green-900/20 text-green-400' },
            { key: 'teilweise', label: 'Test zum Teil erfüllt', cls: 'border-amber-500 bg-amber-900/20 text-amber-400' },
            { key: 'nicht_erfüllt', label: 'Test nicht erfüllt', cls: 'border-red-500 bg-red-900/20 text-red-400' },
          ] as opt}
            {@const isChosen = (pendingTestOption || answers[current.id]) === opt.key}
            <button
              onclick={() => { pendingTestOption = opt.key; }}
              disabled={saving}
              class={`text-left px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer flex items-center gap-3 ${
                isChosen ? opt.cls : 'border-dark-lighter bg-dark text-muted hover:border-gold/40 hover:text-light'
              } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <span class={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isChosen ? 'border-current' : 'border-muted/40'}`}></span>
              {opt.label}
            </button>
          {/each}
        </div>
        <div>
          <label class="block text-xs text-muted mb-1">Details / Beobachtungen (optional)</label>
          <textarea
            value={testDetails[current.id] ?? ''}
            oninput={(e) => { testDetails[current.id] = (e.target as HTMLTextAreaElement).value; }}
            rows="3"
            placeholder="Fehlermeldungen, Screenshots-Hinweise oder Beobachtungen…"
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none resize-y"
          ></textarea>
        </div>
      {:else if current.question_type === 'ab_choice'}
        <p class="text-muted text-xs mb-3">Wählen Sie die Aussage, die besser auf Sie zutrifft:</p>
        {#if answers[current.id] === 'skipped'}
          <div class="mb-3 p-3 rounded-lg bg-amber-900/20 border border-amber-500/20">
            <p class="text-amber-400 text-xs font-semibold mb-1">Übersprungen</p>
            {#if testDetails[current.id]}
              <p class="text-muted text-xs">{testDetails[current.id]}</p>
            {/if}
          </div>
        {/if}
        <div class="flex flex-col gap-3">
          {#each abOptions(current.question_text) as opt}
            {@const isChosen = answers[current.id] === opt.key}
            <button
              onclick={() => selectOption(opt.key)}
              disabled={saving}
              class={`text-left p-4 rounded-xl border-2 transition-all text-sm cursor-pointer flex items-start gap-3 ${
                isChosen
                  ? 'border-gold bg-gold/20 text-light shadow-[0_0_0_1px_theme(colors.gold/0.3)]'
                  : 'border-dark-lighter bg-dark text-muted hover:border-gold/50 hover:text-light hover:bg-dark-lighter'
              } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <span class={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                isChosen ? 'border-gold bg-gold text-dark' : 'border-muted/40'
              }`}>
                {#if isChosen}✓{/if}
              </span>
              <span>{opt.label}</span>
            </button>
          {/each}
        </div>
      {:else if current.question_type === 'ja_nein'}
        <p class="text-light text-base mb-4 whitespace-pre-line">{current.question_text}</p>
        {#if answers[current.id] === 'skipped'}
          <div class="mb-3 p-3 rounded-lg bg-amber-900/20 border border-amber-500/20">
            <p class="text-amber-400 text-xs font-semibold mb-1">Übersprungen</p>
            {#if testDetails[current.id]}
              <p class="text-muted text-xs">{testDetails[current.id]}</p>
            {/if}
          </div>
        {/if}
        <div class="flex gap-3">
          {#each ['Ja', 'Nein'] as opt}
            {@const isChosen = answers[current.id] === opt}
            <button
              onclick={() => selectOption(opt)}
              disabled={saving}
              class={`flex-1 py-4 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer ${
                isChosen
                  ? 'border-gold bg-gold text-dark shadow-md'
                  : 'border-dark-lighter bg-dark text-muted hover:border-gold/50 hover:text-light hover:bg-dark-lighter'
              } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {#if isChosen}<span class="mr-1">✓</span>{/if}{opt}
            </button>
          {/each}
        </div>
      {:else}
        <!-- Likert 1-5 -->
        <p class="text-light text-base mb-2 whitespace-pre-line">{current.question_text}</p>
        <p class="text-muted text-xs mb-4">Die Aussage trifft auf mich zu:</p>
        {#if answers[current.id] === 'skipped'}
          <div class="mb-3 p-3 rounded-lg bg-amber-900/20 border border-amber-500/20">
            <p class="text-amber-400 text-xs font-semibold mb-1">Übersprungen</p>
            {#if testDetails[current.id]}
              <p class="text-muted text-xs">{testDetails[current.id]}</p>
            {/if}
          </div>
        {/if}
        <div class="flex gap-2">
          {#each likertOptions() as opt}
            {@const isChosen = answers[current.id] === opt}
            <button
              onclick={() => selectOption(opt)}
              disabled={saving}
              class={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm transition-all cursor-pointer ${
                isChosen
                  ? 'border-gold bg-gold text-dark shadow-md'
                  : 'border-dark-lighter bg-dark text-muted hover:border-gold/50 hover:text-light hover:bg-dark-lighter'
              } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <span class="font-bold text-base">{opt}</span>
              <span class="text-xs text-center leading-tight hidden sm:block">{likertLabel(opt)}</span>
            </button>
          {/each}
        </div>
        <div class="flex justify-between text-xs text-muted mt-2 px-1">
          <span>Gar nicht</span>
          <span>Voll und ganz</span>
        </div>
      {/if}
    </div>

    {#if saving}
      <p class="text-muted text-xs mb-3 animate-pulse">Speichern…</p>
    {/if}

    {#if error}
      <p class="text-red-400 text-sm mb-3">{error}</p>
    {/if}

    <!-- Navigation -->
    <div class="flex justify-between items-center">
      <button
        onclick={() => { currentIndex = Math.max(0, currentIndex - 1); }}
        disabled={currentIndex === 0}
        class="px-4 py-2 border border-dark-lighter text-muted rounded-lg text-sm hover:text-light disabled:opacity-30 transition-colors cursor-pointer"
      >← Zurück</button>

      <div class="flex items-center gap-2">
        <!-- Skip button (not for test_step — test_step already has "not tested" implicit state) -->
        {#if current.question_type !== 'test_step' && answers[current.id] !== 'skipped'}
          <button
            onclick={() => { showSkipModal = true; }}
            disabled={saving}
            class="px-3 py-2 text-xs text-muted hover:text-amber-400 border border-dark-lighter rounded-lg transition-colors cursor-pointer"
          >Überspringen</button>
        {/if}

        {#if current.question_type === 'test_step'}
          {#if currentIndex < questions.length - 1}
            <button
              onclick={() => saveTestStep(current.id)}
              disabled={saving || (!pendingTestOption && !(current.id in answers))}
              class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-40 transition-colors cursor-pointer"
            >{saving ? 'Speichere…' : 'Speichern & Weiter →'}</button>
          {:else}
            <button
              onclick={() => saveTestStep(current.id)}
              disabled={saving || (!pendingTestOption && !(current.id in answers))}
              class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-40 transition-colors cursor-pointer"
            >{saving ? 'Speichere…' : 'Letzten Schritt speichern ✓'}</button>
          {/if}
        {:else if currentIndex < questions.length - 1}
          <button
            onclick={() => currentIndex++}
            disabled={!(current.id in answers)}
            class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-40 transition-colors cursor-pointer"
          >Weiter →</button>
        {:else}
          <div class="flex flex-col items-end gap-1">
            {#if !allAnswered}
              <p class="text-muted text-xs">Noch {total - answered} Frage(n) offen</p>
            {/if}
            <button
              onclick={submit}
              disabled={submitting || !allAnswered}
              class="px-6 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {submitting ? 'Wird abgesendet…' : allAnswered ? 'Fragebogen absenden ✓' : `Absenden (${answered}/${total})`}
            </button>
          </div>
        {/if}
      </div>
    </div>

    {#if allAnswered && questions.some(q => q.question_type === 'test_step')}
      <div class="mt-4 flex justify-end">
        <button
          onclick={submit}
          disabled={submitting}
          class="px-6 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-40 transition-colors cursor-pointer"
        >
          {submitting ? 'Wird abgesendet…' : 'Testprotokoll absenden ✓'}
        </button>
      </div>
    {/if}

    <!-- Dismiss link at bottom -->
    <div class="mt-6 flex justify-center">
      <button onclick={() => { showDismissModal = true; }}
        class="text-xs text-muted hover:text-red-400 transition-colors cursor-pointer underline underline-offset-2">
        Fragebogen ablehnen
      </button>
    </div>
  </div>

{:else if phase === 'done'}
  <div class="max-w-2xl mx-auto text-center py-16">
    <div class="text-5xl mb-4">✓</div>
    <h1 class="text-2xl font-bold text-light font-serif mb-3">Vielen Dank!</h1>
    <p class="text-muted mb-6">Ihr Fragebogen wurde erfolgreich eingereicht. Ihr Coach wird die Ergebnisse mit Ihnen besprechen.</p>
    <a href="/portal" class="text-gold hover:underline text-sm">← Zurück zum Portal</a>
  </div>

{:else if phase === 'dismissed'}
  <div class="max-w-2xl mx-auto text-center py-16">
    <div class="text-5xl mb-4">✗</div>
    <h1 class="text-2xl font-bold text-light font-serif mb-3">Fragebogen abgelehnt</h1>
    <p class="text-muted mb-6">Sie haben diesen Fragebogen abgelehnt. Ihr Coach wurde benachrichtigt und wird sich bei Ihnen melden.</p>
    <a href="/portal" class="text-gold hover:underline text-sm">← Zurück zum Portal</a>
  </div>
{/if}
