<script lang="ts">
  import { goals, tools, taxonomy, tierColor, tierEmoji, tierLabel } from '../../lib/agentGuide';

  let copiedId = $state<string | null>(null);

  async function copyPrompt(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      setTimeout(() => { if (copiedId === id) copiedId = null; }, 1600);
    } catch { /* clipboard unavailable — no-op */ }
  }

  function scrollToTool(id: string) {
    const el = document.getElementById(`ag-tool-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

<div class="ag-body">
  <div class="ag-intro">
    <span class="ag-eyebrow">
      <span class="ag-eyebrow-bar" aria-hidden="true"></span>
      Agent-Anleitung
    </span>
    <h3 class="ag-title">Ich will … — welches Werkzeug nehme ich?</h3>
    <p class="ag-desc">Wähle ein Ziel oder ein Werkzeug. Die Farbe zeigt, wie vorsichtig Du sein musst.</p>
  </div>

  <!-- Tier legend -->
  <ul class="ag-legend" aria-label="Gefahrenstufen">
    {#each taxonomy as tier (tier.id)}
      <li class="ag-legend-item" style="--tier: {tier.color}">
        <span class="ag-legend-badge">{tier.emoji} {tier.label_de}</span>
        <span class="ag-legend-text">{tier.meaning_de}</span>
      </li>
    {/each}
  </ul>

  <!-- A. Ziele -->
  <p class="ag-section-label">Ich will …</p>
  <div class="ag-cards">
    {#each goals as goal (goal.id)}
      <article class="ag-card">
        <header class="ag-card-head">
          <span class="ag-name">{goal.title_de}</span>
          <span class="ag-tier" style="--tier: {tierColor(goal.danger)}">
            {tierEmoji(goal.danger)} {tierLabel(goal.danger)}
          </span>
        </header>
        <p class="ag-when">{goal.when_de}</p>

        <ol class="ag-flow">
          {#each goal.flow as step, i (i)}
            <li><strong>{step.tool_name_de}</strong> — {step.note_de}</li>
          {/each}
        </ol>

        <div class="ag-prompt">
          <code class="ag-prompt-text">{goal.example_prompt_de}</code>
          <button class="ag-copy" onclick={() => copyPrompt(goal.id, goal.example_prompt_de)}>
            {copiedId === goal.id ? 'Kopiert ✓' : 'Diesen Prompt kopieren'}
          </button>
        </div>

        {#if goal.guardrails.length > 0}
          <div class="ag-chips">
            {#each goal.guardrails as g (g.id)}
              <details class="ag-chip">
                <summary>{g.name_de}</summary>
                <p class="ag-chip-rule">{g.rule_de}</p>
                <p class="ag-chip-why">{g.why_de}</p>
              </details>
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </div>

  <!-- B. Werkzeuge & Agenten -->
  <p class="ag-section-label">Werkzeuge &amp; Agenten</p>
  <div class="ag-cards">
    {#each tools as tool (tool.id)}
      <article class="ag-card" id={`ag-tool-${tool.id}`}>
        <header class="ag-card-head">
          <span class="ag-name">{tool.name_de}</span>
          <span class="ag-kind">{tool.kind_de}</span>
          <span class="ag-tier" style="--tier: {tierColor(tool.danger)}">
            {tierEmoji(tool.danger)} {tierLabel(tool.danger)}
          </span>
        </header>
        <p class="ag-summary">{tool.summary_de}</p>

        <details class="ag-detail">
          <summary>Wofür ist das?</summary>
          <p>{tool.what_for_de}</p>
          <p class="ag-label">So startest Du</p><p>{tool.how_to_start_de}</p>
          <p class="ag-label">Was kann schiefgehen</p><p>{tool.what_could_go_wrong_de}</p>
        </details>

        {#if tool.guardrails.length > 0}
          <div class="ag-chips">
            {#each tool.guardrails as g (g.id)}
              <details class="ag-chip">
                <summary>{g.name_de}</summary>
                <p class="ag-chip-rule">{g.rule_de}</p>
                <p class="ag-chip-why">{g.why_de}</p>
              </details>
            {/each}
          </div>
        {/if}

        {#if tool.related.length > 0}
          <div class="ag-related">
            {#each tool.related as relId (relId)}
              <button class="ag-related-chip" onclick={() => scrollToTool(relId)}>↳ {relId}</button>
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </div>
</div>

<style>
  .ag-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding-bottom: 28px;
  }

  /* Intro (mirrors HelpView eyebrow/title/desc tokens) */
  .ag-intro {
    padding: 24px 22px 18px;
    border-bottom: 1px solid var(--line, #243042);
  }
  .ag-eyebrow {
    font-family: var(--mono, 'Geist Mono', monospace);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--brass, #e8c870);
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .ag-eyebrow-bar { width: 22px; height: 1px; background: currentColor; opacity: 0.8; }
  .ag-title {
    font-family: var(--serif, Georgia, serif);
    font-size: 22px;
    font-weight: 400;
    color: var(--fg, #e9eef5);
    margin: 18px 0 6px;
  }
  .ag-desc { font-size: 14px; color: var(--fg-soft, #aeb9c7); margin: 0; line-height: 1.55; max-width: 46ch; }

  .ag-section-label {
    font-family: var(--mono, 'Geist Mono', monospace);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--mute, #8a97a6);
    margin: 22px 22px 12px;
  }

  /* Legend */
  .ag-legend { list-style: none; margin: 16px 22px 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .ag-legend-item { display: flex; align-items: baseline; gap: 10px; font-size: 13px; color: var(--fg-soft, #aeb9c7); }
  .ag-legend-badge {
    font-family: var(--mono, 'Geist Mono', monospace);
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--tier);
    color: var(--tier);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Cards */
  .ag-cards { display: flex; flex-direction: column; gap: 10px; margin: 0 22px 18px; }
  .ag-card {
    border: 1px solid var(--line, #243042);
    border-radius: var(--radius-md, 12px);
    background: var(--ink-800, #16202e);
    padding: 14px 16px;
  }
  .ag-card-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .ag-name { font-family: var(--serif, Georgia, serif); font-size: 16px; color: var(--fg, #e9eef5); flex: 1 1 auto; }
  .ag-kind {
    font-family: var(--mono, 'Geist Mono', monospace);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--mute, #8a97a6);
    border: 1px solid var(--line-2, #2a3543);
    border-radius: 999px;
    padding: 2px 7px;
  }
  .ag-tier {
    font-family: var(--mono, 'Geist Mono', monospace);
    font-size: 11px;
    border-radius: 999px;
    border: 1px solid var(--tier);
    color: var(--tier);
    padding: 2px 8px;
    white-space: nowrap;
  }
  .ag-when, .ag-summary { font-size: 13px; color: var(--fg-soft, #aeb9c7); margin: 8px 0 0; line-height: 1.5; }

  .ag-flow { margin: 10px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
  .ag-flow li { font-size: 13px; color: var(--fg-soft, #aeb9c7); line-height: 1.5; }
  .ag-flow li::marker { color: var(--brass, #e8c870); font-family: var(--mono, 'Geist Mono', monospace); font-size: 11px; }

  /* Copy-to-clipboard prompt */
  .ag-prompt {
    margin-top: 10px;
    background: var(--ink-850, #121b27);
    border: 1px solid var(--line, #243042);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ag-prompt-text { font-family: var(--mono, 'Geist Mono', monospace); font-size: 12px; color: var(--fg, #e9eef5); white-space: pre-wrap; }
  .ag-copy {
    align-self: flex-start;
    font-family: var(--mono, 'Geist Mono', monospace);
    font-size: 11px;
    color: var(--brass, #e8c870);
    background: transparent;
    border: 1px solid var(--brass-d, var(--line, #243042));
    border-radius: 999px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .ag-copy:hover { background: oklch(0.80 0.09 75 / 0.08); }

  /* Guardrail chips (tap to expand rule/why) */
  .ag-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .ag-chip {
    border: 1px solid var(--line-2, #2a3543);
    border-radius: 999px;
    padding: 0;
    max-width: 100%;
  }
  .ag-chip summary {
    font-family: var(--mono, 'Geist Mono', monospace);
    font-size: 11px;
    color: var(--fg-soft, #aeb9c7);
    padding: 3px 10px;
    cursor: pointer;
    list-style: none;
  }
  .ag-chip summary::-webkit-details-marker { display: none; }
  .ag-chip[open] { border-radius: 10px; padding: 0 10px 8px; border-color: var(--brass-d, var(--line, #243042)); }
  .ag-chip-rule { font-size: 12px; color: var(--fg, #e9eef5); margin: 6px 0 2px; }
  .ag-chip-why { font-size: 12px; color: var(--mute, #8a97a6); margin: 0; font-style: italic; }

  /* Tool detail accordion (mirrors HelpView guide-item) */
  .ag-detail { margin-top: 10px; }
  .ag-detail summary {
    font-family: var(--serif, Georgia, serif);
    font-size: 14px;
    color: var(--fg, #e9eef5);
    cursor: pointer;
    list-style: none;
    padding: 6px 0;
  }
  .ag-detail summary::-webkit-details-marker { display: none; }
  .ag-detail p { font-size: 13px; color: var(--fg-soft, #aeb9c7); margin: 4px 0; line-height: 1.5; }
  .ag-label {
    font-family: var(--mono, 'Geist Mono', monospace);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--brass, #e8c870);
    margin-top: 10px;
  }

  /* Cross-links */
  .ag-related { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .ag-related-chip {
    font-family: var(--mono, 'Geist Mono', monospace);
    font-size: 11px;
    color: var(--brass, #e8c870);
    background: transparent;
    border: 1px solid var(--line-2, #2a3543);
    border-radius: 999px;
    padding: 3px 9px;
    cursor: pointer;
  }
  .ag-related-chip:hover { border-color: var(--brass, #e8c870); }

  @media (max-width: 480px) {
    .ag-intro { padding-inline: 18px; }
    .ag-cards, .ag-legend, .ag-section-label { margin-inline: 18px; }
  }
</style>
