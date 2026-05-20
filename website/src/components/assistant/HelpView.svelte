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
  .help-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 0; }

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: #818cf8;
    margin: 0 0 6px;
  }

  .section-desc {
    font-size: 12px;
    color: #aabbcc;
    margin: 0 0 16px;
    line-height: 1.55;
  }

  .section-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #5566aa;
    margin: 0 0 8px;
  }

  .action-list {
    margin: 0 0 16px;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .action-list li {
    font-size: 12px;
    color: #aabbcc;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    line-height: 1.5;
  }
  .action-dot { color: #818cf8; flex-shrink: 0; }

  .guides { display: flex; flex-direction: column; gap: 6px; }

  .guide-item { border-radius: 6px; overflow: hidden; }

  .guide-summary {
    font-size: 12px;
    color: #818cf8;
    background: rgba(79,70,229,.12);
    padding: 7px 10px;
    cursor: pointer;
    border-radius: 6px;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
  }
  .guide-summary::-webkit-details-marker { display: none; }

  .summary-arrow {
    font-size: 10px;
    transition: transform 0.15s ease;
    display: inline-block;
  }

  details[open] .summary-arrow {
    transform: rotate(90deg);
  }

  .guide-steps {
    margin: 4px 0 0;
    padding: 8px 10px 8px 28px;
    background: rgba(79,70,229,.06);
    border-radius: 0 0 6px 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .guide-steps li {
    font-size: 12px;
    color: #aabbcc;
    line-height: 1.5;
  }

  .empty { font-size: 12px; color: #5566aa; }
</style>
