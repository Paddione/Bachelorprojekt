<script lang="ts">
  import type { FaqItem } from '../../../lib/website-db';

  let { initialData }: { initialData: FaqItem[] } = $props();
  let items = $state(JSON.parse(JSON.stringify(initialData)));
  let saving = $state(false); let msg = $state(''); let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/faq/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items.filter((it: FaqItem) => it.question.trim())),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  function addItem() { items = [...items, { question: '', answer: '' }]; }
  function removeItem(i: number) { items = items.filter((_: unknown, idx: number) => idx !== i); }
  function moveUp(i: number) { if (i > 0) { const a = [...items]; [a[i-1], a[i]] = [a[i], a[i-1]]; items = a; } }
  function moveDown(i: number) { if (i < items.length-1) { const a = [...items]; [a[i], a[i+1]] = [a[i+1], a[i]]; items = a; } }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <!-- Einheitlicher Header -->
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">FAQ</h2>
      <p class="text-muted mt-1 text-sm">Häufig gestellte Fragen – erscheinen auf der FAQ-Seite</p>
    </div>
    <button onclick={save} disabled={saving}
      class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <!-- Zentrale Elemente: Hinweis -->
  <div class="p-4 bg-dark-light rounded-xl border border-gold/20 space-y-1">
    <p class="text-xs font-mono uppercase tracking-widest text-gold mb-2">Zentral gepflegte Elemente</p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">SEO (Seitentitel & Meta-Description)</strong> → <a href="/admin/inhalte?tab=website&section=seo" class="text-gold hover:underline">SEO-Tab</a></p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">Footer & Header-Standort</strong> → <a href="/admin/inhalte?tab=website&section=kontakt" class="text-gold hover:underline">Kontakt-Tab</a></p>
  </div>

  <!-- Fragen-Liste -->
  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Fragen &amp; Antworten</h3>
      <!-- Goldener Button wie auf anderen Seiten -->
      <button onclick={addItem}
        class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">
        + Frage
      </button>
    </div>
    <p class="text-xs text-muted">Reihenfolge mit den Pfeilen ändern. Leere Fragen werden beim Speichern ignoriert.</p>

    {#each items as item, i}
      <div class="p-5 bg-dark rounded-xl border border-dark-lighter space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted font-mono">#{i + 1}</span>
          <div class="flex gap-2">
            <button onclick={() => moveUp(i)} disabled={i === 0}
              class="px-2 py-0.5 text-xs text-muted hover:text-light disabled:opacity-30">↑</button>
            <button onclick={() => moveDown(i)} disabled={i === items.length - 1}
              class="px-2 py-0.5 text-xs text-muted hover:text-light disabled:opacity-30">↓</button>
            <button onclick={() => removeItem(i)}
              class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
          </div>
        </div>
        <div>
          <label class={labelCls}>Frage</label>
          <input type="text" bind:value={item.question} class={inputCls} placeholder="z.B. Wie läuft ein Coaching ab?" />
        </div>
        <div>
          <label class={labelCls}>Antwort</label>
          <textarea bind:value={item.answer} rows={3} class="{inputCls} resize-none" placeholder="Ausführliche Antwort..."></textarea>
        </div>
      </div>
    {/each}

    {#if items.length === 0}
      <p class="text-sm text-muted italic">Noch keine Fragen. Klicke auf "+ Frage" um zu beginnen.</p>
    {/if}
  </div>
</div>
