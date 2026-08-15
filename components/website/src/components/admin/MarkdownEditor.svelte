<!-- website/src/components/admin/MarkdownEditor.svelte
     Wiederverwendbarer leichtgewichtiger Markdown-Editor: Textarea + Toolbar
     (Bold/Italic/Code/Überschrift/Liste/Nummerierte-Liste/Zitat/Link) + Vorschau.
     Speichert reinen Markdown-Plaintext über `value` ($bindable) — kein WYSIWYG.
     Nutzbar aus Legacy- und Runes-Eltern (Svelte 5 kompiliert beide gemeinsam). -->
<script lang="ts">
  import { tick } from 'svelte';
  import { renderMarkdown } from '../../lib/markdown';
  import '../../styles/markdown.css';

  let {
    value = $bindable(''),
    placeholder = '',
    rows = 4,
    maxlength = undefined,
    id = undefined,
    testid = undefined,
    oninput = undefined,
    onblur = undefined,
  }: {
    value?: string;
    placeholder?: string;
    rows?: number;
    maxlength?: number;
    id?: string;
    testid?: string;
    oninput?: (v: string) => void;
    onblur?: () => void;
  } = $props();

  let ta = $state<HTMLTextAreaElement | undefined>();
  let preview = $state(false);

  async function restore(from: number, to: number) {
    await tick();
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(from, to);
  }

  function emit() { oninput?.(value); }

  function wrap(before: string, after: string = before) {
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = value.slice(s, e);
    value = value.slice(0, s) + before + sel + after + value.slice(e);
    emit();
    restore(s + before.length, s + before.length + sel.length);
  }

  function prefixLines(make: (line: string, i: number) => string) {
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = value.indexOf('\n', e);
    if (lineEnd === -1) lineEnd = value.length;
    const block = value.slice(lineStart, lineEnd) || '';
    const next = block.split('\n').map(make).join('\n');
    value = value.slice(0, lineStart) + next + value.slice(lineEnd);
    emit();
    restore(lineStart, lineStart + next.length);
  }

  const toolbar = [
    { key: 'bold', label: 'B', title: 'Fett', cls: 'b', run: () => wrap('**') },
    { key: 'italic', label: 'I', title: 'Kursiv', cls: 'i', run: () => wrap('*') },
    { key: 'code', label: '</>', title: 'Code', cls: 'c', run: () => wrap('`') },
    { key: 'heading', label: 'H', title: 'Überschrift', cls: '', run: () => prefixLines((l) => (l.startsWith('## ') ? l : `## ${l}`)) },
    { key: 'ul', label: '• Liste', title: 'Aufzählung', cls: '', run: () => prefixLines((l) => `- ${l}`) },
    { key: 'ol', label: '1. Liste', title: 'Nummerierte Liste', cls: '', run: () => prefixLines((l, i) => `${i + 1}. ${l}`) },
    { key: 'quote', label: '❝', title: 'Zitat', cls: '', run: () => prefixLines((l) => `> ${l}`) },
    { key: 'link', label: '🔗', title: 'Link', cls: '', run: () => wrap('[', '](https://)') },
  ];
</script>

<div class="md-editor" data-testid={testid ? `${testid}-editor` : undefined}>
  <div class="md-toolbar" role="toolbar" aria-label="Formatierung">
    {#each toolbar as t (t.key)}
      <button type="button" class="md-tb {t.cls}" title={t.title} aria-label={t.title}
        data-testid={`md-${t.key}`} onclick={t.run} disabled={preview}>{t.label}</button>
    {/each}
    <button type="button" class="md-tb md-preview-toggle" class:on={preview}
      title="Vorschau" aria-pressed={preview} data-testid="md-preview"
      onclick={() => { preview = !preview; }}>{preview ? '✎ Bearbeiten' : '👁 Vorschau'}</button>
  </div>

  {#if preview}
    <div class="md-body md-preview" data-testid="md-preview-body">
      {#if value.trim()}{@html renderMarkdown(value)}{:else}<p class="md-empty">Nichts zum Anzeigen.</p>{/if}
    </div>
  {:else}
    <textarea
      bind:this={ta}
      bind:value
      {id}
      {placeholder}
      {rows}
      maxlength={maxlength}
      data-testid={testid}
      oninput={emit}
      onblur={() => onblur?.()}
    ></textarea>
  {/if}
</div>

<style>
  .md-editor { display: flex; flex-direction: column; gap: 6px; }
  .md-toolbar { display: flex; flex-wrap: wrap; gap: 4px; }
  .md-tb {
    min-width: 30px; height: 30px; padding: 0 8px;
    font-size: 12px; line-height: 1; cursor: pointer;
    background: rgba(127,127,127,0.12);
    border: 1px solid rgba(127,127,127,0.28);
    border-radius: 6px; color: inherit;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .md-tb:hover:not(:disabled) { background: rgba(127,127,127,0.22); }
  .md-tb:disabled { opacity: 0.4; cursor: default; }
  .md-tb.b { font-weight: 800; }
  .md-tb.i { font-style: italic; }
  .md-tb.c { font-family: ui-monospace, monospace; }
  .md-preview-toggle { margin-left: auto; }
  .md-preview-toggle.on { background: var(--brass, #cda260); color: var(--ink-900, #0f1623); border-color: var(--brass, #cda260); }
  textarea {
    width: 100%; resize: vertical; font: inherit;
    background: var(--admin-bg, var(--ink-900, #1c1f26));
    border: 1px solid var(--admin-border, var(--line-2, #2a2e37));
    color: inherit; padding: 0.5rem; border-radius: 6px;
  }
  .md-preview {
    min-height: 64px; padding: 0.5rem 0.7rem;
    border: 1px dashed rgba(127,127,127,0.35); border-radius: 6px;
  }
  .md-empty { opacity: 0.6; font-style: italic; margin: 0; }
</style>
