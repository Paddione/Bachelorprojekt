<script lang="ts">
  type Assignment = {
    id: string;
    template_title: string;
    status: 'pending' | 'in_progress' | 'submitted' | 'reviewed';
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

  let open = $state(false);
  let visible = $state(false);
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
  let pendingCount = $derived(assignments.filter(a => a.status !== 'submitted' && a.status !== 'reviewed').length);
  let current = $derived(questions[currentIndex] ?? null);
  let total = $derived(questions.length);
  let answered = $derived(Object.keys(answers).length);
  let allAnswered = $derived(total > 0 && answered >= total);

  $effect(() => {
    initWidget();
  });

  $effect(() => {
    const qId = current?.id;
    pendingTestOption = qId ? (answers[qId] ?? '') : '';
  });

  async function initWidget() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json() as { authenticated: boolean; user?: { isAdmin: boolean } };
      if (!data.authenticated || data.user?.isAdmin) return;
      visible = true;
      await loadAssignments();
    } finally {
      loading = false;
    }
  }

  async function loadAssignments() {
    const res = await fetch('/api/portal/questionnaires');
    if (res.ok) {
      const data = await res.json() as Assignment[];
      assignments = Array.isArray(data) ? data : [];
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

{#if visible}
  <div class="qw">
    {#if open}
      <div class="panel">
        <div class="hdr">
          {#if activeId}
            <button class="back-btn" onclick={goBack}>← Liste</button>
            <span class="hdr-title">{activeAssignment?.template_title ?? 'Fragebogen'}</span>
          {:else}
            <span class="hdr-title">📋 Meine Fragebögen</span>
            <button class="refresh-btn" onclick={loadAssignments} title="Aktualisieren">↻</button>
          {/if}
          <button class="x" onclick={() => open = false}>✕</button>
        </div>

        <div class="body">
          {#if !activeId}
            {#if loading}
              <p class="hint">Lade…</p>
            {:else if assignments.length === 0}
              <p class="hint">Keine Fragebögen zugewiesen.</p>
            {:else}
              {#each assignments as a (a.id)}
                <button class="acard" onclick={() => selectAssignment(a.id)}>
                  <span class="acard-title">{a.template_title}</span>
                  <span class="status-badge {statusCls(a.status)}">{statusLabel(a.status)}</span>
                </button>
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
    {/if}

    <button class="fab" onclick={() => open = !open} aria-label="Fragebögen">
      {#if pendingCount > 0 && !open}
        <span class="dot">{pendingCount > 9 ? '9+' : pendingCount}</span>
      {/if}
      {open ? '✕' : '📋'}
    </button>
  </div>
{/if}

<style>
  .qw { position: fixed; bottom: 24px; right: 24px; z-index: 9000; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .panel { width: min(420px, calc(100vw - 32px)); max-height: 580px; background: #1a2235; border: 1px solid #243049; border-radius: 12px; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,.5); overflow: hidden; }

  .hdr { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #243049; font-size: 14px; font-weight: 600; color: #e8e8f0; flex-shrink: 0; }
  .hdr-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .x { background: transparent; border: none; color: #aabbcc; cursor: pointer; font-size: 14px; padding: 0; line-height: 1; flex-shrink: 0; }
  .back-btn { background: transparent; border: none; color: #e8c870; cursor: pointer; font-size: 12px; padding: 0; white-space: nowrap; flex-shrink: 0; }
  .refresh-btn { background: transparent; border: none; color: #aabbcc; cursor: pointer; font-size: 16px; padding: 0; line-height: 1; flex-shrink: 0; }

  .body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .hint { font-size: 12px; color: #8899aa; text-align: center; margin: auto; }

  .acard { width: 100%; background: #0f1623; border: 1px solid #243049; border-radius: 8px; padding: 12px; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between; gap: 8px; transition: border-color .15s, background .15s; }
  .acard:hover { border-color: #e8c870; background: #1e2a3a; }
  .acard-title { font-size: 13px; color: #e8e8f0; font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status-badge { flex-shrink: 0; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
  .status-badge.pending { background: #1e3a5a; color: #60a5fa; }
  .status-badge.progress { background: #3d2c0a; color: #fbbf24; }
  .status-badge.done { background: #0d2e1a; color: #4ade80; }

  .done-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; flex: 1; padding: 24px; }
  .done-icon { font-size: 36px; color: #4ade80; }
  .done-state p { color: #aabbcc; font-size: 13px; }
  .btn-link { background: transparent; border: none; color: #e8c870; cursor: pointer; font-size: 12px; text-decoration: underline; padding: 0; }

  .progress-wrap { height: 3px; background: #243049; border-radius: 99px; overflow: hidden; flex-shrink: 0; }
  .progress-bar { height: 100%; background: #e8c870; border-radius: 99px; transition: width .3s; }
  .progress-label { font-size: 10px; color: #5566aa; flex-shrink: 0; }

  .instr { font-size: 11px; color: #8899aa; background: #0f1623; border: 1px solid #243049; border-radius: 6px; padding: 8px 10px; line-height: 1.5; flex-shrink: 0; }

  .qcard { background: #0f1623; border: 1px solid #243049; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
  .role-badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
  .role-badge.admin { background: rgba(59,130,246,.15); color: #60a5fa; border: 1px solid rgba(59,130,246,.25); }
  .role-badge.user { background: rgba(52,211,153,.15); color: #34d399; border: 1px solid rgba(52,211,153,.25); }
  .qlabel { font-size: 10px; color: #5566aa; text-transform: uppercase; letter-spacing: .05em; margin: 0; }
  .qlabel.mt { margin-top: 2px; }
  .qtext { font-size: 13px; color: #e8e8f0; font-weight: 500; margin: 0; line-height: 1.5; }
  .qmuted { font-size: 12px; color: #8899aa; margin: 0; line-height: 1.4; }
  .expected { background: #1a2235; border: 1px solid #243049; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
  .fn-link { display: inline-flex; align-items: center; gap: 4px; color: #e8c870; font-size: 12px; text-decoration: none; font-weight: 500; }
  .fn-link:hover { text-decoration: underline; }

  .result-opts { display: flex; flex-direction: column; gap: 4px; }
  .res-btn { background: #1a2235; border: 1px solid #243049; border-radius: 6px; padding: 6px 10px; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; transition: all .15s; }
  .res-btn:disabled { opacity: .5; cursor: not-allowed; }
  .res-ok { color: #4ade80; }
  .res-ok.chosen { background: rgba(74,222,128,.1); border-color: #4ade80; }
  .res-partial { color: #fbbf24; }
  .res-partial.chosen { background: rgba(251,191,36,.1); border-color: #fbbf24; }
  .res-fail { color: #f87171; }
  .res-fail.chosen { background: rgba(248,113,113,.1); border-color: #f87171; }
  .res-btn:not(.chosen):hover { border-color: #5566aa; }

  .details-ta { background: #1a2235; color: #e8e8f0; border: 1px solid #374151; border-radius: 6px; padding: 6px 8px; font-size: 12px; resize: none; font-family: inherit; line-height: 1.4; width: 100%; box-sizing: border-box; }
  .details-ta:focus { outline: none; border-color: #e8c870; }

  .ab-opts { display: flex; flex-direction: column; gap: 4px; }
  .ab-btn { background: #1a2235; border: 1px solid #243049; border-radius: 6px; padding: 8px 10px; font-size: 12px; color: #aabbcc; cursor: pointer; text-align: left; transition: all .15s; line-height: 1.4; }
  .ab-btn:hover { border-color: #e8c870; color: #e8e8f0; }
  .ab-btn:disabled { opacity: .5; cursor: not-allowed; }
  .ab-btn.ab-chosen { border-color: #e8c870; background: rgba(232,200,112,.15); color: #e8c870; }

  .yn-opts { display: flex; gap: 8px; }
  .yn-btn { flex: 1; padding: 10px; border: 1px solid #243049; border-radius: 6px; background: #1a2235; color: #aabbcc; cursor: pointer; font-size: 13px; font-weight: 600; transition: all .15s; }
  .yn-btn:hover { border-color: #e8c870; color: #e8e8f0; }
  .yn-btn:disabled { opacity: .5; cursor: not-allowed; }
  .yn-btn.yn-chosen { border-color: #e8c870; background: #e8c870; color: #0f1623; }

  .lk-opts { display: flex; gap: 4px; }
  .lk-btn { flex: 1; padding: 8px 4px; border: 1px solid #243049; border-radius: 6px; background: #1a2235; color: #aabbcc; cursor: pointer; font-size: 13px; font-weight: 700; transition: all .15s; }
  .lk-btn:hover { border-color: #e8c870; color: #e8e8f0; }
  .lk-btn:disabled { opacity: .5; cursor: not-allowed; }
  .lk-btn.lk-chosen { border-color: #e8c870; background: #e8c870; color: #0f1623; }
  .lk-labels { display: flex; justify-content: space-between; font-size: 10px; color: #5566aa; }

  .nav { display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
  .btn-prev { background: transparent; border: 1px solid #243049; border-radius: 6px; padding: 6px 12px; font-size: 12px; color: #aabbcc; cursor: pointer; transition: all .15s; }
  .btn-prev:hover:not(:disabled) { border-color: #5566aa; color: #e8e8f0; }
  .btn-prev:disabled { opacity: .4; cursor: not-allowed; }
  .btn-next { background: #e8c870; border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 700; color: #0f1623; cursor: pointer; transition: opacity .15s; }
  .btn-next:disabled { opacity: .4; cursor: not-allowed; }
  .btn-submit { width: 100%; background: #4ade80; border: none; border-radius: 8px; padding: 10px; font-size: 13px; font-weight: 700; color: #0f1623; cursor: pointer; transition: opacity .15s; flex-shrink: 0; }
  .btn-submit:disabled { opacity: .5; cursor: not-allowed; }

  .err { font-size: 11px; color: #f87171; margin: 0; flex-shrink: 0; }

  .fab { position: relative; width: 52px; height: 52px; border-radius: 50%; background: #e8c870; color: #0f1623; border: none; font-size: 22px; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; transition: transform .15s, box-shadow .15s; }
  .fab:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,0,0,.5); }
  .dot { position: absolute; top: -4px; right: -4px; background: #ef4444; color: #fff; border-radius: 999px; font-size: 10px; font-weight: 700; padding: 2px 5px; font-family: monospace; min-width: 18px; text-align: center; line-height: 1.4; pointer-events: none; }

  @media (max-width: 767px) {
    .qw { right: 8px; bottom: 16px; }
    .panel { width: calc(100vw - 16px); max-height: 70vh; }
  }
</style>
