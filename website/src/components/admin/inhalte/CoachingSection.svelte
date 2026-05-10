<script lang="ts">
  import type { CoachingContent } from '../../../lib/website-db';

  let { initialData }: { initialData: CoachingContent } = $props();

  let data = $state(JSON.parse(JSON.stringify(initialData)));
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/coaching/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler beim Speichern.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  function addProcess() { data.process = [...data.process, { step: '', title: '', text: '' }]; }
  function removeProcess(i: number) { data.process = data.process.filter((_, idx) => idx !== i); }
  function addForWhom() { data.forWhom = [...data.forWhom, '']; }
  function removeForWhom(i: number) { data.forWhom = data.forWhom.filter((_, idx) => idx !== i); }
  function addFaq() { data.faq = [...data.faq, { question: '', answer: '' }]; }
  function removeFaq(i: number) { data.faq = data.faq.filter((_, idx) => idx !== i); }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Coaching</h2>
      <p class="text-muted mt-1 text-sm">Inhalte der Coaching-Seite bearbeiten</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <!-- Header -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Seiten-Header</h3>
    <div>
      <label class={labelCls}>Goldene Zeile (Subheadline)</label>
      <input type="text" bind:value={data.subheadline} class={inputCls} placeholder="z.B. Coaching & Begleitung" />
    </div>
    <div>
      <label class={labelCls}>Hauptüberschrift</label>
      <input type="text" bind:value={data.headline} class={inputCls} placeholder="z.B. Gemeinsam weiter." />
    </div>
    <div>
      <label class={labelCls}>Einleitung</label>
      <textarea bind:value={data.intro} rows={4} class="{inputCls} resize-none"></textarea>
    </div>
  </div>

  <!-- Für wen -->
  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Für wen ist das?</h3>
      <button onclick={addForWhom} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Hinzufügen</button>
    </div>
    {#each data.forWhom as _, i}
      <div class="flex gap-2 items-center">
        <input type="text" bind:value={data.forWhom[i]} class="{inputCls} flex-1" placeholder="z.B. Führungskräfte in Veränderungsprozessen" />
        <button onclick={() => removeForWhom(i)} class="text-xs text-red-400 hover:text-red-300 flex-shrink-0">✕</button>
      </div>
    {/each}
  </div>

  <!-- Ablauf -->
  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Ablauf / Prozess</h3>
      <button onclick={addProcess} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Schritt</button>
    </div>
    {#each data.process as step, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class={labelCls}>Schritt-Label (z.B. "01 — Erstgespräch")</label>
            <input type="text" bind:value={step.step} class={inputCls} />
          </div>
          <div>
            <label class={labelCls}>Titel</label>
            <input type="text" bind:value={step.title} class={inputCls} />
          </div>
        </div>
        <div>
          <label class={labelCls}>Beschreibung</label>
          <textarea bind:value={step.text} rows={2} class="{inputCls} resize-none"></textarea>
        </div>
        <button onclick={() => removeProcess(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
      </div>
    {/each}
  </div>

  <!-- CTA -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Call to Action</h3>
    <div>
      <label class={labelCls}>CTA-Text</label>
      <input type="text" bind:value={data.ctaText} class={inputCls} placeholder="z.B. Jetzt kostenloses Erstgespräch buchen" />
    </div>
    <div>
      <label class={labelCls}>CTA-Link (optional, leer = Kontaktformular)</label>
      <input type="text" bind:value={data.ctaHref} class={inputCls} placeholder="z.B. /termin" />
    </div>
  </div>

  <!-- FAQ -->
  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Häufige Fragen (FAQ)</h3>
      <button onclick={addFaq} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Frage</button>
    </div>
    {#each data.faq as item, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div>
          <label class={labelCls}>Frage</label>
          <input type="text" bind:value={item.question} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Antwort</label>
          <textarea bind:value={item.answer} rows={3} class="{inputCls} resize-none"></textarea>
        </div>
        <button onclick={() => removeFaq(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
      </div>
    {/each}
  </div>
</div>
