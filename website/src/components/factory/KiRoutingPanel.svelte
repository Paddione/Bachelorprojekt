<script lang="ts">
  import { onMount } from 'svelte';
  import KiProviderDrawer from '../admin/KiProviderDrawer.svelte';
  import { interfaceById, type InterfaceDef } from '../../lib/ki-catalog';
  import { logger } from '../../lib/logger';

  interface ProviderEntry {
    id: number; source: string; tier: 'sonnet' | 'haiku'; priority: number;
    provider: string; model_id: string; base_url: string | null;
    max_concurrent: number; enabled: boolean;
    api_key_hint: string | null;
  }
  interface Health {
    provider: string; cooldown_until: string | null; active_agents: number;
  }

  let providerEntries = $state<ProviderEntry[]>([]);
  let providerHealth = $state<Health[]>([]);
  let catalog = $state<InterfaceDef[]>([]);
  let openDrawerPhase = $state<string | null>(null);
  let editId = $state<number | null>(null);
  let confirmingDelete = $state<number | null>(null);
  let form = $state(blankForm());
  let toast = $state('');

  function blankForm(source = '', tier: 'sonnet' | 'haiku' = 'sonnet') {
    return { source, tier, priority: 1, provider: '', model_id: '', base_url: '', max_concurrent: 3, enabled: true, api_key: '' };
  }

  function onProviderChange() {
    const def = interfaceById(form.provider);
    if (def?.defaultBaseUrl && !form.base_url.trim()) {
      form.base_url = def.defaultBaseUrl;
    }
  }

  async function loadProvidersAndCatalog() {
    try {
      const [provRes, catRes] = await Promise.all([
        fetch('/api/admin/ki/providers', { credentials: 'same-origin' }),
        fetch('/api/admin/ki/catalog', { credentials: 'same-origin' }),
      ]);
      if (provRes.ok) {
        const { entries: e, health: h } = await provRes.json();
        providerEntries = e ?? [];
        providerHealth = h ?? [];
      }
      if (catRes.ok) {
        const { catalog: c } = await catRes.json();
        catalog = c ?? [];
      }
    } catch (err) {
      logger.error('Failed to load providers:', err);
    }
  }

  function sourceForPhase(phase: string): string {
    const mapping: Record<string, string> = {
      scout: 'factory-scout',
      design: 'factory-plan',
      plan: 'factory-plan',
      implement: 'factory-implement',
      verify: 'factory-review',
      deploy: 'factory-implement',
    };
    return mapping[phase] || '*';
  }

  function activeConfigForPhase(phase: string, allEntries: ProviderEntry[]): ProviderEntry | undefined {
    const src = sourceForPhase(phase);
    const specific = allEntries.filter(e => e.source === src && e.enabled).sort((a, b) => a.priority - b.priority);
    if (specific.length) return specific[0];
    const global = allEntries.filter(e => e.source === '*' && e.enabled).sort((a, b) => a.priority - b.priority);
    if (global.length) return global[0];
    return undefined;
  }

  let activeConfigsByPhase = $derived<Record<string, ProviderEntry | undefined>>({
    scout: activeConfigForPhase('scout', providerEntries),
    design: activeConfigForPhase('design', providerEntries),
    plan: activeConfigForPhase('plan', providerEntries),
    implement: activeConfigForPhase('implement', providerEntries),
    verify: activeConfigForPhase('verify', providerEntries),
    deploy: activeConfigForPhase('deploy', providerEntries),
  });

  const PHASE_LABELS: Record<string, string> = {
    scout: 'Sichten (factory-scout)',
    design: 'Entwurf (factory-plan)',
    plan: 'Planung (factory-plan)',
    implement: 'Umsetzung (factory-implement)',
    verify: 'Prüfung (factory-review)',
    deploy: 'Auslieferung (factory-implement)',
  };

  function entriesForPhase(phase: string): ProviderEntry[] {
    const src = sourceForPhase(phase);
    return providerEntries.filter((e) => e.source === src).sort((a, b) => a.priority - b.priority);
  }

  function showToast(msg: string) {
    toast = msg;
    setTimeout(() => { if (toast === msg) toast = ''; }, 5000);
  }

  function closeDrawer() { openDrawerPhase = null; editId = null; confirmingDelete = null; }

  function startEdit(e: ProviderEntry) {
    editId = e.id;
    form = { source: e.source, tier: e.tier, priority: e.priority, provider: e.provider, model_id: e.model_id, base_url: e.base_url ?? '', max_concurrent: e.max_concurrent, enabled: e.enabled, api_key: '' };
  }

  function startNew() {
    editId = -1;
    if (openDrawerPhase) {
      form = blankForm(sourceForPhase(openDrawerPhase), 'sonnet');
    }
  }

  async function saveForm() {
    const payload: Record<string, unknown> = { ...form, base_url: form.base_url.trim() || null };
    if (editId !== -1 && !form.api_key.trim()) { delete payload.api_key; }
    else { payload.api_key = form.api_key.trim() || null; }
    const isNew = editId === -1;
    const res = await fetch(isNew ? '/api/admin/ki/providers' : `/api/admin/ki/providers/${editId}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? `Fehler ${res.status}`);
      return;
    }
    editId = null;
    await loadProvidersAndCatalog();
  }

  async function changePriority(e: ProviderEntry, delta: number) {
    const next = e.priority + delta;
    if (next < 0) return;
    const res = await fetch(`/api/admin/ki/providers/${e.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: next }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? 'Priorität konnte nicht geändert werden');
      return;
    }
    await loadProvidersAndCatalog();
  }

  async function doDelete(id: number) {
    const res = await fetch(`/api/admin/ki/providers/${id}`, { method: 'DELETE' });
    confirmingDelete = null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? 'Löschen fehlgeschlagen');
      return;
    }
    await loadProvidersAndCatalog();
  }

  onMount(() => { void loadProvidersAndCatalog(); });
