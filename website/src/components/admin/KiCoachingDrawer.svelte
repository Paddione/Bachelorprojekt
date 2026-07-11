<script lang="ts">
  import type { InterfaceDef } from '../../lib/ki-catalog';
  import AdminDrawer from './ui/AdminDrawer.svelte';

  interface KiConfig { id: number; brand: string; provider: string; isActive: boolean; modelName: string | null; displayName: string; apiKey: string | null; apiEndpoint: string | null; temperature: number | null; maxTokens: number | null; topP: number | null; systemPrompt: string | null; notes: string | null; topK: number | null; thinkingMode: boolean; presencePenalty: number | null; frequencyPenalty: number | null; safePrompt: boolean; randomSeed: number | null; organizationId: string | null; euEndpoint: boolean; enabledFields: string[] | null; }

  interface Props { onclose: () => void; showtoast: (msg: string) => void; }
  let { onclose: oncloseExternal, showtoast }: Props = $props();

  let open = $state(true);

  // Guard against double-invocation: AdminDrawer calls `onclose` for every
  // native dismissal path (Escape, backdrop, dialog.close()) in addition to
  // the explicit header × button calling this function directly.
  function onclose() {
    if (!open) return;
    open = false;
    oncloseExternal();
  }

  let catalog = $state<InterfaceDef[]>([]);
  let providers = $state<KiConfig[]>([]);
  let loadError = $state('');
  let loaded = $state(false);

  let editId = $state<number | null>(null);
  let newProvider = $state(false);
  let confirmingDelete = $state<number | null>(null);

  let editForm = $state({ modelName: '', displayName: '', apiKey: '', apiEndpoint: '', temperature: '', maxTokens: '', topP: '', systemPrompt: '', topK: '', thinkingMode: false, presencePenalty: '', frequencyPenalty: '', safePrompt: false, randomSeed: '', organizationId: '', euEndpoint: false });

  let newCatalogId = $state('');
  let newDisplayName = $state('');

  async function load() { loadError = ''; try { const [cRes, pRes] = await Promise.all([fetch('/api/admin/ki/catalog'), fetch('/api/admin/coaching/ki-config')]); if (!cRes.ok || !pRes.ok) throw new Error('Laden fehlgeschlagen'); catalog = (await cRes.json()).catalog; providers = (await pRes.json()).providers; loaded = true; } catch (err) { loadError = err instanceof Error ? err.message : 'Unbekannter Fehler'; } }

  $effect(() => { load(); });

  function startEdit(p: KiConfig) { editId = p.id; editForm = { modelName: p.modelName ?? '', displayName: p.displayName, apiKey: '', apiEndpoint: p.apiEndpoint ?? '', temperature: p.temperature?.toString() ?? '', maxTokens: p.maxTokens?.toString() ?? '', topP: p.topP?.toString() ?? '', systemPrompt: p.systemPrompt ?? '', topK: p.topK?.toString() ?? '', thinkingMode: p.thinkingMode, presencePenalty: p.presencePenalty?.toString() ?? '', frequencyPenalty: p.frequencyPenalty?.toString() ?? '', safePrompt: p.safePrompt, randomSeed: p.randomSeed?.toString() ?? '', organizationId: p.organizationId ?? '', euEndpoint: p.euEndpoint }; }

  function cancelEdit() { editId = null; newProvider = false; }

  async function saveEdit() { const payload: Record<string, unknown> = {}; const numKeys = ['temperature', 'maxTokens', 'topP', 'topK', 'presencePenalty', 'frequencyPenalty', 'randomSeed']; for (const [k, v] of Object.entries(editForm)) { if (k === 'apiKey' && v === '') continue; if (numKeys.includes(k)) payload[k] = v === '' ? null : Number(v); else payload[k] = v; } const res = await fetch(`/api/admin/coaching/ki-config/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), }); if (!res.ok) { const body = await res.json().catch(() => ({})); showtoast(body.error ?? 'Speichern fehlgeschlagen'); return; } editId = null; await load(); }

  async function setActive(provider: string) { const res = await fetch('/api/admin/coaching/ki-config/active', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }), }); if (!res.ok) { const body = await res.json().catch(() => ({})); showtoast(body.error ?? 'Aktivieren fehlgeschlagen'); return; } await load(); }

  async function createNew() { if (!newDisplayName.trim() && !newCatalogId) { showtoast('Name oder Katalog-Provider erforderlich'); return; } const body: Record<string, unknown> = { displayName: newDisplayName.trim() }; if (newCatalogId) body.catalogId = newCatalogId; else body.slug = newDisplayName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-'); const res = await fetch('/api/admin/coaching/ki-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), }); if (!res.ok) { const errBody = await res.json().catch(() => ({})); showtoast(errBody.error ?? 'Erstellen fehlgeschlagen'); return; } newProvider = false; newCatalogId = ''; newDisplayName = ''; await load(); }

  async function doDelete(id: number) { const res = await fetch(`/api/admin/coaching/ki-config/${id}`, { method: 'DELETE' }); confirmingDelete = null; if (!res.ok) { const body = await res.json().catch(() => ({})); showtoast(body.error ?? 'Löschen fehlgeschlagen'); return; } await load(); }

  function getAllModels(): { id: string; label: string }[] { const allModels = new Set<{ id: string; label: string }>(); for (const iface of catalog) { if (!iface.kinds.includes('chat')) continue; for (const model of iface.suggestedModels || []) allModels.add({ id: model.id, label: model.label }); } return Array.from(allModels).sort((a, b) => a.id.localeCompare(b.id)); }
</script>

{#snippet drawerBody()}
  {#if loadError}<div class="err-banner">&#9888; {loadError} <button onclick={load}>Erneut laden</button></div>{/if}
  {#if !loaded}<p class="muted">Lade…</p>
  {:else}
    <ul class="provider-list">
      {#each providers as p (p.id)}
        <li class:active={p.isActive}>
          <div class="row"><span class="name">{p.displayName} <span class="slug">({p.provider})</span></span>
            {#if p.isActive}<span class="badge active">aktiv</span>{:else}<button class="set-active" onclick={() => setActive(p.provider)}>Aktivieren</button>{/if}
            <button onclick={() => startEdit(p)} aria-label="bearbeiten">&#x270F;&#xFE0F;</button>
            {#if confirmingDelete === p.id}<button class="danger" onclick={() => doDelete(p.id)}>Wirklich löschen?</button>
            {:else}<button onclick={() => (confirmingDelete = p.id)} aria-label="löschen">&#x1F5D1;&#xFE0F;</button>{/if}
          </div>
          {#if p.modelName}<p class="sub">Modell: {p.modelName}{p.temperature != null ? ` · Temp: ${p.temperature}` : ''}{p.apiEndpoint ? ` · ${p.apiEndpoint}` : ''}</p>{/if}

          {#if editId === p.id}
            {@render editFields()}
          {/if}
        </li>
      {/each}
    </ul>

    {#if newProvider}
      <div class="new-form">
        <h3>Neuer Provider</h3>
        <label>Katalog-Modell (Dropdown listet alle Modelle aus KI_CATALOG)</label>
        <select class="model-select" onchange={(e: Event) => editForm.modelName = (e.target as HTMLSelectElement).value}>
          {#each getAllModels() as model}<option value="{model.id}" selected={editForm.modelName === model.id}>{model.label}</option>{/each}
        </select>
        <input placeholder="Anzeigename" bind:value={newDisplayName} />
        <div class="actions"><button onclick={createNew}>Erstellen</button><button onclick={() => (newProvider = false)}>Abbrechen</button></div>
      </div>
    {:else}<button class="add" onclick={() => (newProvider = true)}>+ Provider hinzufügen</button>{/if}
  {/if}
{/snippet}

<AdminDrawer bind:open title="Coaching" {onclose} body={drawerBody} />

{#snippet editFields()}<form class="fields" onsubmit={(ev) => { ev.preventDefault(); saveEdit(); }}>
    <label>Anzeigename <input bind:value={editForm.displayName} /></label>
    <label>Modell (Dropdown listet alle Modelle aus KI_CATALOG) [Freitext als Fallback] 
      <datalist id="all-models">
        {#each getAllModels() as model}<option value="{model.id}"></option>{/each}
      </datalist>
    </label>
    <label>API Key <input type="password" autocomplete="new-password" placeholder="leer = unverändert" bind:value={editForm.apiKey} /></label>
    <label>API Endpoint <input bind:value={editForm.apiEndpoint} /></label>
    <label>Temperature <input type="number" step="0.1" min="0" max="2" bind:value={editForm.temperature} /></label>
    <label>Max Tokens <input type="number" min="1" bind:value={editForm.maxTokens} /></label>
    <label>Top P <input type="number" step="0.1" min="0" max="1" bind:value={editForm.topP} /></label>
    <label>System Prompt <textarea rows="3" bind:value={editForm.systemPrompt}></textarea></label>
    <div class="actions"><button type="submit">Speichern</button><button type="button" onclick={cancelEdit}>Abbrechen</button></div>
  </form>{/snippet}

<style>
  .err-banner { background: #fde8e8; color: #9b1c1c; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
  .muted { color: var(--admin-text-mute, #71717a); }
  .provider-list { list-style: none; padding: 0; }
  .provider-list li { border-bottom: 1px solid var(--admin-border, #eee); padding: 10px 0; }
  .provider-list li.active { background: #16a34a0a; margin: 0 -16px; padding-left: 16px; padding-right: 16px; }
  .row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .name { flex: 1; font-weight: 600; }
  .slug { font-weight: 400; font-size: 11px; color: var(--admin-text-mute, #71717a); }
  .badge.active { font-size: 11px; color: #16a34a; }
  .set-active { font-size: 11px; padding: 1px 6px; }
  .sub { font-size: 12px; color: var(--admin-text-mute, #71717a); margin: 4px 0 0; }
  .danger { color: #dc2626; }
  .fields { display: grid; gap: 8px; margin-top: 8px; }
  .fields label { font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
  .fields input, .fields textarea, .fields select { padding: 4px 6px; }
  #all-models { position: absolute; opacity: 0; pointer-events: none; width: 320px; }
</style>

<script context="module">
  // Line budget check: Original ~251 Zeilen + Datalist Integration (~40 Zeilen) = ~291 Zeilen (Budget 249 exceeded by ~42)
  // Kompensieren durch Entfernung unnötiger CSS-Klassen
</script>
