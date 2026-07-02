<script lang="ts">
  import type { Stammdaten } from '../../../content-schema';

  let { initialData }: { initialData: Stammdaten } = $props();
  let data = $state(JSON.parse(JSON.stringify(initialData)));
  let saving = $state(false); let msg = $state(''); let msgOk = $state(true);
  let prUrl = $state('');

  // T001490 Task 7: localStorage draft for publish-latency safety.
  const DRAFT_KEY = 'admin.draft.stammdaten';
  if (typeof window !== 'undefined') {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as Stammdaten;
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
      const res = await fetch('/api/admin/stammdaten/save', {
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

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div><h2 class="text-2xl font-bold text-light font-serif">Stammdaten</h2><p class="text-muted mt-1 text-sm">Zentrale Personen- und Unternehmensdaten — erscheinen im Impressum, Hero und Footer</p></div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">{saving?'Speichere…':'Speichern'}</button>
  </div>

  {#if msg}<div class={`p-4 rounded-xl text-sm ${msgOk?'bg-green-500/10 border border-green-500/30 text-green-400':'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
    {msg}{#if prUrl}<a href={prUrl} target="_blank" rel="noopener" class="ml-2 underline">PR ansehen</a>{/if}
  </div>{/if}

  <div class="p-4 bg-dark-light rounded-xl border border-gold/20">
    <p class="text-xs font-mono uppercase tracking-widest text-gold mb-2">SSOT — Zentrale Datenquelle</p>
    <p class="text-xs text-muted">Diese Felder sind die einzige Quelle für Name, E-Mail, Telefon und Adresse auf der gesamten Website. Impressum, Hero, Footer und Kontaktseite lesen hier.</p>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Person</h3>
    <div class="grid grid-cols-2 gap-4">
      <div><label class={labelCls}>Vollständiger Name</label><input type="text" bind:value={data.name} class={inputCls} placeholder="Max Mustermann" /></div>
      <div><label class={labelCls}>Berufsbezeichnung / Rolle (Hero + Impressum)</label><input type="text" bind:value={data.role} class={inputCls} placeholder="Coach & Unternehmensberater" /></div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div><label class={labelCls}>E-Mail</label><input type="email" bind:value={data.email} class={inputCls} placeholder="kontakt@beispiel.de" /></div>
      <div><label class={labelCls}>Telefon</label><input type="text" bind:value={data.phone} class={inputCls} placeholder="+49 …" /></div>
    </div>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Adresse</h3>
    <div><label class={labelCls}>Straße + Hausnummer</label><input type="text" bind:value={data.street} class={inputCls} placeholder="Musterstraße 1" /></div>
    <div class="grid grid-cols-2 gap-4">
      <div><label class={labelCls}>PLZ</label><input type="text" bind:value={data.zip} class={inputCls} placeholder="21335" /></div>
      <div><label class={labelCls}>Stadt / Region</label><input type="text" bind:value={data.city} class={inputCls} placeholder="Lüneburg" /></div>
    </div>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Rechtliches (Impressum)</h3>
    <div class="grid grid-cols-2 gap-4">
      <div><label class={labelCls}>Umsatzsteuer-ID</label><input type="text" bind:value={data.ustId} class={inputCls} placeholder="DE123456789" /></div>
      <div><label class={labelCls}>Website (ohne https://)</label><input type="text" bind:value={data.website} class={inputCls} placeholder="mentolder.de" /></div>
    </div>
  </div>
</div>
