<script lang="ts">
  import type { TicketPlan } from '../../lib/tickets/container-detail';

  let {
    plan,
    renderedHtml,
    planContent = '',
  }: {
    plan: TicketPlan;
    renderedHtml: string;
    planContent?: string;
  } = $props();

  function downloadPlan() {
    const blob = new Blob([planContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-${plan.slug}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
  <div class="flex items-center justify-between mb-2">
    <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide">Plan</h2>
    {#if planContent}
      <button
        type="button"
        onclick={downloadPlan}
        class="text-xs text-gold/80 hover:text-gold border border-gold/30 rounded px-2 py-1"
        title="Plan als Markdown herunterladen"
      >
        plan-{plan.slug}.md ↓
      </button>
    {/if}
  </div>
  <dl class="flex flex-wrap gap-x-6 gap-y-2 text-xs mb-3">
    <div><dt class="text-muted uppercase">Slug</dt><dd class="text-light font-mono">{plan.slug}</dd></div>
    {#if plan.branch}<div><dt class="text-muted uppercase">Branch</dt><dd class="text-light font-mono">{plan.branch}</dd></div>{/if}
    {#if plan.prNumber}
      <div><dt class="text-muted uppercase">PR</dt>
        <dd><a href={`https://github.com/Paddione/Bachelorprojekt/pull/${plan.prNumber}`}
               target="_blank" rel="noopener" class="text-gold hover:underline font-mono">#{plan.prNumber}</a></dd></div>
    {/if}
  </dl>
  <details>
    <summary class="cursor-pointer text-sm text-gold hover:underline">Plan-Inhalt anzeigen</summary>
    <div class="md-body text-light/90 mt-3">{@html renderedHtml}</div>
  </details>
</div>
