<!-- website/src/components/portal/QuestionnaireWizard.svelte -->
<script lang="ts">
  type Props = {
    assignmentId: string;
    title: string;
    instructions: string;
    questions: Array<{ id: string; position: number; question_text: string; question_type: string }>;
    initialAnswers: Array<{ question_id: string; option_key: string }>;
  };
  const { assignmentId, title, instructions, questions, initialAnswers }: Props = $props();

  const answerMap = $state(new Map(initialAnswers.map(a => [a.question_id, a.option_key])));
  let currentIndex = $state(0);
  let phase: 'intro' | 'question' | 'done' = $state(initialAnswers.length === 0 ? 'intro' : 'question');
  let saving = $state(false);
  let submitting = $state(false);
  let error = $state('');

  // Resume at first unanswered question
  if (initialAnswers.length > 0) {
    const firstUnanswered = questions.findIndex(q => !answerMap.has(q.id));
    currentIndex = firstUnanswered >= 0 ? firstUnanswered : questions.length - 1;
  }

  const current = $derived(questions[currentIndex]);
  const answered = $derived(answerMap.size);
  const total = $derived(questions.length);
  const progressPct = $derived(Math.round((answered / total) * 100));

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
        answerMap.set(current.id, optionKey);
        if (currentIndex < questions.length - 1) {
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

  async function submit() {
    submitting = true; error = '';
    try {
      const r = await fetch(`/api/portal/questionnaires/${assignmentId}/submit`, { method: 'POST' });
      if (r.ok) {
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

  function likertOptions() {
    return ['1','2','3','4','5'];
  }

  function likertLabel(k: string) {
    const labels: Record<string, string> = { '1': 'Gar nicht', '2': 'Kaum', '3': 'Etwas', '4': 'Ziemlich', '5': 'Voll und ganz' };
    return labels[k] ?? k;
  }

  function abOptions(text: string) {
    const parts = text.split(/\n/).filter(Boolean);
    return parts.map(p => ({ key: p.charAt(0), label: p }));
  }
</script>

{#if phase === 'intro'}
  <div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold text-light font-serif mb-4">{title}</h1>
    {#if instructions}
      <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter mb-6">
        <p class="text-muted text-sm whitespace-pre-line">{instructions}</p>
      </div>
    {/if}
    <p class="text-muted text-sm mb-6">{total} Fragen · Ihre Antworten werden automatisch gespeichert.</p>
    <button onclick={() => { phase = 'question'; }}
      class="px-6 py-3 bg-gold text-dark rounded-xl font-semibold hover:bg-gold/80 transition-colors">
      Fragebogen starten →
    </button>
  </div>

{:else if phase === 'question' && current}
  <div class="max-w-2xl mx-auto">
    <!-- Progress -->
    <div class="mb-6">
      <div class="flex justify-between text-xs text-muted mb-2">
        <span>Frage {currentIndex + 1} von {total}</span>
        <span>{answered} beantwortet</span>
      </div>
      <div class="h-1.5 bg-dark-light rounded-full overflow-hidden">
        <div class="h-full bg-gold rounded-full transition-all duration-300" style={`width: ${progressPct}%`}></div>
      </div>
    </div>

    <!-- Question -->
    <div class="mb-6 p-6 bg-dark-light rounded-xl border border-dark-lighter">
      {#if current.question_type === 'ab_choice'}
        <p class="text-muted text-xs mb-3">Wählen Sie die Aussage, die besser auf Sie zutrifft:</p>
        <div class="flex flex-col gap-3">
          {#each abOptions(current.question_text) as opt}
            {@const isChosen = answerMap.get(current.id) === opt.key}
            <button
              onclick={() => selectOption(opt.key)}
              disabled={saving}
              class={`text-left p-4 rounded-xl border transition-all text-sm ${
                isChosen
                  ? 'border-gold bg-gold/10 text-light'
                  : 'border-dark-lighter bg-dark text-muted hover:border-gold/40 hover:text-light'
              }`}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      {:else if current.question_type === 'ja_nein'}
        <p class="text-light text-base mb-4 whitespace-pre-line">{current.question_text}</p>
        <div class="flex gap-3">
          {#each ['Ja', 'Nein'] as opt}
            {@const isChosen = answerMap.get(current.id) === opt}
            <button
              onclick={() => selectOption(opt)}
              disabled={saving}
              class={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                isChosen
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-dark-lighter bg-dark text-muted hover:border-gold/40 hover:text-light'
              }`}
            >
              {opt}
            </button>
          {/each}
        </div>
      {:else}
        <!-- Likert 1-5 -->
        <p class="text-light text-base mb-2 whitespace-pre-line">{current.question_text}</p>
        <p class="text-muted text-xs mb-4">Die Aussage trifft auf mich zu:</p>
        <div class="flex gap-2">
          {#each likertOptions() as opt}
            {@const isChosen = answerMap.get(current.id) === opt}
            <button
              onclick={() => selectOption(opt)}
              disabled={saving}
              class={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border text-sm transition-all ${
                isChosen
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-dark-lighter bg-dark text-muted hover:border-gold/40 hover:text-light'
              }`}
            >
              <span class="font-bold">{opt}</span>
              <span class="text-xs text-center leading-tight hidden sm:block">{likertLabel(opt)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if error}
      <p class="text-red-400 text-sm mb-3">{error}</p>
    {/if}

    <!-- Navigation -->
    <div class="flex justify-between items-center">
      <button
        onclick={() => currentIndex = Math.max(0, currentIndex - 1)}
        disabled={currentIndex === 0}
        class="px-4 py-2 border border-dark-lighter text-muted rounded-lg text-sm hover:text-light disabled:opacity-30 transition-colors"
      >← Zurück</button>

      {#if currentIndex < questions.length - 1}
        <button
          onclick={() => currentIndex++}
          disabled={!answerMap.has(current.id)}
          class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-50 transition-colors"
        >Weiter →</button>
      {:else}
        <button
          onclick={submit}
          disabled={submitting || answered < total}
          class="px-6 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Wird abgesendet…' : `Fragebogen absenden (${answered}/${total})`}
        </button>
      {/if}
    </div>
  </div>

{:else if phase === 'done'}
  <div class="max-w-2xl mx-auto text-center py-16">
    <div class="text-4xl mb-4">✓</div>
    <h1 class="text-2xl font-bold text-light font-serif mb-3">Vielen Dank!</h1>
    <p class="text-muted mb-6">Ihr Fragebogen wurde erfolgreich eingereicht. Ihr Coach wird die Ergebnisse mit Ihnen besprechen.</p>
    <a href="/portal" class="text-gold hover:underline text-sm">← Zurück zum Portal</a>
  </div>
{/if}
