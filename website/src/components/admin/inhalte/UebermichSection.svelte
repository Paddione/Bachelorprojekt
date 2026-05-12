<script lang="ts">
  import type { UebermichContent } from '../../../lib/website-db';
  let { initialData }: { initialData: UebermichContent } = $props();
  const raw = JSON.parse(JSON.stringify(initialData));
  if (!raw.warumdieserName) raw.warumdieserName = { title: 'Warum dieser Name', text: '' };
  let data = $state(raw);
  let saving=$state(false); let msg=$state(''); let msgOk=$state(true);

  async function save() {
    saving=true;msg='';
    try {
      const res=await fetch('/api/admin/uebermich/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      const json=await res.json();
      if(res.ok){msg='Gespeichert.';msgOk=true;}else{msg=json.error??'Fehler.';msgOk=false;}
    }catch{msg='Verbindungsfehler.';msgOk=false;}finally{saving=false;}
  }
  function addMilestone(){data.milestones=[...data.milestones,{year:'',title:'',desc:''}];}
  function removeMilestone(i:number){data.milestones=data.milestones.filter((_:unknown,idx:number)=>idx!==i);}
  function addNotDoing(){data.notDoing=[...data.notDoing,{title:'',text:''}];}
  function removeNotDoing(i:number){data.notDoing=data.notDoing.filter((_:unknown,idx:number)=>idx!==i);}

  const inputCls='w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls='block text-xs text-muted mb-1';
  const sectionCls='p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div><h2 class="text-2xl font-bold text-light font-serif">Über mich</h2><p class="text-muted mt-1 text-sm">Seiteninhalte bearbeiten</p></div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">{saving?'Speichere…':'Speichern'}</button>
  </div>

  {#if msg}<div class={`p-4 rounded-xl text-sm ${msgOk?'bg-green-500/10 border border-green-500/30 text-green-400':'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>{/if}

  <div class="p-4 bg-dark-light rounded-xl border border-gold/20 space-y-1">
    <p class="text-xs font-mono uppercase tracking-widest text-gold mb-2">Zentral gepflegte Elemente</p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">SEO (Seitentitel & Meta-Description)</strong> → <a href="/admin/inhalte?tab=website&section=seo" class="text-gold hover:underline">SEO-Tab</a></p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">Footer & Header-Standort</strong> → <a href="/admin/inhalte?tab=website&section=kontakt" class="text-gold hover:underline">Kontakt-Tab</a></p>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Seiten-Header</h3>
    <div><label class={labelCls}>Subheadline (goldene Zeile)</label><input type="text" bind:value={data.subheadline} class={inputCls} /></div>
    <div><label class={labelCls}>Seitenüberschrift (H1)</label><input type="text" bind:value={data.pageHeadline} class={inputCls} /></div>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Intro-Absätze</h3>
    {#each data.introParagraphs as _, i}
      <div><label class={labelCls}>Absatz {i+1}</label><textarea bind:value={data.introParagraphs[i]} rows={3} class="{inputCls} resize-none"></textarea></div>
    {/each}
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Abschnitte</h3>
    {#each data.sections as sec, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div><label class={labelCls}>Titel {i+1}</label><input type="text" bind:value={sec.title} class={inputCls} /></div>
        <div><label class={labelCls}>Inhalt {i+1}</label><textarea bind:value={sec.content} rows={4} class="{inputCls} resize-none"></textarea></div>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Meilensteine</h3>
      <button onclick={addMilestone} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Hinzufügen</button>
    </div>
    {#each data.milestones as ms, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div class="grid grid-cols-2 gap-4">
          <div><label class={labelCls}>Jahr</label><input type="text" bind:value={ms.year} class={inputCls} /></div>
          <div><label class={labelCls}>Titel</label><input type="text" bind:value={ms.title} class={inputCls} /></div>
        </div>
        <div><label class={labelCls}>Beschreibung</label><textarea bind:value={ms.desc} rows={2} class="{inputCls} resize-none"></textarea></div>
        <button onclick={() => removeMilestone(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Was ich nicht mache</h3>
      <button onclick={addNotDoing} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Hinzufügen</button>
    </div>
    {#each data.notDoing as nd, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div><label class={labelCls}>Titel</label><input type="text" bind:value={nd.title} class={inputCls} /></div>
        <div><label class={labelCls}>Text</label><textarea bind:value={nd.text} rows={2} class="{inputCls} resize-none"></textarea></div>
        <button onclick={() => removeNotDoing(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Privates</h3>
    <textarea bind:value={data.privateText} rows={4} class="{inputCls} resize-none"></textarea>
    <p class="text-xs text-muted">Platzhalter <code class="text-gold">{'{city}'}</code> wird durch die konfigurierte Stadt ersetzt.</p>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Abschnitt „Warum dieser Name“</h3>
    <div><label class={labelCls}>Überschrift</label><input type="text" bind:value={data.warumdieserName.title} class={inputCls} /></div>
    <div><label class={labelCls}>Text</label><textarea bind:value={data.warumdieserName.text} rows={4} class="{inputCls} resize-none"></textarea></div>
  </div>
</div>
