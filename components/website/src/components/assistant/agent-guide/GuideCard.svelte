<script lang="ts">
  import { tierColor, tierEmoji, tierLabel, tierFor, glossary } from '../../../lib/agentGuide';
  import { highlight, splitGlossaryTerms, type GuideEntry } from '../../../lib/agentGuideSearch';
  import GlossaryTerm from './GlossaryTerm.svelte';
  import LearningAsset from '../../learning/LearningAsset.svelte';

  let {
    entry,
    open = false,
    query = '',
    copiedId = null,
    status = 'todo',
    note = '',
    onToggle,
    onJump,
    onCopy,
  }: {
    entry: GuideEntry;
    open?: boolean;
    query?: string;
    copiedId?: string | null;
    status?: 'todo' | 'in_progress' | 'done';
    note?: string;
    onToggle: (id: string) => void;
    onJump: (id: string) => void;
    onCopy: (id: string, text: string) => void;
  } = $props();

  const statusLabels: Record<string, string> = {
    todo: '○ zu tun',
    in_progress: '◐ läuft',
    done: '● erledigt',
  };

  let localStatus = $state(status);
  let localNote = $state(note);
  let noteExpanded = $state(false);
  let saving = $state(false);

  async function setStatus(newStatus: 'todo' | 'in_progress' | 'done') {
    if (saving) return;
    saving = true;
    try {
      await fetch('/api/portal/learning/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: entry.kind,
          item_id: entry.id,
          status: newStatus,
        }),
      });
      localStatus = newStatus;
      window.dispatchEvent(new CustomEvent('learning:updated'));
    } catch { /* ignore network errors silently */ }
    saving = false;
  }

  async function saveNote() {
    if (saving) return;
    saving = true;
    try {
      await fetch('/api/portal/learning/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: entry.kind,
          item_id: entry.id,
          note: localNote,
        }),
      });
      window.dispatchEvent(new CustomEvent('learning:updated'));
    } catch { /* ignore */ }
    saving = false;
  }

  const isForbidden = $derived(entry.danger === 'forbidden');
  const goal = $derived(entry.goal);
  const tool = $derived(entry.tool);
  const rightMeta = $derived(
    entry.kind === 'goal'
      ? `${goal!.flow.length} Schritt${goal!.flow.length === 1 ? '' : 'e'}`
      : entry.artLabel,
  );
  const glossTerms = glossary.map(g => g.term);
  const glossDef = (t: string) => glossary.find(g => g.term === t)?.def_de ?? '';
  const conceptSegs = $derived(
    entry.kind === 'goal' && goal?.concept_de
      ? splitGlossaryTerms(goal.concept_de, glossTerms)
      : [],
  );

  function initPromptLabel(harness: string | undefined): string {
    if (harness === 'claude') return 'In Claude Code einfügen';
    if (harness === 'opencode') return 'In opencode einfügen';
    return 'Prompt einfügen';
  }
</script>

<article
  id={entry.domId}
  class="ag-card"
  class:ag-card-open={open}
  class:ag-card-forbidden={isForbidden}
  style="--tier: {tierColor(entry.danger)}"
