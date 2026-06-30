<script lang="ts">
  import { renderMarkdown } from '../../lib/markdown';

  let { slug, proposalContent }: { slug: string | null; proposalContent: string | null } = $props();

  let draft = $state(proposalContent ?? '');
  let saving = $state(false);
  let toast = $state<string | null>(null);

  $effect(() => {
    draft = proposalContent ?? '';
  });

  let rendered = $derived(renderMarkdown(draft));

  async function onSave() {
    if (!slug) return;
    saving = true;
    toast = null;
    try {
      const response = await fetch('/api/admin/openspec/save-proposal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ slug, content: draft }),
      });
      if (response.ok) {
        toast = 'Gespeichert';
        setTimeout(() => {
          if (toast === 'Gespeichert') toast = null;
        }, 3000);
      } else {
        toast = 'Speichern fehlgeschlagen';
      }
    } catch {
      toast = 'Speichern fehlgeschlagen';
    } finally {
      saving = false;
    }
  }
</script>

{#if !slug}
  <div class="warning-banner">
    <div class="banner-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </div>
    <div class="banner-content">
      <h4 class="banner-title">Kein Proposal verknüpft</h4>
      <p class="banner-text">
        Für dieses Ticket ist noch kein Proposal im systemischen OpenSpec-Zweig verknüpft. 
        Du kannst Proposals im <a href="https://github.com/Paddione/Bachelorprojekt/tree/main/openspec/changes" target="_blank" rel="noopener noreferrer" class="banner-link">OpenSpec Repository</a> anlegen.
      </p>
    </div>
  </div>
{:else}
  <div class="dor-panel">
    <div class="dor-header">
      <div class="header-left">
        <h3 class="panel-title">DoR / Lastenheft Editor</h3>
        <span class="slug-badge">Slug: <code>{slug}</code></span>
      </div>
      <div class="header-right">
        {#if toast}
          <div class="toast-popup" class:success={toast === 'Gespeichert'} class:error={toast !== 'Gespeichert'}>
            {toast}
          </div>
        {/if}
        <button onclick={onSave} disabled={saving} class="btn-save">
          {#if saving}
            <span class="loader-spinner"></span> Speichern...
          {:else}
            Speichern
          {/if}
        </button>
      </div>
    </div>

    <div class="editor-grid">
      <div class="editor-column">
        <div class="column-header">Markdown Editor</div>
        <textarea bind:value={draft} placeholder="Verfasse das Lastenheft/Proposal im Markdown-Format..."></textarea>
      </div>
      <div class="preview-column">
        <div class="column-header">Vorschau (Live)</div>
        <div class="preview-content md-body">
          {@html rendered}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .warning-banner {
    display: flex;
    gap: 1rem;
    padding: 1.25rem;
    background-color: var(--color-amber-50, #fef3c7);
    border: 1px solid var(--color-amber-200, #fde68a);
    border-radius: 8px;
    color: var(--color-amber-900, #78350f);
    margin-bottom: 1.5rem;
  }
  .banner-icon {
    flex-shrink: 0;
    color: var(--color-amber-600, #d97706);
  }
  .banner-title {
    margin: 0 0 0.25rem 0;
    font-weight: 600;
    font-size: 1rem;
  }
  .banner-text {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.4;
  }
  .banner-link {
    color: var(--color-amber-800, #92400e);
    text-decoration: underline;
    font-weight: 500;
  }
  .banner-link:hover {
    color: var(--color-amber-950, #451a03);
  }

  .dor-panel {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-panel, #ffffff);
    border: 1px solid var(--color-border-subtle, #e5e7eb);
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    overflow: hidden;
    margin-bottom: 2rem;
  }

  .dor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background: var(--color-bg-header, #f9fafb);
    border-bottom: 1px solid var(--color-border-subtle, #e5e7eb);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .panel-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary, #111827);
  }

  .slug-badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: var(--color-bg-badge, #e5e7eb);
    border-radius: 6px;
    color: var(--color-text-secondary, #4b5563);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .btn-save {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--color-primary, #2563eb);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font-weight: 500;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.2s;
  }
  .btn-save:hover:not(:disabled) {
    background: var(--color-primary-dark, #1d4ed8);
  }
  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .loader-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid white;
    border-bottom-color: transparent;
    border-radius: 50%;
    display: inline-block;
    animation: rotation 1s linear infinite;
  }

  @keyframes rotation {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .toast-popup {
    font-size: 0.875rem;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    animation: fadeIn 0.2s ease-in-out;
  }
  .toast-popup.success {
    background: var(--color-success-bg, #ecfdf5);
    color: var(--color-success-text, #047857);
    border: 1px solid var(--color-success-border, #a7f3d0);
  }
  .toast-popup.error {
    background: var(--color-error-bg, #fef2f2);
    color: var(--color-error-text, #b91c1c);
    border: 1px solid var(--color-error-border, #fecaca);
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .editor-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 400px;
    height: 500px;
  }

  .editor-column, .preview-column {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-column {
    border-right: 1px solid var(--color-border-subtle, #e5e7eb);
  }

  .column-header {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    color: var(--color-text-muted, #6b7280);
    padding: 0.5rem 1.25rem;
    background: var(--color-bg-subtle, #f9fafb);
    border-bottom: 1px solid var(--color-border-subtle, #e5e7eb);
  }

  textarea {
    flex: 1;
    resize: none;
    border: none;
    padding: 1.25rem;
    font-family: var(--font-mono, monospace);
    font-size: 0.875rem;
    line-height: 1.5;
    outline: none;
    background: var(--color-bg-editor, #ffffff);
    color: var(--color-text-primary, #111827);
  }

  .preview-column {
    background: var(--color-bg-preview, #fafafa);
  }

  .preview-content {
    flex: 1;
    padding: 1.25rem;
    overflow-y: auto;
    background: var(--color-bg-preview, #fafafa);
    color: var(--color-text-primary, #111827);
  }

  /* Dark mode integration */
  :global(.dark) .warning-banner {
    background-color: rgba(217, 119, 6, 0.15);
    border-color: rgba(217, 119, 6, 0.3);
    color: #fef3c7;
  }
  :global(.dark) .banner-link {
    color: #fcd34d;
  }
  :global(.dark) .dor-panel {
    background: #1f2937;
    border-color: #374151;
  }
  :global(.dark) .dor-header {
    background: #111827;
    border-color: #374151;
  }
  :global(.dark) .panel-title {
    color: #f3f4f6;
  }
  :global(.dark) .slug-badge {
    background: #374151;
    color: #d1d5db;
  }
  :global(.dark) .column-header {
    background: #111827;
    border-color: #374151;
    color: #9ca3af;
  }
  :global(.dark) textarea {
    background: #1f2937;
    color: #f3f4f6;
  }
  :global(.dark) .editor-column {
    border-right-color: #374151;
  }
  :global(.dark) .preview-column, :global(.dark) .preview-content {
    background: #111827;
    color: #f3f4f6;
  }
</style>
