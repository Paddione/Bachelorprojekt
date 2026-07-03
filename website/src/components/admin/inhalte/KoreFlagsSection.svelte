<script lang="ts">
  import type { KoreFlags } from '../../../content-schema';

  let { initialData }: { initialData: KoreFlags } = $props();
  let data = $state<KoreFlags>(JSON.parse(JSON.stringify(initialData)));
  let saving = $state(false); let msg = $state(''); let msgOk = $state(true);
  let prUrl = $state('');

  // T001490 Task 7: localStorage draft for publish-latency safety.
  const DRAFT_KEY = 'admin.draft.kore-flags';
  if (typeof window !== 'undefined') {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as KoreFlags;
        if (parsed && typeof parsed === 'object') data = parsed;
      } catch { /* ignore corrupt drafts */ }
    }
  }
  $effect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* quota */ }
  });

  async function save() {
    saving = true; msg = ''; prUrl = '';
    try {
      const res = await fetch('/api/admin/kore-flags/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
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

  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div><h2 class="text-2xl font-bold text-light font-serif">Kore-Flags</h2><p class="text-muted mt-1 text-sm">Feature-Toggles für die Kore (korczewski) Startseite</p></div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">{saving?'Speichere…':'Speichern'}</button>
  </div>

  {#if msg}<div class={`p-4 rounded-xl text-sm ${msgOk?'bg-green-500/10 border border-green-500/30 text-green-400':'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
    {msg}{#if prUrl}<a href={prUrl} target="_blank" rel="noopener" class="ml-2 underline">PR ansehen</a>{/if}
  </div>{/if}

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Homepage-Optionen</h3>
    <label class="flex items-center gap-3 cursor-pointer">
      <input type="checkbox" bind:checked={data.timeline} class="accent-gold w-4 h-4" />
      <div>
        <span class="text-sm text-light font-medium">Timeline anzeigen</span>
        <p class="text-xs text-muted mt-0.5">Schaltet den PR-Live-Feed auf der Kore-Startseite ein/aus. Ohne Tracking-Pipeline zeigt die Timeline nur historische Daten.</p>
      </div>
    </label>
  </div>
</div>
