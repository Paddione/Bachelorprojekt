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

<!--
  Styles for .ag-* live in src/styles/sidekick-panels.css (scoped under .drawer),
  NOT in a scoped <style> block here. Svelte 5 + Vite drop the scoped CSS of
  drawer sub-views that only mount after navigation (this view is one of them),
  so the production bundle shipped this component completely unstyled. The global
  sheet is loaded by every layout that mounts PortalSidekick. See the file header
  in sidekick-panels.css for the full rationale.
-->
