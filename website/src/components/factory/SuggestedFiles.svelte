<script lang="ts">
  let {
    files,
  }: {
    files: { path: string; score: number; snippet: string }[];
  } = $props();

  function scoreColor(score: number): string {
    if (score >= 0.9) return 'var(--factory-success, #4ade80)';
    if (score >= 0.75) return 'var(--factory-accent, #f59e0b)';
    return 'var(--factory-text-muted, #6b7280)';
  }
</script>

<h4 class="detail-panel__section">Semantisch verwandte Dateien</h4>
<ul class="suggested" data-testid="suggested-files">
  {#each files as f}
    <li class="suggested__item" style="border-left: 3px solid {scoreColor(f.score)}">
      <code class="suggested__path">{f.path}</code>
      <span class="suggested__score">{(f.score * 100).toFixed(0)}%</span>
      <pre class="suggested__snippet">{f.snippet}</pre>
    </li>
  {/each}
</ul>

<style>
  .detail-panel__section {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm);
    font-weight: 600;
    color: var(--factory-text-secondary);
    margin: var(--factory-spacing-md) 0 var(--factory-spacing-sm);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .suggested {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--factory-spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--factory-spacing-xs);
  }

  .suggested__item {
    background: var(--factory-surface);
    border: 1px solid var(--factory-border);
    border-radius: var(--factory-radius-sm);
    padding: var(--factory-spacing-xs) var(--factory-spacing-sm);
  }

  .suggested__path {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-xs);
    color: var(--factory-accent);
    word-break: break-all;
  }

  .suggested__score {
    font-family: var(--factory-font-mono);
    font-size: 10px;
    color: var(--factory-text-muted);
    margin-left: var(--factory-spacing-xs);
  }

  .suggested__snippet {
    font-family: var(--factory-font-mono);
    font-size: 11px;
    color: var(--factory-text-muted);
    margin: var(--factory-spacing-xs) 0 0;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 80px;
    overflow: hidden;
  }
</style>