>
  <button
    type="button"
    class="ag-card-head"
    aria-expanded={open}
    aria-controls={`${entry.domId}-body`}
    onclick={() => onToggle(entry.id)}
  >
    <span class="ag-dot" aria-hidden="true">{tierEmoji(entry.danger)}</span>
    <LearningAsset
      concept={entry.kind === 'goal' ? 'goal' : 'tool'}
      register="technical"
      tone="active"
      class="ag-card-art"
    />
    <span class="ag-name">
      {#each highlight(entry.title_de, query) as seg}{#if seg.mark}<mark class="ag-hl">{seg.text}</mark>{:else}{seg.text}{/if}{/each}
    </span>
    <span class="ag-meta">{rightMeta}</span>
    {#if tool && (tool.harness === 'claude' || tool.harness === 'opencode')}
      <span class="ag-harness-badge">{tool.harness === 'claude' ? 'Claude Code' : 'opencode'}</span>
    {/if}
    <span class="ag-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
    <span class="ag-sr">Gefahrenstufe: {tierLabel(entry.danger)} – {tierFor(entry.danger)?.meaning}</span>
  </button>

  <div class="ag-card-body" id={`${entry.domId}-body`} data-open={open}>
    <div class="ag-card-body-inner">
      <!-- Status toggle -->
      <div class="ag-status-row" data-testid="status-toggle">
        {#each (['todo', 'in_progress', 'done'] as const) as s (s)}
          <button
            type="button"
            class="ag-status-btn"
            class:ag-status-btn--active={localStatus === s}
            data-status={s}
            disabled={saving}
            onclick={() => setStatus(s)}
          >
            {statusLabels[s]}
          </button>
        {/each}
      </div>

      <!-- Note field -->
      <div class="ag-note-row">
        <button
          type="button"
          class="ag-note-toggle"
          onclick={() => (noteExpanded = !noteExpanded)}
        >
          {noteExpanded ? '▾' : '▸'} Das habe ich gelernt
        </button>
        {#if noteExpanded}
          <textarea
            class="ag-card-note-textarea"
            rows="3"
            placeholder="Notiz…"
            bind:value={localNote}
            onblur={saveNote}
          ></textarea>
        {/if}
      </div>

      {#if isForbidden}
        <!-- Rote Stopp-Karte -->
        <div class="ag-redstop" role="note">
          <p class="ag-redstop-stop">🔴 Nicht allein ausführen.</p>
          <p class="ag-redstop-why">
            {entry.kind === 'goal' ? goal!.when_de : tool!.what_could_go_wrong_de}
          </p>
          <p class="ag-redstop-who">Zuerst fragen: <strong>{(goal?.escalate_to_de ?? tool?.escalate_to_de) ?? 'Patrick'}</strong></p>
        </div>
      {/if}

      {#if entry.kind === 'goal'}
        {#if !isForbidden}<p class="ag-when">{goal!.when_de}</p>{/if}
        {#if conceptSegs.length}
          <p class="ag-concept">
            {#each conceptSegs as seg}{#if seg.term}<GlossaryTerm term={seg.term} def={glossDef(seg.term)} />{:else}{seg.text}{/if}{/each}
          </p>
        {/if}
        {#if goal!.flow.length}
          <ol class="ag-flow">
            {#each goal!.flow as step, i (i)}
              <li>
                <button
                  type="button"
                  class="ag-flow-jump"
                  aria-label={`Zum Werkzeug springen: ${step.tool_name_de}`}
                  onclick={() => onJump(`ag-tool-${step.tool}`)}
                >
                  {step.tool_name_de}
                </button> — {step.note_de}
              </li>
            {/each}
          </ol>
        {/if}
        <div class="ag-prompt">
          <code class="ag-prompt-text">{goal!.example_prompt_de}</code>
          <button class="ag-copy" onclick={() => onCopy(entry.id, goal!.example_prompt_de)}>
            {copiedId === entry.id ? 'Kopiert ✓' : (isForbidden ? 'Prompt nur nach Rücksprache kopieren' : 'Diesen Prompt kopieren')}
          </button>
        </div>
        {#if goal!.guardrails.length}
          <div class="ag-chips">
            {#each goal!.guardrails as g (g.id)}
              <details class="ag-chip"><summary>{g.name_de}</summary><p class="ag-chip-rule">{g.rule_de}</p><p class="ag-chip-why">{g.why_de}</p></details>
            {/each}
          </div>
        {/if}
        {#if goal!.related.length}
          <div class="ag-related">
            {#each goal!.related as relId (relId)}
              {@const rel = entry.related?.[relId]}
              <button
                class="ag-related-chip"
                aria-label={`Zu verwandtem Eintrag springen: ${rel?.label ?? relId}`}
                onclick={() => onJump(rel?.domId ?? `ag-goal-${relId}`)}
              >
                ↳ {#if rel}{tierEmoji(rel.danger)} {rel.label}{:else}{relId}{/if}
              </button>
            {/each}
          </div>
        {/if}
      {:else}
        {#if !isForbidden}<p class="ag-summary">{tool!.what_for_de}</p>{/if}
        <p class="ag-label">So startest Du</p><p class="ag-bodytext">{tool!.how_to_start_de}</p>
        <p class="ag-label">Was kann schiefgehen</p><p class="ag-bodytext">{tool!.what_could_go_wrong_de}</p>
        {#if tool!.init_prompt_de}
          <p class="ag-label">{initPromptLabel(tool!.harness)}</p>
          <div class="ag-prompt ag-prompt-init">
            <code class="ag-prompt-text">{tool!.init_prompt_de}</code>
            <button class="ag-copy" onclick={() => onCopy(`${entry.id}::init`, tool!.init_prompt_de!)}>
              {copiedId === `${entry.id}::init` ? 'Kopiert ✓' : initPromptLabel(tool!.harness)}
            </button>
          </div>
        {/if}
        {#if tool!.guardrails.length}
          <div class="ag-chips">
            {#each tool!.guardrails as g (g.id)}
              <details class="ag-chip"><summary>{g.name_de}</summary><p class="ag-chip-rule">{g.rule_de}</p><p class="ag-chip-why">{g.why_de}</p></details>
            {/each}
          </div>
        {/if}
        {#if tool!.related.length}
          <div class="ag-related">
            {#each tool!.related as relId (relId)}
              {@const rel = entry.related?.[relId]}
              <button
                class="ag-related-chip"
                aria-label={`Zu verwandtem Eintrag springen: ${rel?.label ?? relId}`}
                onclick={() => onJump(rel?.domId ?? `ag-tool-${relId}`)}
              >
                ↳ {#if rel}{tierEmoji(rel.danger)} {rel.label}{:else}{relId}{/if}
              </button>
            {/each}
          </div>
        {/if}
      {/if}

      {#if (goal?.links ?? tool?.links ?? []).length}
        <div class="ag-morelinks">
          <span class="ag-label">Mehr dazu</span>
          {#each (goal?.links ?? tool?.links ?? []) as l (l.url)}
            <a class="ag-morelink" href={l.url} target="_blank" rel="noopener noreferrer">{l.label_de} ↗</a>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</article>

<style>
  .ag-status-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .ag-status-btn {
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--line, #e2e8f0);
    background: transparent;
    color: var(--fg-soft, #64748b);
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
  }

  .ag-status-btn:hover:not(:disabled) {
    border-color: var(--brass, #b8860b);
    color: var(--brass, #b8860b);
  }

  .ag-status-btn--active {
    background: var(--brass, #b8860b);
    border-color: var(--brass, #b8860b);
    color: var(--ink-900, #1a1a1a);
  }

  .ag-status-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .ag-note-row {
    margin-bottom: 10px;
  }

  .ag-note-toggle {
    font-size: 12px;
    background: none;
    border: none;
    color: var(--fg-soft, #64748b);
    cursor: pointer;
    padding: 0;
    text-align: left;
  }

  .ag-note-toggle:hover {
    color: var(--fg, #1a1a1a);
  }

  .ag-card-note-textarea {
    margin-top: 6px;
    width: 100%;
    box-sizing: border-box;
    padding: 8px;
    border: 1px solid var(--line, #e2e8f0);
    border-radius: 4px;
    font-size: 13px;
    font-family: inherit;
    color: var(--fg, #1a1a1a);
    background: var(--surface, #fff);
    resize: vertical;
    line-height: 1.5;
  }

  .ag-card-note-textarea:focus {
    outline: 2px solid var(--brass, #b8860b);
    outline-offset: -1px;
  }

  .ag-card-art { width: 1.5rem; flex: 0 0 auto; }

  .ag-harness-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--line, #e2e8f0);
    background: var(--surface-raised, #f8fafc);
    color: var(--fg-soft, #64748b);
    margin-left: 8px;
    white-space: nowrap;
  }
</style>
