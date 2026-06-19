<script lang="ts">
  import {
    QUESTIONNAIRES, resolveQuestions, questionStatus, grillingProgress,
    type GrillingAnswers, type GrillingMeta,
  } from '../../lib/tickets/grilling';

  let {
    ticketId,
    questionnaireId,
    grillingAnswers: initAnswers = null,
    grillingMeta: initMeta = null,
  }: {
    ticketId: string;
    questionnaireId: string;
    grillingAnswers: GrillingAnswers | null;
    grillingMeta: GrillingMeta | null;
  } = $props();

  let answers = $state<GrillingAnswers>(initAnswers ?? {});
  let meta = $state<GrillingMeta>(initMeta ?? {});

  const all = $derived(resolveQuestions(questionnaireId, QUESTIONNAIRES, meta));
  const ordered = $derived([
    ...all.filter((q) => questionStatus(q.id, questionnaireId, answers, meta) === 'open'),
    ...all.filter((q) => questionStatus(q.id, questionnaireId, answers, meta) !== 'open'),
  ]);
  const progress = $derived(grillingProgress(questionnaireId, QUESTIONNAIRES, answers, meta));

  let mode = $state<'step' | 'all'>('step');

  // Track current question by stable ID (not position) so mid-typing reordering of `ordered`
  // never changes which question is shown. Only navigation (prev/next/dismiss) updates this.
  let currentId = $state<string>('');

  $effect(() => {
    // (Re-)initialize when currentId is missing or no longer in the question set.
    // `all` depends only on questionnaire structure (not answers), so this only triggers
    // on questionnaire switch or first render — not on every keystroke.
    const ids = new Set(all.map((q) => q.id));
    if (!currentId || !ids.has(currentId)) {
      currentId = ordered[0]?.id ?? '';
    }
  });

  const current = $derived(all.find((q) => q.id === currentId) ?? null);
  const currentIdx = $derived(ordered.findIndex((q) => q.id === currentId));
  const answerText = $derived(current ? (answers[questionnaireId]?.[current.id] ?? '') : '');

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/admin/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function onInput(e: Event) {
    if (!current) return;
    const value = (e.target as HTMLTextAreaElement).value;
    const qn = answers[questionnaireId] ?? {};
    answers = { ...answers, [questionnaireId]: { ...qn, [current.id]: value } };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void patch({ grillingAnswers: answers }); }, 800);
  }

  function selectChoice(value: string) {
    if (!current) return;
    const qn = answers[questionnaireId] ?? {};
    answers = { ...answers, [questionnaireId]: { ...qn, [current.id]: value } };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void patch({ grillingAnswers: answers }); }, 800);
  }

  function dismiss() {
    if (!current) return;
    const i = ordered.findIndex((q) => q.id === currentId);
    // Capture next BEFORE meta update — Svelte 5 derived re-evaluates on read,
    // so reading `ordered` after `meta = …` would yield the post-dismiss sort.
    const next = ordered[i + 1] ?? ordered[Math.max(0, i - 1)];
    const entry = meta[questionnaireId] ?? { questions: [], dismissed: [] };
    if (!entry.dismissed.includes(current.id)) {
      meta = { ...meta, [questionnaireId]: { ...entry, dismissed: [...entry.dismissed, current.id] } };
    }
    if (next && next.id !== current.id) currentId = next.id;
    void patch({ grillingMeta: meta });
  }

  function prev() {
    const i = ordered.findIndex((q) => q.id === currentId);
    if (i > 0) currentId = ordered[i - 1].id;
  }
  function next() {
    const i = ordered.findIndex((q) => q.id === currentId);
    if (i < ordered.length - 1) currentId = ordered[i + 1].id;
  }

  function exportAnswers() {
    const qs = resolveQuestions(questionnaireId, QUESTIONNAIRES, meta);
    const qn = QUESTIONNAIRES[questionnaireId];
    const title = qn?.title ?? questionnaireId;
    const lines: string[] = [`# Grilling: ${title}`, ''];

    let currentSection = '';
    for (const q of qs) {
      if (q.section && q.section !== currentSection) {
        currentSection = q.section;
        lines.push(`## ${currentSection}`, '');
      }
      const answer = answers[questionnaireId]?.[q.id] ?? '';
      lines.push(`**${q.prompt}**`, answer || '(keine Antwort)', '');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grilling-${questionnaireId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const hasAnswers = $derived(
    Object.values(answers[questionnaireId] ?? {}).some((v) => v.trim() !== '')
  );
</script>

<section class="bg-dark-light rounded-2xl border border-dark-lighter p-6 space-y-4">
  <header class="flex items-center justify-between">
    <h3 class="font-semibold">Grilling — Schritt für Schritt</h3>
    <span data-testid="grilling-progress" class="text-sm text-muted">
      Frage {Math.min(currentIdx + 1, ordered.length)}/{ordered.length} ·
      {progress.answered} beantwortet · {progress.dismissed} verworfen
    </span>
    <div class="flex gap-2">
      <button type="button" data-testid="grilling-mode" onclick={() => (mode = mode === 'step' ? 'all' : 'step')}>
        {mode === 'step' ? 'Alle anzeigen' : 'Schritt für Schritt'}
      </button>
      {#if hasAnswers}
        <button type="button" onclick={exportAnswers} class="text-xs text-gold/80 hover:text-gold border border-gold/30 rounded px-2 py-1">
          Export
        </button>
      {/if}
    </div>
  </header>

  {#if mode === 'all'}
    <ul data-testid="grilling-all-list" class="space-y-2">
      {#each all as q}
        {@const st = questionStatus(q.id, questionnaireId, answers, meta)}
        <li class="rounded-lg border p-3 {st === 'answered' ? 'border-gold/50 bg-dark' : st === 'dismissed' ? 'border-dark-lighter opacity-60' : 'border-dark-lighter'}">
          <p class="text-sm font-medium">{q.prompt}</p>
          {#if st === 'answered'}
            <p class="mt-1 text-xs text-muted truncate">{answers[questionnaireId]?.[q.id]}</p>
          {:else if st === 'dismissed'}
            <p class="mt-1 text-xs text-muted italic">verworfen</p>
          {:else}
            <input
              class="mt-2 w-full rounded bg-dark border border-dark-lighter p-2 text-sm"
              aria-label={`Antwort ${q.id}`}
              value={answers[questionnaireId]?.[q.id] ?? ''}
              oninput={(e) => { currentId = q.id; onInput(e); }}
            />
          {/if}
        </li>
      {/each}
    </ul>
  {:else if current}
    {#if current.section}<p class="text-xs uppercase text-muted">{current.section}</p>{/if}
    <p class="font-medium">{current.prompt}</p>
    {#if current.choices && current.choices.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each current.choices as choice}
          <button
            type="button"
            data-testid={`grilling-choice-${choice.replace(/\s/g, '-')}`}
            onclick={() => selectChoice(choice)}
            class="rounded-full border px-3 py-1 text-sm transition-colors {answerText === choice ? 'border-gold text-gold' : 'border-dark-lighter text-muted hover:border-gold/60'}"
          >{choice}</button>
        {/each}
      </div>
    {/if}
    <textarea class="w-full rounded-lg bg-dark border border-dark-lighter p-3" rows="4" aria-label="Antwort" oninput={onInput}>{answerText}</textarea>
    <div class="flex gap-2">
      <button type="button" onclick={prev} disabled={currentIdx <= 0}>Zurück</button>
      <button type="button" onclick={dismiss}>Verwerfen</button>
      <button type="button" onclick={next} disabled={currentIdx >= ordered.length - 1}>Weiter</button>
    </div>
  {:else}
    <p class="text-muted">Keine Fragen.</p>
  {/if}
</section>