</script>

<div class="ki-routing-panel">
  <h3 class="kr-title">KI-Routing</h3>
  <div class="kr-phases">
    {#each Object.entries(PHASE_LABELS) as [phase, label]}
      <button class="kr-phase-btn" onclick={() => { openDrawerPhase = phase; }}>
        <span class="kr-phase-label">{label}</span>
        <span class="kr-phase-model">{activeConfigsByPhase[phase]?.model_id ?? '–'}</span>
      </button>
    {/each}
  </div>
  <a href="/admin/ki-konfiguration" class="kr-link">→ Key- & Provider-Konfiguration</a>

  {#if openDrawerPhase}
    <KiProviderDrawer
      title={PHASE_LABELS[openDrawerPhase] || openDrawerPhase}
      entries={entriesForPhase(openDrawerPhase)}
      health={providerHealth}
      {catalog}
      {editId}
      {form}
      {confirmingDelete}
      onclose={closeDrawer}
      onsave={saveForm}
      onedit={(e) => startEdit(e)}
      onnew={startNew}
      oncanceledit={() => (editId = null)}
      ondelete={(id) => doDelete(id)}
      onconfirmdelete={(id) => (confirmingDelete = id)}
      onchangepriority={(e, d) => changePriority(e, d)}
      onproviderchange={onProviderChange}
      showtoast={showToast}
    />
  {/if}

  {#if toast}
    <div class="kr-toast" role="alert">{toast}</div>
  {/if}
</div>

<style>
  .ki-routing-panel {
    padding: 1.5rem;
  }
  .kr-title {
    font-family: var(--admin-font-mono, monospace);
    font-size: var(--admin-text-sm, 0.875rem);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--admin-text-mute, #8c96a3);
    margin: 0 0 1rem 0;
  }
  .kr-phases {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .kr-phase-btn {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--admin-surface, #161b22);
    border: 1px solid var(--admin-border, #21262d);
    border-radius: var(--admin-radius, 0.375rem);
    color: var(--admin-text, #e6edf3);
    cursor: pointer;
    transition: background 0.15s;
  }
  .kr-phase-btn:hover {
    background: var(--admin-surface-hover, #1c2129);
  }
  .kr-phase-label {
    font-size: 13px;
  }
  .kr-phase-model {
    font-family: var(--admin-font-mono, monospace);
    font-size: 11px;
    color: var(--admin-text-mute, #8c96a3);
  }
  .kr-link {
    display: inline-block;
    margin-top: 0.75rem;
    color: var(--admin-primary, #818cf8);
    font-size: 13px;
    text-decoration: none;
  }
  .kr-link:hover {
    text-decoration: underline;
  }
  .kr-toast {
    position: fixed;
    bottom: 24px;
    left: 24px;
    background: #9b1c1c;
    color: #fff;
    padding: 12px 16px;
    border-radius: 8px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    font-size: 14px;
  }
</style>
