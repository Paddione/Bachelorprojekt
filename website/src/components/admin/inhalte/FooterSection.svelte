<script lang="ts">
  import type { FooterConfig } from '../../../content-schema';
  import type { FooterColumn } from '../../../content-schema';

  let { initialData }: { initialData: FooterConfig } = $props();
  let footerData = $state<FooterConfig>(JSON.parse(JSON.stringify(initialData)));
  let saving = $state(false); let msg = $state(''); let msgOk = $state(true);
  let prUrl = $state('');

  // T001490 Task 7: localStorage draft for publish-latency safety.
  const DRAFT_KEY = 'admin.draft.footer';
  if (typeof window !== 'undefined') {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as FooterConfig;
        if (parsed && typeof parsed === 'object') footerData = parsed;
      } catch { /* ignore corrupt drafts */ }
    }
  }
  $effect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(footerData)); } catch { /* quota */ }
  });

  function addColumn() {
    footerData.columns = [...footerData.columns, { heading: 'Neue Spalte', links: [] }];
  }
  function removeColumn(cIdx: number) {
    footerData.columns = footerData.columns.filter((_, i) => i !== cIdx);
  }
  function addColumnLink(col: FooterColumn) {
    col.links = [...col.links, { label: 'Neuer Link', href: '/' }];
    footerData = { ...footerData };
  }
  function removeColumnLink(col: FooterColumn, lIdx: number) {
    col.links = col.links.filter((_, i) => i !== lIdx);
    footerData = { ...footerData };
  }

  async function save() {
    saving = true; msg = ''; prUrl = '';
    try {
      const res = await fetch('/api/admin/footer/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(footerData),
      });
      const json = await res.json();
      if (res.ok) {
        msg = json.prUrl ? `PR #${json.prNumber} erstellt — live in ~10 min.` : 'Gespeichert.';
        msgOk = true;
        prUrl = json.prUrl ?? '';
        if (typeof window !== 'undefined') localStorage.removeItem(DRAFT_KEY);
      } else { msg = json.error ?? 'Fehler.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div><h2 class="text-2xl font-bold text-light font-serif">Footer</h2><p class="text-muted mt-1 text-sm">Footer-Spalten und Copyright-Zeile</p></div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">{saving?'Speichere…':'Speichern'}</button>
  </div>

  {#if msg}<div class={`p-4 rounded-xl text-sm ${msgOk?'bg-green-500/10 border border-green-500/30 text-green-400':'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
    {msg}{#if prUrl}<a href={prUrl} target="_blank" rel="noopener" class="ml-2 underline">PR ansehen</a>{/if}
  </div>{/if}

  <div class="p-4 bg-dark-light rounded-xl border border-gold/20">
    <p class="text-xs font-mono uppercase tracking-widest text-gold mb-2">Hinweis</p>
    <p class="text-xs text-muted">Kontaktdaten (E-Mail, Telefon, Stadt) werden aus den <strong class="text-light">Stammdaten</strong> gelesen. Die Angebote-Spalte wird automatisch aus sichtbaren Leistungskarten generiert.</p>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Copyright-Zeile</h3>
    <div><label class={labelCls}>Text</label><input type="text" bind:value={footerData.copyright} class={inputCls} placeholder="© 2026 mentolder — Alle Rechte vorbehalten" /></div>
    <p class="text-xs text-muted">Leer lassen für automatisches Format.</p>
  </div>

  <div class={sectionCls}>
    <div class="flex items-center justify-between">
      <h3 class="text-xl font-bold text-light font-serif">Zusätzliche Spalten</h3>
      <button type="button" onclick={addColumn} class="px-3 py-1.5 text-sm rounded-md border border-gold/40 text-gold hover:bg-gold/10">+ Spalte</button>
    </div>
    {#each footerData.columns as col, cIdx}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-3">
        <div class="flex items-center gap-3">
          <div class="flex-1"><label class={labelCls}>Spaltenüberschrift</label><input type="text" bind:value={col.heading} class={inputCls} /></div>
          <button type="button" onclick={() => removeColumn(cIdx)} class="px-2 py-1 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 mt-4">Entfernen</button>
        </div>
        {#each col.links as link, lIdx}
          <div class="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <div><label class={labelCls}>Label</label><input type="text" bind:value={link.label} class={inputCls} /></div>
            <div><label class={labelCls}>URL / Pfad</label><input type="text" bind:value={link.href} class={inputCls} /></div>
            <button type="button" onclick={() => removeColumnLink(col, lIdx)} class="px-2 py-1 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10">✕</button>
          </div>
        {/each}
        <button type="button" onclick={() => addColumnLink(col)} class="px-2 py-1 text-xs rounded-md border border-gold/40 text-gold hover:bg-gold/10">+ Link</button>
      </div>
    {/each}
  </div>
</div>
