<script lang="ts">
  import type { ReferenzenConfig } from '../../../lib/website-db';
  let { initialData }: { initialData: ReferenzenConfig } = $props();
  let data=$state(JSON.parse(JSON.stringify(initialData)));
  if(!data.types)data.types=[];
  if(!data.items)data.items=[];
  let saving=$state(false);let msg=$state('');let msgOk=$state(true);

  async function save(){
    saving=true;msg='';
    try{
      const res=await fetch('/api/admin/referenzen/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      const json=await res.json();
      if(res.ok){msg='Gespeichert.';msgOk=true;}else{msg=json.error??'Fehler.';msgOk=false;}
    }catch{msg='Verbindungsfehler.';msgOk=false;}finally{saving=false;}
  }

  function addType(){data.types=[...data.types,{id:crypto.randomUUID().slice(0,8),label:''}];}
  function removeType(i:number){const id=data.types[i].id;data.types=data.types.filter((_:unknown,idx:number)=>idx!==i);data.items=data.items.map((it:any)=>it.type===id?{...it,type:undefined}:it);}
  function addItem(){data.items=[...data.items,{id:crypto.randomUUID().slice(0,8),name:'',url:'',logoUrl:'',description:'',type:''}];}
  function removeItem(i:number){data.items=data.items.filter((_:unknown,idx:number)=>idx!==i);}

  const inputCls='w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls='block text-xs text-muted mb-1';
  const sectionCls='p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div><h2 class="text-2xl font-bold text-light font-serif">Referenzen &amp; Kooperationspartner</h2><p class="text-muted mt-1 text-sm">Referenzen und Partner verwalten</p></div>
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
    <div><label class={labelCls}>Überschrift</label><input type="text" bind:value={data.heading} class={inputCls} placeholder="Referenzen & Kooperationspartner" /></div>
    <div><label class={labelCls}>Unterüberschrift</label><input type="text" bind:value={data.subheading} class={inputCls} placeholder="Organisationen und Menschen, mit denen ich arbeite" /></div>
  </div>

  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Gruppen / Kategorien</h3>
      <button onclick={addType} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Gruppe</button>
    </div>
    <p class="text-xs text-muted">Gruppen ermöglichen eine strukturierte Darstellung (z.B. "Unternehmen", "Behörden").</p>
    {#each data.types as t, i}
      <div class="flex gap-2 items-center">
        <input type="text" bind:value={t.label} class="{inputCls} flex-1" placeholder="Gruppenname" />
        <span class="text-xs text-muted font-mono">{t.id}</span>
        <button onclick={() => removeType(i)} class="text-xs text-red-400 hover:text-red-300">✕</button>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Einträge</h3>
      <button onclick={addItem} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Eintrag</button>
    </div>
    {#each data.items as it, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div class="grid grid-cols-2 gap-3">
          <div><label class={labelCls}>Name *</label><input type="text" bind:value={it.name} class={inputCls} /></div>
          <div>
            <label class={labelCls}>Gruppe</label>
            <select bind:value={it.type} class={inputCls}>
              <option value="">(keine)</option>
              {#each data.types as t}<option value={t.id}>{t.label}</option>{/each}
            </select>
          </div>
        </div>
        <div><label class={labelCls}>Website-URL</label><input type="url" bind:value={it.url} class={inputCls} placeholder="https://" /></div>
        <div><label class={labelCls}>Logo-URL</label><input type="url" bind:value={it.logoUrl} class={inputCls} placeholder="https://" /></div>
        <div><label class={labelCls}>Beschreibung (optional)</label><textarea bind:value={it.description} rows={2} class="{inputCls} resize-none"></textarea></div>
        <button onclick={() => removeItem(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
      </div>
    {/each}
  </div>
</div>
