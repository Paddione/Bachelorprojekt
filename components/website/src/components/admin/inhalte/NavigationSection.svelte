<script lang="ts">
  import type { NavItem } from '../../../content-schema';

  let { initialData }: { initialData: NavItem[] } = $props();
  let links = $state<NavItem[]>(JSON.parse(JSON.stringify(initialData)));
  let saving = $state(false); let msg = $state(''); let msgOk = $state(true);
  let prUrl = $state('');

  // T001490 Task 7: localStorage draft for publish-latency safety.
  const DRAFT_KEY = 'admin.draft.navigation';
  if (typeof window !== 'undefined') {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as NavItem[];
        if (Array.isArray(parsed)) links = parsed;
      } catch { /* ignore corrupt drafts */ }
    }
  }
  $effect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(links)); } catch { /* quota */ }
  });

  function addLink() {
    links = [...links, { label: 'Neuer Link', href: '/', order: links.length + 1 }];
  }
  function removeLink(idx: number) {
    links = links.filter((_, i) => i !== idx);
    // reindex order
    links = links.map((l, i) => ({ ...l, order: i + 1 }));
  }
  function moveLink(idx: number, delta: number) {
    const next = idx + delta;
    if (next < 0 || next >= links.length) return;
    const arr = [...links];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    links = arr.map((l, i) => ({ ...l, order: i + 1 }));
  }

  async function save() {
    saving = true; msg = ''; prUrl = '';
    try {
      const res = await fetch('/api/admin/navigation/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(links),
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
  const moveBtnCls = 'px-2 py-1 rounded-md border border-dark-lighter text-muted hover:text-light hover:border-gold/50 disabled:opacity-30 disabled:cursor-not-allowed text-sm';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div><h2 class="text-2xl font-bold text-light font-serif">Navigation</h2><p class="text-muted mt-1 text-sm">Haupt-Navigationslinks (Reihenfolge = Anzeigereihenfolge)</p></div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">{saving?'Speichere…':'Speichern'}</button>
  </div>

  {#if msg}<div class={`p-4 rounded-xl text-sm ${msgOk?'bg-green-500/10 border border-green-500/30 text-green-400':'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
    {msg}{#if prUrl}<a href={prUrl} target="_blank" rel="noopener" class="ml-2 underline">PR ansehen</a>{/if}
  </div>{/if}

  <div class={sectionCls}>
    <div class="flex items-center justify-between">
      <h3 class="text-xl font-bold text-light font-serif">Links</h3>
      <button type="button" onclick={addLink} class="px-3 py-1.5 text-sm rounded-md border border-gold/40 text-gold hover:bg-gold/10">+ Link</button>
    </div>
    {#each links as link, idx (idx)}
      <div class="p-3 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div class="flex items-center gap-2">
          <button type="button" onclick={() => moveLink(idx, -1)} disabled={idx === 0} class={moveBtnCls} aria-label="Nach oben">↑</button>
          <button type="button" onclick={() => moveLink(idx, 1)} disabled={idx === links.length - 1} class={moveBtnCls} aria-label="Nach unten">↓</button>
          <span class="text-xs text-muted">#{idx + 1}</span>
          <button type="button" onclick={() => removeLink(idx)} class="ml-auto px-2 py-1 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10">Entfernen</button>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class={labelCls}>Label</label><input type="text" bind:value={link.label} class={inputCls} /></div>
          <div><label class={labelCls}>URL / Pfad</label><input type="text" bind:value={link.href} class={inputCls} placeholder="/leistungen" /></div>
        </div>
      </div>
    {/each}
  </div>
</div>
