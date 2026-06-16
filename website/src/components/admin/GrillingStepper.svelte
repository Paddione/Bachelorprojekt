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
  let idx = $state(0);
  const current = $derived(ordered[Math.min(idx, Math.max(0, ordered.length - 1))]);
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

  function dismiss() {
    if (!current) return;
    const entry = meta[questionnaireId] ?? { questions: [], dismissed: [] };
    if (!entry.dismissed.includes(current.id)) {
      meta = { ...meta, [questionnaireId]: { ...entry, dismissed: [...entry.dismissed, current.id] } };
    }
    if (idx >= ordered.length - 1 && idx > 0) idx -= 1;
    void patch({ grillingMeta: meta });
  }

  function prev() { if (idx > 0) idx -= 1; }
  function next() { if (idx < ordered.length - 1) idx += 1; }
</script>

<section class="bg-dark-light rounded-2xl border border-dark-lighter p-6 space-y-4">
  <header class="flex items-center justify-between">
    <h3 class="font-semibold">Grilling — Schritt für Schritt</h3>
    <span data-testid="grilling-progress" class="text-sm text-muted">
      Frage {Math.min(idx + 1, ordered.length)}/{ordered.length} ·
      {progress.answered} beantwortet · {progress.dismissed} verworfen
    </span>
    <button type="button" data-testid="grilling-mode" onclick={() => (mode = mode === 'step' ? 'all' : 'step')}>
      {mode === 'step' ? 'Alle anzeigen' : 'Schritt für Schritt'}
    </button>
  </header>

  {#if current}
    {#if current.section}<p class="text-xs uppercase text-muted">{current.section}</p>{/if}
    <p class="font-medium">{current.prompt}</p>
    <textarea class="w-full rounded-lg bg-dark border border-dark-lighter p-3" rows="4" aria-label="Antwort" oninput={onInput}>{answerText}</textarea>
    <div class="flex gap-2">
      <button type="button" onclick={prev} disabled={idx === 0}>Zurück</button>
      <button type="button" onclick={dismiss}>Verwerfen</button>
      <button type="button" onclick={next} disabled={idx >= ordered.length - 1}>Weiter</button>
    </div>
  {:else}
    <p class="text-muted">Keine Fragen.</p>
  {/if}
</section>
