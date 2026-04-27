<!-- website/src/components/admin/QuestionnaireTemplateEditor.svelte -->
<script lang="ts">
  type Dim = { id?: string; name: string; position: number; threshold_mid: number | null; threshold_high: number | null; score_multiplier: number };
  type AnswerOpt = { option_key: string; label: string; dimension_id: string | null; weight: number };
  type Question = {
    id?: string; position: number; question_text: string;
    question_type: 'ab_choice' | 'ja_nein' | 'likert_5' | 'test_step';
    answer_options: AnswerOpt[];
    test_expected_result?: string | null;
    test_function_url?: string | null;
    test_role?: 'admin' | 'user' | null;
  };
  type Tpl = { id: string; title: string; description: string; instructions: string; status: string; dimensions: Dim[]; questions: Question[] };

  let templates: { id: string; title: string; status: string }[] = $state([]);
  let loading = $state(false);
  let editing: Tpl | null = $state(null);
  let saveMsg = $state('');
  let saving = $state(false);
  let deleteConfirm: string | null = $state(null);

  async function loadList() {
    loading = true;
    try {
      const r = await fetch('/api/admin/questionnaires/templates');
      templates = r.ok ? await r.json() : [];
    } finally { loading = false; }
  }

  $effect(() => { loadList(); });

  async function openTemplate(id: string) {
    const r = await fetch(`/api/admin/questionnaires/templates/${id}`);
    if (r.ok) editing = await r.json();
  }

  function newTemplate() {
    editing = {
      id: '', title: '', description: '', instructions: '', status: 'draft',
      dimensions: [], questions: [],
    };
  }

  function addDimension() {
    if (!editing) return;
    editing.dimensions = [...editing.dimensions, {
      name: '', position: editing.dimensions.length,
      threshold_mid: null, threshold_high: null, score_multiplier: 1,
    }];
  }

  function removeDimension(i: number) {
    if (!editing) return;
    editing.dimensions = editing.dimensions.filter((_, idx) => idx !== i);
  }

  function defaultOptions(type: Question['question_type']): AnswerOpt[] {
    if (type === 'ab_choice') return [
      { option_key: 'A', label: 'A', dimension_id: null, weight: 1 },
      { option_key: 'B', label: 'B', dimension_id: null, weight: 1 },
    ];
    if (type === 'ja_nein') return [
      { option_key: 'Ja', label: 'Ja', dimension_id: null, weight: 1 },
      { option_key: 'Nein', label: 'Nein', dimension_id: null, weight: 1 },
    ];
    if (type === 'test_step') return [];
    return ['1','2','3','4','5'].map(k => ({ option_key: k, label: k, dimension_id: null, weight: 1 }));
  }

  function addQuestion() {
    if (!editing) return;
    const type: Question['question_type'] = 'ab_choice';
    editing.questions = [...editing.questions, {
      position: editing.questions.length + 1,
      question_text: '', question_type: type,
      answer_options: defaultOptions(type),
      test_expected_result: null,
      test_function_url: null,
      test_role: null,
    }];
  }

  function changeQuestionType(i: number, type: Question['question_type']) {
    if (!editing) return;
    editing.questions = editing.questions.map((q, idx) =>
      idx === i ? { ...q, question_type: type, answer_options: defaultOptions(type) } : q
    );
  }

  function removeQuestion(i: number) {
    if (!editing) return;
    editing.questions = editing.questions.filter((_, idx) => idx !== i)
      .map((q, idx) => ({ ...q, position: idx + 1 }));
  }

  async function save() {
    if (!editing) return;
    saving = true; saveMsg = '';
    try {
      const isNew = !editing.id;
      const url = isNew ? '/api/admin/questionnaires/templates' : `/api/admin/questionnaires/templates/${editing.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew
        ? { title: editing.title, description: editing.description, instructions: editing.instructions }
        : { title: editing.title, description: editing.description, instructions: editing.instructions, status: editing.status, dimensions: editing.dimensions, questions: editing.questions };
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json();
      if (r.ok) {
        if (isNew) {
          editing = { ...editing, id: data.id };
          saveMsg = 'Vorlage erstellt. Bitte Dimensionen und Fragen hinzufügen und erneut speichern.';
        } else {
          saveMsg = 'Gespeichert.';
        }
        await loadList();
      } else {
        saveMsg = data.error ?? 'Fehler.';
      }
    } finally { saving = false; }
  }

  async function publish() {
    if (!editing?.id) return;
    saving = true;
    const r = await fetch(`/api/admin/questionnaires/templates/${editing.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    });
    if (r.ok) { editing = { ...editing!, status: 'published' }; await loadList(); }
    saving = false;
  }

  async function deleteTemplate(id: string) {
    await fetch(`/api/admin/questionnaires/templates/${id}`, { method: 'DELETE' });
    deleteConfirm = null; editing = null; await loadList();
  }

  function statusBadge(s: string) {
    if (s === 'published') return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s === 'archived') return 'bg-red-500/10 text-red-400 border-red-500/20';
    return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  }
