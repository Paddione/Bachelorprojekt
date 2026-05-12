<script lang="ts">
  import type { HomepageContent, ProcessStep } from '../../../lib/website-db';

  let { initialData }: { initialData: HomepageContent } = $props();
  let data = $state(JSON.parse(JSON.stringify(initialData)));
  let saving = $state(false);
  let msg = $state(''); let msgOk = $state(true);

  function addWhyMePoint() { data.whyMePoints = [...data.whyMePoints, { title: '', text: '' }]; }
  function removeWhyMePoint(i: number) { data.whyMePoints = data.whyMePoints.filter((_: unknown, idx: number) => idx !== i); }
  function moveWhyMePoint(i: number, d: number) { const n=i+d; if(n<0||n>=data.whyMePoints.length)return; const l=[...data.whyMePoints];[l[i],l[n]]=[l[n],l[i]];data.whyMePoints=l; }
  function addStat() { data.stats = [...data.stats, { value: '', label: '' }]; }
  function removeStat(i: number) { data.stats = data.stats.filter((_: unknown, idx: number) => idx !== i); }
  function addProcessStep() { const n=(data.processSteps?.length??0)+1; data.processSteps=[...(data.processSteps??[]),{num:`0${n} — Schritt`,heading:'',description:''}]; }
  function removeProcessStep(i: number) { data.processSteps=(data.processSteps??[]).filter((_: unknown,idx:number)=>idx!==i); }
  function moveProcessStep(i: number, d: number) { const l=[...(data.processSteps??[])]; const n=i+d; if(n<0||n>=l.length)return;[l[i],l[n]]=[l[n],l[i]];data.processSteps=l; }

  async function save() {
    saving=true; msg='';
    try {
      const res=await fetch('/api/admin/startseite/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      const json=await res.json();
      if(res.ok){msg='Gespeichert.';msgOk=true;}else{msg=json.error??'Fehler.';msgOk=false;}
    } catch{msg='Verbindungsfehler.';msgOk=false;} finally{saving=false;}
  }

  const inputCls='w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls='block text-xs text-muted mb-1';
  const sectionCls='p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Startseite</h2>
      <p class="text-muted mt-1 text-sm">Hero, Stats, Warum-ich-Abschnitt und Zitat</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">{saving?'Speichere…':'Speichern'}</button>
  </div>

  {#if msg}<div class={`p-4 rounded-xl text-sm ${msgOk?'bg-green-500/10 border border-green-500/30 text-green-400':'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>{/if}

  <!-- Zentrale Elemente -->
  <div class="p-4 bg-dark-light rounded-xl border border-gold/20 space-y-1">
    <p class="text-xs font-mono uppercase tracking-widest text-gold mb-2">Zentral gepflegte Elemente</p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">SEO (Seitentitel & Meta-Description)</strong> → <a href="/admin/inhalte?tab=website&section=seo" class="text-gold hover:underline">SEO-Tab</a></p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">Footer & Header-Standort</strong> → <a href="/admin/inhalte?tab=website&section=kontakt" class="text-gold hover:underline">Kontakt-Tab</a></p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">Angebots-Karten (Reihenfolge & Inhalte)</strong> → <a href="/admin/inhalte?tab=website&section=angebote" class="text-gold hover:underline">Angebote-Tab</a></p>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Hero-Bereich</h3>
    <div><label class={labelCls}>Kicker-Zeile</label><input type="text" bind:value={data.hero.tagline} class={inputCls} /></div>
    <div><label class={labelCls}>Titel</label><textarea bind:value={data.hero.title} rows={2} class="{inputCls} resize-none"></textarea></div>
    <div>
      <label class={labelCls}>Titel-Hervorhebung (kursiv, hinter dem Titel)</label>
      <input type="text" bind:value={data.hero.titleEmphasis} class={inputCls} placeholder="z. B. wieder verbinden." />
    </div>
    <div><label class={labelCls}>Untertitel</label><textarea bind:value={data.hero.subtitle} rows={3} class="{inputCls} resize-none"></textarea></div>
  </div>

  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Statistiken</h3>
      <button type="button" onclick={addStat} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Hinzufügen</button>
    </div>
    {#each data.stats as stat, i}
      <div class="grid grid-cols-[1fr_1fr_auto] gap-4 items-end">
        <div><label class={labelCls}>Wert</label><input type="text" bind:value={stat.value} class={inputCls} /></div>
        <div><label class={labelCls}>Label</label><input type="text" bind:value={stat.label} class={inputCls} /></div>
        <button type="button" onclick={() => removeStat(i)} class="text-xs text-red-400 hover:text-red-300 pb-2">Entfernen</button>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Angebote-Sektion</h3>
    <div><label class={labelCls}>Überschrift</label><input type="text" bind:value={data.servicesHeadline} class={inputCls} /></div>
    <div><label class={labelCls}>Unterüberschrift</label><textarea bind:value={data.servicesSubheadline} rows={2} class="{inputCls} resize-none"></textarea></div>
    <p class="text-xs text-muted">Karten-Reihenfolge &amp; Inhalte → <a href="/admin/inhalte?tab=website&section=angebote" class="text-gold hover:underline">Angebote-Tab</a></p>
  </div>

  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">„Warum ich?“-Abschnitt</h3>
      <button type="button" onclick={addWhyMePoint} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Passage</button>
    </div>
    <div><label class={labelCls}>Überschrift</label><input type="text" bind:value={data.whyMeHeadline} class={inputCls} /></div>
    <div><label class={labelCls}>Einleitungstext</label><textarea bind:value={data.whyMeIntro} rows={3} class="{inputCls} resize-none"></textarea></div>
    {#each data.whyMePoints as pt, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted">Punkt {i+1}</span>
          <div class="flex gap-1">
            <button onclick={() => moveWhyMePoint(i,-1)} disabled={i===0} class="px-2 py-0.5 text-xs text-muted hover:text-light disabled:opacity-30">↑</button>
            <button onclick={() => moveWhyMePoint(i,1)} disabled={i===data.whyMePoints.length-1} class="px-2 py-0.5 text-xs text-muted hover:text-light disabled:opacity-30">↓</button>
            <button onclick={() => removeWhyMePoint(i)} class="ml-2 px-2 py-0.5 text-xs text-red-400 hover:text-red-300">Entfernen</button>
          </div>
        </div>
        <div><label class={labelCls}>Titel</label><input type="text" bind:value={pt.title} class={inputCls} /></div>
        <div><label class={labelCls}>Text</label><textarea bind:value={pt.text} rows={2} class="{inputCls} resize-none"></textarea></div>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Zitat</h3>
    <div><label class={labelCls}>Zitat-Text</label><textarea bind:value={data.quote} rows={2} class="{inputCls} resize-none"></textarea></div>
    <div><label class={labelCls}>Name unter dem Zitat</label><input type="text" bind:value={data.quoteName} class={inputCls} /></div>
  </div>

  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <div><h3 class="text-xl font-bold text-light font-serif">Prozess-Schritte</h3></div>
      <button type="button" onclick={addProcessStep} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Schritt</button>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div><label class={labelCls}>Kicker (z.B. „So arbeiten wir“)</label><input type="text" bind:value={data.processEyebrow} class={inputCls} /></div>
      <div><label class={labelCls}>Überschrift</label><input type="text" bind:value={data.processHeadline} class={inputCls} /></div>
    </div>
    {#each (data.processSteps??[]) as step, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted">Schritt {i+1}</span>
          <div class="flex gap-1">
            <button onclick={() => moveProcessStep(i,-1)} disabled={i===0} class="px-2 py-0.5 text-xs text-muted hover:text-light disabled:opacity-30">↑</button>
            <button onclick={() => moveProcessStep(i,1)} disabled={i===(data.processSteps?.length??0)-1} class="px-2 py-0.5 text-xs text-muted hover:text-light disabled:opacity-30">↓</button>
            <button onclick={() => removeProcessStep(i)} class="ml-2 px-2 py-0.5 text-xs text-red-400 hover:text-red-300">Entfernen</button>
          </div>
        </div>
        <div><label class={labelCls}>Nummer / Kicker</label><input type="text" bind:value={step.num} class={inputCls} /></div>
        <div><label class={labelCls}>Überschrift</label><input type="text" bind:value={step.heading} class={inputCls} /></div>
        <div><label class={labelCls}>Beschreibung</label><textarea bind:value={step.description} rows={2} class="{inputCls} resize-none"></textarea></div>
      </div>
    {/each}
  </div>
</div>
