<script lang="ts">
  import { QUESTIONNAIRES, type GrillingAnswers } from '../../lib/tickets/grilling';

  export let ticketId: string;
  export let grillingAnswers: GrillingAnswers | null;

  const QID = 'coaching-sessions-v1';
  const questionnaire = QUESTIONNAIRES[QID];

  // Local reactive copy of answers
  let answers: Record<string, string> = { ...(grillingAnswers?.[QID] ?? {}) };

  // Check if any answers exist
  $: hasAnswers = Object.values(answers).some(v => v.trim().length > 0);
  let open = Object.values(grillingAnswers?.[QID] ?? {}).some(v => v.trim().length > 0);

  // Save state
  let saveState: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function onInput(qid: string, value: string) {
    answers = { ...answers, [qid]: value };
    if (saveTimer) clearTimeout(saveTimer);
    saveState = 'idle';
    saveTimer = setTimeout(save, 800);
  }

  async function save() {
    saveState = 'saving';
    try {
      const payload: GrillingAnswers = { [QID]: { ...answers } };
      const r = await fetch(`/api/admin/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grillingAnswers: payload }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      saveState = 'saved';
      setTimeout(() => { saveState = 'idle'; }, 2000);
    } catch {
      saveState = 'error';
    }
  }

  $: answeredCount = Object.values(answers).filter(v => v.trim().length > 0).length;
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter">
  <!-- Header / toggle -->
  <button
    type="button"
    class="w-full flex items-center justify-between p-6 text-left"
    on:click={() => { open = !open; }}
    aria-expanded={open}
  >
    <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide">
      Grilling QA — {questionnaire.title}
    </h2>
    <span class="flex items-center gap-3">
      {#if saveState === 'saving'}
        <span class="text-xs text-muted">Speichern…</span>
      {:else if saveState === 'saved'}
        <span class="text-xs text-green-400">Gespeichert</span>
      {:else if saveState === 'error'}
        <span class="text-xs text-red-400">Fehler beim Speichern</span>
      {:else if hasAnswers}
        <span class="text-xs text-muted">{answeredCount}/23 beantwortet</span>
      {:else}
        <span class="text-xs text-muted">0/23 beantwortet</span>
      {/if}
      <span class="text-muted text-sm">{open ? '▲' : '▼'}</span>
    </span>
  </button>

  {#if open}
    <div class="px-6 pb-6 space-y-6">
      {#each questionnaire.sections as section (section.id)}
        <div>
          <h3 class="text-xs font-semibold text-gold uppercase tracking-wide mb-3 border-b border-dark-lighter pb-1">
            {section.title}
          </h3>
          <div class="space-y-4">
            {#each section.questions as q (q.id)}
              <div>
                <label for={`grilling-${q.id}`} class="block text-xs font-medium text-light/80 mb-1.5 leading-relaxed">
                  {q.label}
                </label>
                <textarea
                  id={`grilling-${q.id}`}
                  rows="3"
                  class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-light placeholder-muted resize-y focus:outline-none focus:border-gold/50 transition-colors"
                  placeholder="Antwort eingeben…"
                  value={answers[q.id] ?? ''}
                  on:input={(e) => onInput(q.id, (e.target as HTMLTextAreaElement).value)}
                ></textarea>
              </div>
            {/each}
          </div>
        </div>
      {/each}

      <div class="flex justify-end pt-2">
        <button
          type="button"
          class="px-4 py-2 text-xs bg-gold/20 text-gold border border-gold/30 rounded-lg hover:bg-gold/30 transition-colors disabled:opacity-50"
          disabled={saveState === 'saving'}
          on:click={save}
        >
          {saveState === 'saving' ? 'Speichern…' : 'Jetzt speichern'}
        </button>
      </div>
    </div>
  {/if}
</div>
