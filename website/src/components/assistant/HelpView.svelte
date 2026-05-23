<script lang="ts">
  import { helpContent } from '../../lib/helpContent';
  import type { HelpContext } from '../../lib/helpContent';

  let {
    section,
    context,
  }: {
    section: string;
    context: HelpContext;
  } = $props();

  const content = $derived(helpContent[context]?.[section] ?? null);
</script>

<div class="help-body">
  <div class="hv-intro">
    <span class="hv-eyebrow">
      <span class="hv-eyebrow-bar" aria-hidden="true"></span>
      Kontexthilfe
    </span>
  </div>
  {#if content}
    <h3 class="section-title">{content.title}</h3>
    <p class="section-desc">{content.description}</p>

    {#if content.actions.length > 0}
      <p class="section-label">Was kann ich hier tun?</p>
      <ul class="action-list">
        {#each content.actions as action}
          <li>
            <span class="action-dot">✦</span>
            {action}
          </li>
        {/each}
      </ul>
    {/if}

    {#if content.guides.length > 0}
      <p class="section-label">Anleitungen</p>
      <div class="guides">
        {#each content.guides as guide}
          <details class="guide-item">
            <summary class="guide-summary">
              <span class="summary-arrow">▶</span>
              {guide.title}
            </summary>
            <ol class="guide-steps">
              {#each guide.steps as step}
                <li>{step}</li>
              {/each}
            </ol>
          </details>
        {/each}
      </div>
    {/if}

  {:else}
    <p class="empty">Für diesen Bereich ist noch keine Hilfe verfügbar.</p>
  {/if}
</div>

<style>
  .help-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding-bottom: 28px;
  }

  /* ── Intro block ── */
  .hv-intro {
    padding: 24px 22px 18px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }
  .hv-eyebrow {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--brass);
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .hv-eyebrow-bar {
    width: 22px;
    height: 1px;
    background: currentColor;
    opacity: 0.8;
    flex-shrink: 0;
  }

  /* ── Content ── */
  .section-title {
    font-family: var(--serif);
    font-size: 24px;
    font-weight: 400;
    line-height: 1.15;
    letter-spacing: -0.015em;
    color: var(--fg);
    margin: 20px 22px 6px;
  }

  .section-desc {
    font-size: 14px;
    color: var(--fg-soft);
    margin: 0 22px 20px;
    line-height: 1.55;
    max-width: 50ch;
  }

  .section-label {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--mute);
    margin: 0 22px 12px;
  }

  /* ── Action list ───────────────────────────────────────── */
  .action-list {
    margin: 0 22px 22px;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .action-list li {
    font-size: 14px;
    color: var(--fg-soft);
    display: flex;
    align-items: flex-start;
    gap: 10px;
    line-height: 1.55;
    padding: 8px 0;
  }
  .action-dot {
    color: var(--brass);
    flex-shrink: 0;
    font-size: 12px;
    line-height: 1.7;
  }

  /* ── Guides accordion ──────────────────────────────────── */
  .guides {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 22px 22px;
  }

  .guide-item {
    border: 1px solid var(--line);
    border-radius: var(--radius-md, 12px);
    overflow: hidden;
    background: var(--ink-800);
    transition: border-color 180ms ease;
  }
  .guide-item[open] { border-color: var(--brass-d); }

  .guide-summary {
    font-family: var(--serif);
    font-size: 15px;
    font-weight: 400;
    letter-spacing: -0.005em;
    color: var(--fg);
    background: transparent;
    padding: 14px 16px;
    min-height: 48px;
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 12px;
    user-select: none;
    transition: background 180ms ease;
  }
  .guide-summary:hover { background: var(--ink-750); }
  .guide-summary::-webkit-details-marker { display: none; }

  .summary-arrow {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--brass);
    transition: transform 220ms var(--ease-out, ease);
    display: inline-block;
    line-height: 1;
    width: 12px;
    flex-shrink: 0;
  }

  details[open] .summary-arrow { transform: rotate(90deg); }

  .guide-steps {
    margin: 0;
    padding: 12px 18px 16px 44px;
    background: var(--ink-850);
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 8px;
    counter-reset: step-counter;
  }
  .guide-steps li {
    font-size: 13px;
    color: var(--fg-soft);
    line-height: 1.55;
    position: relative;
    counter-increment: step-counter;
  }
  .guide-steps li::marker {
    color: var(--brass);
    font-family: var(--mono);
    font-size: 11px;
  }

  .empty {
    font-family: var(--serif);
    font-size: 15px;
    font-style: italic;
    color: var(--mute);
    padding: 24px 22px;
    line-height: 1.55;
  }

  @media (max-width: 480px) {
    .hv-intro,
    .section-title,
    .section-desc,
    .section-label,
    .action-list,
    .guides,
    .empty { margin-inline: 18px; }
    .hv-intro { padding-inline: 18px; margin: 0; }
    .section-title { font-size: 22px; }
  }
</style>
