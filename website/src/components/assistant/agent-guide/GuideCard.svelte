<script lang="ts">
  import { tierColor, tierEmoji, tierLabel, tierFor } from '../../../lib/agentGuide';
  import { highlight, type GuideEntry } from '../../../lib/agentGuideSearch';

  let {
    entry,
    open = false,
    query = '',
    copiedId = null,
    onToggle,
    onJump,
    onCopy,
  }: {
    entry: GuideEntry;
    open?: boolean;
    query?: string;
    copiedId?: string | null;
    onToggle: (id: string) => void;
    onJump: (id: string) => void;
    onCopy: (id: string, text: string) => void;
  } = $props();

  const isForbidden = $derived(entry.danger === 'forbidden');
  const goal = $derived(entry.goal);
  const tool = $derived(entry.tool);
  const rightMeta = $derived(
    entry.kind === 'goal'
      ? `${goal!.flow.length} Schritt${goal!.flow.length === 1 ? '' : 'e'}`
      : entry.artLabel,
  );
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
    <span class="ag-name">
      {#each highlight(entry.title_de, query) as seg}{#if seg.mark}<mark class="ag-hl">{seg.text}</mark>{:else}{seg.text}{/if}{/each}
    </span>
    <span class="ag-meta">{rightMeta}</span>
    <span class="ag-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
    <span class="ag-sr">Gefahrenstufe: {tierLabel(entry.danger)} – {tierFor(entry.danger)?.meaning}</span>
  </button>

  <div class="ag-card-body" id={`${entry.domId}-body`} data-open={open}>
    <div class="ag-card-body-inner">
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
        {#if goal!.flow.length}
          <ol class="ag-flow">
            {#each goal!.flow as step, i (i)}
              <li>
                <button type="button" class="ag-flow-jump" onclick={() => onJump(`ag-tool-${step.tool}`)}>
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
              <button class="ag-related-chip" onclick={() => onJump(rel?.domId ?? `ag-goal-${relId}`)}>
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
          <p class="ag-label">In Claude Code einfügen</p>
          <div class="ag-prompt ag-prompt-init">
            <code class="ag-prompt-text">{tool!.init_prompt_de}</code>
            <button class="ag-copy" onclick={() => onCopy(`${entry.id}::init`, tool!.init_prompt_de!)}>
              {copiedId === `${entry.id}::init` ? 'Kopiert ✓' : 'In Claude Code einfügen'}
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
              <button class="ag-related-chip" onclick={() => onJump(rel?.domId ?? `ag-tool-${relId}`)}>
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
