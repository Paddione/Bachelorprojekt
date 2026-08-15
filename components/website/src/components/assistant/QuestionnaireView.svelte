<script lang="ts">
  type Assignment = {
    id: string;
    template_title: string;
    status: 'pending' | 'in_progress' | 'submitted' | 'reviewed' | 'dismissed' | 'archived';
    assigned_at: string;
    submitted_at: string | null;
  };

  type Question = {
    id: string;
    position: number;
    question_text: string;
    question_type: 'test_step' | 'ab_choice' | 'ja_nein' | 'likert_5';
    test_expected_result: string | null;
    test_function_url: string | null;
    test_role: 'admin' | 'user' | null;
  };

  type AnswerRecord = { question_id: string; option_key: string; details_text?: string | null };

  let { onCloseView: _onCloseView }: { onCloseView?: () => void } = $props();

  let loading = $state(true);
  let assignments = $state<Assignment[]>([]);
  let instructions = $state('');
  let questions = $state<Question[]>([]);
  let activeId = $state<string | null>(null);
  let detailLoading = $state(false);
  let currentIndex = $state(0);
  let answers = $state<Record<string, string>>({});
  let testDetails = $state<Record<string, string>>({});
  let pendingTestOption = $state('');
  let saving = $state(false);
  let submitting = $state(false);
  let error = $state('');
  let submitted = $state(false);

  let activeAssignment = $derived(assignments.find(a => a.id === activeId) ?? null);
  let current = $derived(questions[currentIndex] ?? null);
  let total = $derived(questions.length);
  let answered = $derived(Object.keys(answers).length);
  let allAnswered = $derived(total > 0 && answered >= total);

  $effect(() => {
    loadAssignments();
  });

  $effect(() => {
    const qId = current?.id;
    pendingTestOption = qId ? (answers[qId] ?? '') : '';
  });

  async function loadAssignments() {
    loading = true;
    try {
      const res = await fetch('/api/portal/questionnaires');
      if (res.ok) {
        const data = await res.json() as Assignment[];
        assignments = Array.isArray(data)
          ? data.filter(a => a.status !== 'dismissed' && a.status !== 'archived')
          : [];
      }
    } finally {
      loading = false;
    }
  }

  async function selectAssignment(id: string) {
    detailLoading = true; error = '';
    try {
      const res = await fetch(`/api/portal/questionnaires/${id}`);
      if (!res.ok) return;
      const data = await res.json() as {
        assignment: Assignment;
        instructions: string;
        questions: Question[];
        answers: AnswerRecord[];
      };
      activeId = id;
      instructions = data.instructions ?? '';
      questions = data.questions ?? [];
      answers = Object.fromEntries(data.answers.map(a => [a.question_id, a.option_key]));
      testDetails = Object.fromEntries(
        data.answers.filter(a => a.details_text).map(a => [a.question_id, a.details_text!])
      );
      submitted = data.assignment.status === 'submitted' || data.assignment.status === 'reviewed';
      const firstUnanswered = questions.findIndex(q => !(q.id in answers));
      currentIndex = firstUnanswered >= 0 ? firstUnanswered : Math.max(0, questions.length - 1);
      pendingTestOption = '';
    } finally {
      detailLoading = false;
    }
  }

  async function saveAnswer(optionKey: string) {
    if (!activeId || !current || saving) return;
    saving = true; error = '';
    try {
      const res = await fetch(`/api/portal/questionnaires/${activeId}/answer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: current.id, option_key: optionKey }),
      });
      if (res.ok) {
        answers[current.id] = optionKey;
        if (currentIndex < total - 1) {
          await new Promise(r => setTimeout(r, 150));
          currentIndex++;
        }
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        error = d.error ?? 'Fehler beim Speichern.';
      }
    } catch { error = 'Netzwerkfehler.'; }
    finally { saving = false; }
  }

  async function saveTestStep() {
    const optKey = pendingTestOption || (current ? answers[current.id] : '');
    if (!activeId || !current || !optKey || saving) return;
    saving = true; error = '';
    try {
      const res = await fetch(`/api/portal/questionnaires/${activeId}/answer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: current.id,
          option_key: optKey,
          details_text: testDetails[current.id] ?? null,
        }),
      });
      if (res.ok) {
        answers[current.id] = optKey;
        pendingTestOption = '';
        if (currentIndex < total - 1) currentIndex++;
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        error = d.error ?? 'Fehler beim Speichern.';
      }
    } catch { error = 'Netzwerkfehler.'; }
    finally { saving = false; }
  }

  async function submitQuestionnaire() {
    if (!activeId || submitting) return;
    submitting = true; error = '';
    try {
      const res = await fetch(`/api/portal/questionnaires/${activeId}/submit`, { method: 'POST' });
      if (res.ok) {
        submitted = true;
        await loadAssignments();
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        error = d.error ?? 'Fehler beim Absenden.';
      }
    } catch { error = 'Netzwerkfehler.'; }
    finally { submitting = false; }
  }

  function goBack() {
    activeId = null; questions = []; answers = {}; testDetails = {};
    submitted = false; error = '';
  }

  async function dismissAssignment(id: string) {
    const reason = window.prompt('Grund (optional):') ?? null;
    if (reason === null) return;
    const r = await fetch(`/api/portal/questionnaires/${id}/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (r.ok) {
      assignments = assignments.filter(a => a.id !== id);
      if (activeId === id) { activeId = null; submitted = false; }
    }
  }

  function abOptions(text: string) {
    return text.split(/\n/).filter(Boolean).map(p => ({ key: p.charAt(0), label: p }));
  }

  function statusLabel(s: string) {
    if (s === 'submitted' || s === 'reviewed') return 'Abgegeben';
    if (s === 'in_progress') return 'In Bearbeitung';
    return 'Ausstehend';
  }

  function statusCls(s: string) {
    if (s === 'submitted' || s === 'reviewed') return 'done';
    if (s === 'in_progress') return 'progress';
    return 'pending';
  }
</script>

<div class="qv-outer">
<!-- Inner header nav (list ↔ detail), shown when in detail mode -->
{#if activeId}
  <div class="inner-hdr">
    <button class="back-btn" onclick={goBack} aria-label="Zurück zur Liste">
      <span aria-hidden="true">←</span> Liste
    </button>
    <span class="hdr-title">{activeAssignment?.template_title ?? 'Fragebogen'}</span>
    <button class="refresh-btn" onclick={loadAssignments} title="Aktualisieren" aria-label="Aktualisieren">↻</button>
  </div>
{:else}
  <div class="qv-intro">
    <span class="qv-eyebrow">
      <span class="qv-eyebrow-bar" aria-hidden="true"></span>
      Fragebögen
    </span>
    <div class="qv-intro-row">
      <p class="qv-desc">Meine offenen <em>Aufgaben</em> — beantworten in eigenem Tempo.</p>
      <button class="refresh-btn-intro" onclick={loadAssignments} title="Aktualisieren" aria-label="Aktualisieren">↻</button>
    </div>
  </div>
{/if}

<div class="body">
  {#if !activeId}
    {#if loading}
      <p class="hint">Lade…</p>
    {:else if assignments.length === 0}
      <p class="hint">Keine Fragebögen zugewiesen.</p>
    {:else}
      {#each assignments as a (a.id)}
        <div class="acard-row">
          <button class="acard" onclick={() => selectAssignment(a.id)}>
            <span class="acard-title">{a.template_title}</span>
            <span class="status-badge {statusCls(a.status)}">{statusLabel(a.status)}</span>
          </button>
          <button
            class="dismiss-x"
            onclick={() => dismissAssignment(a.id)}
            title="Ausblenden"
            aria-label="Fragebogen ausblenden"
          >✕</button>
        </div>
      {/each}
    {/if}

  {:else if detailLoading}
    <p class="hint">Lade…</p>

  {:else if submitted}
    <div class="done-state">
      <div class="done-icon">✓</div>
      <p>Fragebogen abgegeben.</p>
      <button class="btn-link" onclick={goBack}>← Zurück zur Liste</button>
    </div>

  {:else if current}
    <div class="progress-wrap">
      <div class="progress-bar" style={`width: ${Math.round((answered / total) * 100)}%`}></div>
    </div>
    <p class="progress-label">Schritt {currentIndex + 1} / {total} · {answered} beantwortet</p>

    {#if instructions && currentIndex === 0}
      <div class="instr">{instructions}</div>
    {/if}

    <div class="qcard">
      {#if current.question_type === 'test_step'}
        {#if current.test_role}
          <span class="role-badge {current.test_role}">
            {current.test_role === 'admin' ? '🔧 Admin-Schritt' : '👤 Nutzer-Schritt'}
          </span>
        {/if}
        <p class="qlabel">Was zu testen:</p>
        <p class="qtext">{current.question_text}</p>
        {#if current.test_expected_result}
          <div class="expected">
            <p class="qlabel">Erwartetes Ergebnis:</p>
            <p class="qmuted">{current.test_expected_result}</p>
          </div>
        {/if}
        {#if current.test_function_url}
          <a href={current.test_function_url} target="_blank" rel="noopener noreferrer" class="fn-link">
            ↗ Seite in neuem Tab öffnen
          </a>
        {/if}
        <p class="qlabel mt">Testergebnis:</p>
        <div class="result-opts">
          {#each [
            { key: 'erfüllt', label: '✓ Erfüllt', cls: 'res-ok' },
            { key: 'teilweise', label: '~ Teilweise erfüllt', cls: 'res-partial' },
            { key: 'nicht_erfüllt', label: '✗ Nicht erfüllt', cls: 'res-fail' },
          ] as opt}
            {@const chosen = (pendingTestOption || answers[current.id]) === opt.key}
            <button
              class="res-btn {opt.cls} {chosen ? 'chosen' : ''}"
              onclick={() => pendingTestOption = opt.key}
              disabled={saving}
            >{opt.label}</button>
          {/each}
        </div>
        <textarea
          class="details-ta"
          placeholder="Beobachtungen (optional)"
          value={testDetails[current.id] ?? ''}
          oninput={(e) => { testDetails[current.id] = (e.target as HTMLTextAreaElement).value; }}
          rows="2"
        ></textarea>
      {:else if current.question_type === 'ab_choice'}
        <p class="qmuted">Wählen Sie die passendere Aussage:</p>
        <div class="ab-opts">
          {#each abOptions(current.question_text) as opt}
            {@const chosen = answers[current.id] === opt.key}
            <button
              class="ab-btn {chosen ? 'ab-chosen' : ''}"
              onclick={() => saveAnswer(opt.key)}
              disabled={saving}
            >{opt.label}</button>
          {/each}
        </div>
      {:else if current.question_type === 'ja_nein'}
        <p class="qtext">{current.question_text}</p>
        <div class="yn-opts">
          {#each ['Ja', 'Nein'] as opt}
            {@const chosen = answers[current.id] === opt}
            <button
              class="yn-btn {chosen ? 'yn-chosen' : ''}"
              onclick={() => saveAnswer(opt)}
              disabled={saving}
            >{opt}</button>
          {/each}
        </div>
      {:else}
        <p class="qtext">{current.question_text}</p>
        <p class="qmuted">Die Aussage trifft auf mich zu:</p>
        <div class="lk-opts">
          {#each ['1','2','3','4','5'] as opt}
            {@const chosen = answers[current.id] === opt}
            <button
              class="lk-btn {chosen ? 'lk-chosen' : ''}"
              onclick={() => saveAnswer(opt)}
              disabled={saving}
            >{opt}</button>
          {/each}
        </div>
        <div class="lk-labels"><span>Gar nicht</span><span>Voll und ganz</span></div>
      {/if}
    </div>

    {#if error}<p class="err">{error}</p>{/if}

    <div class="nav">
      <button
        class="btn-prev"
        onclick={() => currentIndex = Math.max(0, currentIndex - 1)}
        disabled={currentIndex === 0}
      >← Zurück</button>

      {#if current.question_type === 'test_step'}
        <button
          class="btn-next"
          onclick={saveTestStep}
          disabled={saving || (!pendingTestOption && !(current.id in answers))}
        >
          {saving ? '…' : currentIndex < total - 1 ? 'Speichern & Weiter →' : 'Speichern ✓'}
        </button>
      {:else if currentIndex < total - 1}
        <button
          class="btn-next"
          onclick={() => currentIndex++}
          disabled={!(current.id in answers)}
        >Weiter →</button>
      {/if}
    </div>

    {#if allAnswered}
      <button
        class="btn-submit"
        onclick={submitQuestionnaire}
        disabled={submitting}
      >
        {submitting ? 'Wird abgesendet…' : 'Fragebogen absenden ✓'}
      </button>
    {/if}
  {/if}
</div>
</div>

<style>
  /* ── Detail-mode inner header ─────────────────────────── */
  .inner-hdr {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 18px 22px;
    min-height: 56px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }
  .hdr-title {
    flex: 1;
    font-family: var(--serif);
    font-size: 16px;
    line-height: 1.2;
    letter-spacing: -0.01em;
    color: var(--fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .back-btn {
    background: transparent;
    border: none;
    color: var(--brass);
    cursor: pointer;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 8px 0;
    min-height: 36px;
    white-space: nowrap;
    flex-shrink: 0;
    transition: color 180ms ease;
  }
  .back-btn:hover { color: var(--brass-2); }
  .refresh-btn {
    background: transparent;
    border: none;
    color: var(--mute);
    cursor: pointer;
    font-size: 16px;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill, 999px);
    line-height: 1;
    flex-shrink: 0;
    transition: color 180ms ease, background 180ms ease;
  }
  .refresh-btn:hover {
    color: var(--brass);
    background: var(--brass-d);
  }

  /* ── List-mode intro ──────────────────────────────────── */
  .qv-intro {
    padding: 24px 22px 18px;
    border-bottom: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex-shrink: 0;
  }
  .qv-eyebrow {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--brass);
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .qv-eyebrow-bar {
    width: 22px;
    height: 1px;
    background: currentColor;
    opacity: 0.8;
    flex-shrink: 0;
  }
  .qv-intro-row {
    display: flex;
    align-items: flex-end;
    gap: 12px;
  }
  .qv-desc {
    flex: 1;
    margin: 0;
    font-family: var(--serif);
    font-size: 22px;
    line-height: 1.15;
    letter-spacing: -0.015em;
    color: var(--fg);
    font-weight: 400;
  }
  .qv-desc em {
    font-style: italic;
    color: var(--brass-2);
  }
  .refresh-btn-intro {
    background: transparent;
    border: 1px solid var(--line-2);
    color: var(--mute);
    cursor: pointer;
    font-size: 16px;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill, 999px);
    line-height: 1;
    flex-shrink: 0;
    transition: color 180ms ease, background 180ms ease, border-color 180ms ease;
  }
  .refresh-btn-intro:hover {
    color: var(--brass);
    border-color: var(--brass);
    background: var(--brass-d);
  }

  /* ── Body ─────────────────────────────────────────────── */
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }
  .hint {
    font-size: 14px;
    color: var(--mute);
    text-align: center;
    margin: auto;
    font-style: italic;
  }

  /* ── Assignment cards ─────────────────────────────────── */
  .acard-row {
    display: flex;
    align-items: stretch;
    gap: 8px;
  }
  .acard {
    flex: 1;
    min-width: 0;
    min-height: 56px;
    background: var(--ink-800);
    border: 1px solid var(--line);
    border-radius: var(--radius-md, 12px);
    padding: 14px 16px;
    cursor: pointer;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    transition: border-color 180ms ease, background 180ms ease;
  }
  .acard:hover {
    border-color: var(--brass);
    background: var(--ink-750);
  }
  .acard:focus-visible {
    outline: 2px solid var(--brass);
    outline-offset: 2px;
  }
  .dismiss-x {
    flex-shrink: 0;
    background: transparent;
    border: 1px solid var(--line-2);
    color: var(--mute);
    cursor: pointer;
    font-size: 14px;
    width: 44px;
    border-radius: var(--radius-md, 12px);
    line-height: 1;
    transition: color 180ms ease, background 180ms ease, border-color 180ms ease;
  }
  .dismiss-x:hover {
    color: oklch(0.78 0.14 22);
    background: oklch(0.62 0.18 22 / 0.12);
    border-color: oklch(0.62 0.18 22 / 0.4);
  }
  .acard-title {
    font-family: var(--serif);
    font-size: 16px;
    color: var(--fg);
    font-weight: 400;
    letter-spacing: -0.01em;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status-badge {
    flex-shrink: 0;
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: var(--radius-pill, 999px);
    border: 1px solid;
  }
  .status-badge.pending {
    background: rgba(255,255,255,0.04);
    color: var(--mute);
    border-color: var(--line-2);
  }
  .status-badge.progress {
    background: var(--brass-d);
    color: var(--brass);
    border-color: oklch(0.80 0.09 75 / 0.35);
  }
  .status-badge.done {
    background: oklch(0.80 0.06 160 / 0.12);
    color: var(--sage);
    border-color: oklch(0.80 0.06 160 / 0.4);
  }

  /* ── Done state ────────────────────────────────────────── */
  .done-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    flex: 1;
    padding: 32px 24px;
    text-align: center;
  }
  .done-icon {
    font-size: 44px;
    color: var(--sage);
    line-height: 1;
  }
  .done-state p {
    font-family: var(--serif);
    color: var(--fg);
    font-size: 18px;
    font-weight: 400;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .btn-link {
    background: transparent;
    border: none;
    color: var(--brass);
    cursor: pointer;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 8px;
    min-height: 36px;
    transition: color 180ms ease;
  }
  .btn-link:hover { color: var(--brass-2); }

  /* ── Progress ─────────────────────────────────────────── */
  .progress-wrap {
    height: 2px;
    background: var(--line-2);
    border-radius: 99px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .progress-bar {
    height: 100%;
    background: var(--brass);
    border-radius: 99px;
    transition: width 320ms var(--ease-out, ease);
  }
  .progress-label {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--mute);
    flex-shrink: 0;
  }

  /* ── Instruction box ──────────────────────────────────── */
  .instr {
    font-size: 13px;
    color: var(--fg-soft);
    background: var(--ink-800);
    border: 1px solid var(--line);
    border-left: 3px solid var(--brass);
    border-radius: var(--radius-md, 12px);
    padding: 12px 14px;
    line-height: 1.55;
    flex-shrink: 0;
  }

  /* ── Question card ────────────────────────────────────── */
  .qcard {
    background: var(--ink-800);
    border: 1px solid var(--line);
    border-radius: var(--radius-md, 12px);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex-shrink: 0;
  }
  .role-badge {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: var(--radius-pill, 999px);
    border: 1px solid;
  }
  .role-badge.admin {
    background: var(--brass-d);
    color: var(--brass);
    border-color: oklch(0.80 0.09 75 / 0.4);
  }
  .role-badge.user {
    background: oklch(0.80 0.06 160 / 0.12);
    color: var(--sage);
    border-color: oklch(0.80 0.06 160 / 0.4);
  }
  .qlabel {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin: 0;
  }
  .qlabel.mt { margin-top: 4px; }
  .qtext {
    font-family: var(--serif);
    font-size: 18px;
    font-weight: 400;
    line-height: 1.35;
    letter-spacing: -0.01em;
    color: var(--fg);
    margin: 0;
  }
  .qmuted {
    font-size: 13px;
    color: var(--fg-soft);
    margin: 0;
    line-height: 1.5;
  }
  .expected {
    background: var(--ink-850);
    border: 1px solid var(--line);
    border-radius: var(--radius-md, 12px);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .fn-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--brass);
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-decoration: none;
    font-weight: 500;
    padding: 6px 0;
    transition: color 180ms ease;
  }
  .fn-link:hover { color: var(--brass-2); text-decoration: underline; }

  /* ── Answer options (shared) ──────────────────────────── */
  .result-opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .res-btn {
    background: var(--ink-850);
    border: 1px solid var(--line-2);
    border-radius: var(--radius-md, 12px);
    padding: 12px 14px;
    min-height: 44px;
    font-family: var(--sans);
    font-size: 14px;
    font-weight: 500;
    color: var(--fg-soft);
    cursor: pointer;
    text-align: left;
    transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
  }
  .res-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .res-btn:not(.chosen):hover {
    border-color: var(--brass-d);
    color: var(--fg);
  }
  .res-ok { color: var(--sage); }
  .res-ok.chosen {
    background: oklch(0.80 0.06 160 / 0.12);
    border-color: var(--sage);
    color: var(--sage);
  }
  .res-partial { color: var(--brass); }
  .res-partial.chosen {
    background: var(--brass-d);
    border-color: var(--brass);
    color: var(--brass);
  }
  .res-fail { color: oklch(0.78 0.14 22); }
  .res-fail.chosen {
    background: oklch(0.62 0.18 22 / 0.12);
    border-color: oklch(0.62 0.18 22);
    color: oklch(0.78 0.14 22);
  }

  .details-ta {
    background: var(--ink-850);
    color: var(--fg);
    border: 1px solid var(--line-2);
    border-radius: var(--radius-md, 12px);
    padding: 10px 12px;
    font-family: var(--sans);
    font-size: 13px;
    resize: vertical;
    min-height: 56px;
    line-height: 1.5;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 180ms ease;
  }
  .details-ta::placeholder { color: var(--mute-2); font-style: italic; }
  .details-ta:focus { outline: none; border-color: var(--brass); }

  /* A/B choice */
  .ab-opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ab-btn {
    background: var(--ink-850);
    border: 1px solid var(--line-2);
    border-radius: var(--radius-md, 12px);
    padding: 14px 16px;
    min-height: 52px;
    font-family: var(--serif);
    font-size: 15px;
    line-height: 1.4;
    letter-spacing: -0.005em;
    color: var(--fg-soft);
    cursor: pointer;
    text-align: left;
    transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
  }
  .ab-btn:hover { border-color: var(--brass); color: var(--fg); }
  .ab-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .ab-btn.ab-chosen {
    border-color: var(--brass);
    background: var(--brass-d);
    color: var(--fg);
  }

  /* Ja / Nein */
  .yn-opts {
    display: flex;
    gap: 10px;
  }
  .yn-btn {
    flex: 1;
    padding: 14px;
    min-height: 52px;
    border: 1px solid var(--line-2);
    border-radius: var(--radius-md, 12px);
    background: var(--ink-850);
    color: var(--fg-soft);
    cursor: pointer;
    font-family: var(--serif);
    font-size: 18px;
    font-weight: 400;
    transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
  }
  .yn-btn:hover { border-color: var(--brass); color: var(--fg); }
  .yn-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .yn-btn.yn-chosen {
    border-color: var(--brass);
    background: var(--brass);
    color: var(--ink-900);
    font-weight: 500;
  }

  /* Likert 1-5 */
  .lk-opts {
    display: flex;
    gap: 6px;
  }
  .lk-btn {
    flex: 1;
    padding: 12px 4px;
    min-height: 48px;
    border: 1px solid var(--line-2);
    border-radius: var(--radius-md, 12px);
    background: var(--ink-850);
    color: var(--fg-soft);
    cursor: pointer;
    font-family: var(--serif);
    font-size: 18px;
    font-weight: 400;
    transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
  }
  .lk-btn:hover { border-color: var(--brass); color: var(--fg); }
  .lk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .lk-btn.lk-chosen {
    border-color: var(--brass);
    background: var(--brass);
    color: var(--ink-900);
    font-weight: 500;
  }
  .lk-labels {
    display: flex;
    justify-content: space-between;
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--mute);
    padding-top: 4px;
  }

  /* ── Nav buttons ──────────────────────────────────────── */
  .nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    padding-top: 4px;
  }
  .btn-prev {
    background: transparent;
    border: 1px solid var(--line-2);
    border-radius: var(--radius-pill, 999px);
    padding: 10px 18px;
    min-height: 44px;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--fg-soft);
    cursor: pointer;
    transition: border-color 180ms ease, color 180ms ease;
  }
  .btn-prev:hover:not(:disabled) { border-color: var(--brass); color: var(--fg); }
  .btn-prev:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-next {
    background: var(--brass);
    border: none;
    border-radius: var(--radius-pill, 999px);
    padding: 10px 18px;
    min-height: 44px;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--ink-900);
    cursor: pointer;
    transition: background 180ms ease, transform 120ms ease;
  }
  .btn-next:not(:disabled):hover {
    background: var(--brass-2);
    transform: translateY(-1px);
  }
  .btn-next:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-submit {
    width: 100%;
    background: var(--sage);
    border: none;
    border-radius: var(--radius-pill, 999px);
    padding: 14px;
    min-height: 48px;
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--ink-900);
    cursor: pointer;
    transition: opacity 180ms ease, transform 120ms ease;
    flex-shrink: 0;
  }
  .btn-submit:not(:disabled):hover { transform: translateY(-1px); }
  .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

  .err {
    font-size: 12px;
    color: oklch(0.78 0.14 22);
    margin: 0;
    flex-shrink: 0;
  }

  @media (max-width: 480px) {
    .inner-hdr,
    .qv-intro,
    .body { padding-inline: 18px; }
    .qv-desc { font-size: 20px; }
  }
</style>