</script>

{#if !editing}
  <div class="flex justify-between items-center mb-4">
    <p class="text-muted text-sm">{templates.length} Vorlage{templates.length !== 1 ? 'n' : ''}</p>
    <button onclick={newTemplate} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Neue Vorlage</button>
  </div>
  {#if loading}
    <p class="text-muted text-sm">Lade…</p>
  {:else if templates.length === 0}
    <p class="text-muted text-sm">Noch keine Vorlagen.</p>
  {:else}
    <div class="flex flex-col gap-2">
      {#each templates as t}
        <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter flex items-center justify-between gap-4">
          <div class="flex-1 min-w-0">
            <p class="text-light font-medium truncate">{t.title}</p>
            <span class={`mt-1 inline-block px-2 py-0.5 rounded border text-xs ${statusBadge(t.status)}`}>
              {t.status === 'published' ? 'Veröffentlicht' : t.status === 'archived' ? 'Archiviert' : 'Entwurf'}
            </span>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            <button onclick={() => openTemplate(t.id)} class="text-xs text-muted hover:text-gold">Bearbeiten</button>
            {#if deleteConfirm === t.id}
              <span class="text-xs text-muted">Sicher?</span>
              <button onclick={() => deleteTemplate(t.id)} class="text-xs text-red-400 hover:text-red-300">Ja</button>
              <button onclick={() => deleteConfirm = null} class="text-xs text-muted hover:text-light">Nein</button>
            {:else}
              <button onclick={() => deleteConfirm = t.id} class="text-xs text-muted hover:text-red-400">Löschen</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
{:else}
  <!-- Editor -->
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-lg font-semibold text-light">{editing.id ? editing.title || 'Vorlage bearbeiten' : 'Neue Vorlage'}</h2>
    <button onclick={() => editing = null} class="text-sm text-muted hover:text-light">Abbrechen</button>
  </div>

  <!-- Metadata -->
  <div class="flex flex-col gap-3 mb-6 p-4 bg-dark rounded-xl border border-dark-lighter">
    <h3 class="text-xs text-muted uppercase tracking-wide">Metadaten</h3>
    <div>
      <label class="block text-sm text-muted mb-1">Titel *</label>
      <input bind:value={editing.title} class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none" />
    </div>
    <div>
      <label class="block text-sm text-muted mb-1">Beschreibung (intern)</label>
      <input bind:value={editing.description} class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none" />
    </div>
    <div>
      <label class="block text-sm text-muted mb-1">Anweisungen (für Klient)</label>
      <textarea bind:value={editing.instructions} rows="3"
        class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none resize-y"></textarea>
    </div>
  </div>

  {#if editing.id}
    <!-- Dimensions -->
    <div class="mb-6 p-4 bg-dark rounded-xl border border-dark-lighter">
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-xs text-muted uppercase tracking-wide">Dimensionen</h3>
        <button onclick={addDimension} class="text-xs text-gold hover:text-gold/80">+ Dimension</button>
      </div>
      {#each editing.dimensions as dim, i}
        <div class="mb-3 p-3 bg-dark-light rounded-lg border border-dark-lighter">
          <div class="grid grid-cols-2 gap-2 mb-2">
            <input bind:value={dim.name} placeholder="Name (z.B. Sei perfekt!)"
              class="col-span-2 bg-dark border border-dark-lighter rounded px-2 py-1.5 text-light text-sm focus:border-gold outline-none" />
            <div>
              <label class="block text-xs text-muted mb-1">Schwelle mittel</label>
              <input type="number" bind:value={dim.threshold_mid} placeholder="z.B. 60"
                class="w-full bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-sm focus:border-gold outline-none" />
            </div>
            <div>
              <label class="block text-xs text-muted mb-1">Schwelle kritisch</label>
              <input type="number" bind:value={dim.threshold_high} placeholder="z.B. 80"
                class="w-full bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-sm focus:border-gold outline-none" />
            </div>
            <div>
              <label class="block text-xs text-muted mb-1">Multiplikator</label>
              <input type="number" bind:value={dim.score_multiplier} min="1"
                class="w-full bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-sm focus:border-gold outline-none" />
            </div>
          </div>
          <button onclick={() => removeDimension(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
        </div>
      {/each}
    </div>

    <!-- Questions -->
    <div class="mb-6 p-4 bg-dark rounded-xl border border-dark-lighter">
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-xs text-muted uppercase tracking-wide">Fragen ({editing.questions.length})</h3>
        <button onclick={addQuestion} class="text-xs text-gold hover:text-gold/80">+ Frage</button>
      </div>
      {#each editing.questions as q, i}
        <div class="mb-3 p-3 bg-dark-light rounded-lg border border-dark-lighter">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-muted">Frage {q.position}</span>
            <button onclick={() => removeQuestion(i)} class="text-xs text-red-400 hover:text-red-300">✕</button>
          </div>
          <textarea bind:value={q.question_text} placeholder="Fragetext…" rows="2"
            class="w-full bg-dark border border-dark-lighter rounded px-2 py-1.5 text-light text-sm focus:border-gold outline-none resize-y mb-2"></textarea>
          <select
            value={q.question_type}
            onchange={(e) => changeQuestionType(i, (e.target as HTMLSelectElement).value as Question['question_type'])}
            class="bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-sm focus:border-gold outline-none mb-2"
          >
            <option value="ab_choice">A/B-Wahl</option>
            <option value="ja_nein">Ja/Nein</option>
            <option value="likert_5">Likert 1–5</option>
            <option value="test_step">Test-Schritt</option>
          </select>
          <!-- Answer option → dimension mapping -->
          {#if q.question_type === 'test_step'}
            <div class="flex flex-col gap-2 mt-2">
              <div>
                <label class="block text-xs text-muted mb-1">Erwartetes Ergebnis *</label>
                <textarea bind:value={q.test_expected_result} rows="2" placeholder="Was soll nach dem Test zu sehen sein?"
                  class="w-full bg-dark border border-dark-lighter rounded px-2 py-1.5 text-light text-sm focus:border-gold outline-none resize-y"></textarea>
              </div>
              <div>
                <label class="block text-xs text-muted mb-1">Funktions-URL</label>
                <input bind:value={q.test_function_url} placeholder="z. B. /admin/monitoring"
                  class="w-full bg-dark border border-dark-lighter rounded px-2 py-1.5 text-light text-sm focus:border-gold outline-none" />
              </div>
              <div>
                <label class="block text-xs text-muted mb-1">Rolle</label>
                <select bind:value={q.test_role}
                  class="w-full bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-sm focus:border-gold outline-none">
                  <option value={null}>— keine —</option>
                  <option value="admin">Admin</option>
                  <option value="user">Nutzer</option>
                </select>
              </div>
            </div>
          {:else}
            <div class="flex flex-col gap-1">
              {#each q.answer_options as opt}
                <div class="flex items-center gap-2">
                  <span class="text-xs text-muted w-8">{opt.option_key}</span>
                  <select bind:value={opt.dimension_id}
                    class="flex-1 bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-xs focus:border-gold outline-none">
                    <option value={null}>— keine Dimension —</option>
                    {#each editing.dimensions as dim}
                      <option value={dim.id ?? ''}>{dim.name}</option>
                    {/each}
                  </select>
                  <input type="number" bind:value={opt.weight} min="1" class="w-12 bg-dark border border-dark-lighter rounded px-1 py-1 text-light text-xs focus:border-gold outline-none" title="Gewichtung" />
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if saveMsg}
    <p class={`text-sm mb-3 ${saveMsg.includes('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{saveMsg}</p>
  {/if}
  <div class="flex gap-3">
    <button onclick={save} disabled={saving} class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
    {#if editing.id && editing.status === 'draft'}
      <button onclick={publish} disabled={saving} class="px-4 py-2 border border-green-500/40 text-green-400 rounded-lg text-sm hover:bg-green-500/10 disabled:opacity-50">
        Veröffentlichen
      </button>
    {/if}
  </div>
{/if}
