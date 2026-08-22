<script lang="ts">
  import { onMount } from 'svelte';
  import KiProviderDrawer from '../../admin/KiProviderDrawer.svelte';
  import { interfaceById, type InterfaceDef } from '../../../lib/ki-catalog.ts';
  import { browserLogger } from '../../../lib/browser-logger.ts';

  interface ProviderEntry {
    id: number; source: string; tier: 'sonnet' | 'haiku'; priority: number;
    provider: string; model_id: string; base_url: string | null;
    max_concurrent: number; enabled: boolean;
    api_key_hint: string | null;
  }
  interface Health {
    provider: string; cooldown_until: string | null; active_agents: number;
  }
  interface FactorySelectable { slug: string; label: string; port: number }
  interface FactoryDefault {
    model: string | null;
    locked: boolean;
    mtimeMs: number;
    selectable: FactorySelectable[];
  }
  interface CatalogEntry {
    provider: string;
    modelId: string;
    available: boolean | null;
  }
  interface PhaseResolution {
    phase: string;
    source: string;
    configuredModel: string | null;
    inheritsDefault: boolean;
    servedModel: string | null;
    fallback: boolean;
    backendName: string | null;
  }

  let providerEntries = $state<ProviderEntry[]>([]);
  let providerHealth = $state<Health[]>([]);
  let catalog = $state<InterfaceDef[]>([]);
  // Modell-Auswahlliste (Proxy ∪ DB) und effektive Auflösung pro Phase —
  // berechnet serverseitig in lib/sdlc/model-catalog.ts, hier nur Anzeige.
  let modelChoices = $state<CatalogEntry[]>([]);
  let resolutions = $state<PhaseResolution[]>([]);
  let catalogError = $state<string | null>(null);

  // Factory-Default (llm-proxy loadouts.json factory.model)
  let factoryDefault = $state<FactoryDefault | null>(null);
  let factoryOffline = $state(false);
  let savingFactory = $state(false);
  let factoryConflict = $state(false);

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

  async function fetchJson<T>(url: string): Promise<{ ok: boolean; body: T | null; status: number }> {
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      const ok = res.ok;
      return { ok, status: res.status, body: ok ? ((await res.json()) as T) : null };
    } catch {
      return { ok: false, status: 0, body: null };
    }
  }

  async function loadProvidersAndCatalog() {
    const [provRes, catRes] = await Promise.all([
      fetchJson<{ entries: ProviderEntry[]; health: Health[] }>('/sdlc/api/ki/providers'),
      fetchJson<{ catalog: InterfaceDef[] }>('/sdlc/api/ki/catalog'),
    ]);
    if (provRes.ok && provRes.body) {
      providerEntries = provRes.body.entries ?? [];
      providerHealth = provRes.body.health ?? [];
    }
    if (catRes.ok && catRes.body) {
      catalog = catRes.body.catalog ?? [];
    }
  }

  async function loadFactoryDefault() {
    const res = await fetchJson<FactoryDefault & { error?: string }>('/sdlc/api/llm-proxy/factory');
    if (res.ok && res.body) {
      factoryDefault = {
        model: res.body.model ?? null,
        locked: res.body.locked === true,
        mtimeMs: res.body.mtimeMs ?? 0,
        selectable: res.body.selectable ?? [],
      };
      factoryOffline = false;
    } else {
      // Der Proxy wird ausdrücklich als nicht erreichbar benannt — kein leerer
      // Default darf ihn vortäuschen.
      factoryOffline = true;
      factoryDefault = null;
    }
  }

  async function loadCatalogAndResolutions() {
    const res = await fetchJson<{
      entries: CatalogEntry[];
      resolutions: PhaseResolution[];
      error?: string;
    }>('/sdlc/api/llm-proxy/catalog');
    if (res.ok && res.body) {
      modelChoices = res.body.entries ?? [];
      resolutions = res.body.resolutions ?? [];
      catalogError = null;
    } else {
      catalogError = 'Modell-Katalog nicht ladbar';
    }
  }

  async function reloadAll() {
    await Promise.all([loadProvidersAndCatalog(), loadFactoryDefault(), loadCatalogAndResolutions()]);
  }

  function resolutionFor(phase: string): PhaseResolution | undefined {
    return resolutions.find((r) => r.phase === phase);
  }

  function showToast(msg: string) {
    toast = msg;
    setTimeout(() => { if (toast === msg) toast = ''; }, 5000);
  }

  async function saveFactoryDefault(slug: string) {
    if (!factoryDefault || !slug) return;
    savingFactory = true;
    factoryConflict = false;
    try {
      const res = await fetch('/sdlc/api/llm-proxy/factory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          model: slug,
          locked: factoryDefault.locked,
          mtimeMs: factoryDefault.mtimeMs,
        }),
      });
      if (res.status === 409) {
        // Jemand anders hat geschrieben — nicht still überschreiben, sondern
        // den Konflikt benennen und das Nachladen anbieten.
        factoryConflict = true;
        showToast('Standard wurde anderswo geändert — bitte neu laden.');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? `Fehler ${res.status}`);
        return;
      }
      const body = (await res.json()) as { saved: boolean; mtimeMs: number };
      factoryDefault = { ...factoryDefault, model: slug, mtimeMs: body.mtimeMs };
      showToast(`Standard auf ${slug} gesetzt.`);
    } finally {
      savingFactory = false;
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

  function entryKey(entry: CatalogEntry): string {
    return `${entry.provider}|${entry.modelId}`;
  }

  function configuredKey(phase: string): string {
    const r = resolutionFor(phase);
    if (!r?.configuredModel) return '';
    const match = modelChoices.find((e) => e.modelId === r.configuredModel);
    return match ? entryKey(match) : `raw|${r.configuredModel}`;
  }

  async function changePhaseModel(phase: string, key: string) {
    if (!key) return;
    const [provider, modelId] = key.startsWith('raw|')
      ? ['local', key.slice(4)]
      : [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
    if (!modelId) return;
    const source = sourceForPhase(phase);
    const existing = providerEntries
      .filter((e) => e.source === source)
      .sort((a, b) => a.priority - b.priority)[0];

    const payload = existing
      ? { provider, model_id: modelId }
      : { source, tier: 'sonnet', priority: 1, provider, model_id: modelId, base_url: null, max_concurrent: 3, enabled: true };

    const res = await fetch(existing ? `/sdlc/api/ki/providers/${existing.id}` : '/sdlc/api/ki/providers', {
      method: existing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? `Zuordnung fehlgeschlagen (${res.status})`);
      return;
    }
    await loadCatalogAndResolutions();
    await loadProvidersAndCatalog();
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
    const res = await fetch(isNew ? '/sdlc/api/ki/providers' : `/sdlc/api/ki/providers/${editId}`, {
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
    await reloadAll();
  }

  async function changePriority(e: ProviderEntry, delta: number) {
    const next = e.priority + delta;
    if (next < 0) return;
    const res = await fetch(`/sdlc/api/ki/providers/${e.id}`, {
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
    const res = await fetch(`/sdlc/api/ki/providers/${id}`, { method: 'DELETE' });
    confirmingDelete = null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? 'Löschen fehlgeschlagen');
      return;
    }
    await Promise.all([loadProvidersAndCatalog(), loadCatalogAndResolutions()]);
  }

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

  onMount(() => { void reloadAll(); browserLogger.debug('[KiRoutingPanel] geladen'); });
</script>

<div class="ki-routing-panel">
  <h3 class="kr-title">KI-Routing</h3>

  <table class="kr-table" data-testid="ki-phase-table">
    <thead>
      <tr><th>Phase</th><th>Konfiguriert</th><th>Liefert derzeit</th><th></th></tr>
    </thead>
    <tbody>
      <!-- Kopfzeile: der Factory-Default (source='*'-Äquivalent am Proxy) -->
      <tr class="kr-default-row" data-testid="ki-factory-default">
        <td class="kr-phase-label">Standard / Alle Phasen</td>
        <td colspan="2">
          {#if factoryOffline}
            <span class="kr-offline">llm-proxy nicht erreichbar — Standard nur lesbar, kein Schreiben möglich.</span>
          {:else if factoryDefault}
            <div class="kr-default-controls">
              <select
                aria-label="Factory-Standardmodell"
                value={factoryDefault.model ?? ''}
                onchange={(e) => void saveFactoryDefault((e.target as HTMLSelectElement).value)}
                disabled={savingFactory}
              >
                <option value="" disabled>— Standard wählen —</option>
                {#each factoryDefault.selectable as opt (opt.slug)}
                  <option value={opt.slug}>{opt.label} ({opt.slug})</option>
                {/each}
              </select>
              {#if factoryDefault.model}<code class="kr-current">{factoryDefault.model}</code>{/if}
              {#if factoryDefault.locked}<span class="kr-badge">fixiert</span>{/if}
              {#if factoryConflict}
                <button class="ff-pill ff-pill--ghost" onclick={() => void loadFactoryDefault()}>
                  Neu laden
                </button>
              {/if}
            </div>
          {:else}
            <span class="kr-mute">Standard wird geladen…</span>
          {/if}
        </td>
        <td></td>
      </tr>

      {#each PHASE_LABELS as [phase, label] (phase)}
        {@const r = resolutionFor(phase)}
        <tr data-testid={`ki-phase-${phase}`}>
          <td class="kr-phase-label">
            {label}
            {#if r?.inheritsDefault}<span class="kr-badge kr-badge--inherits">erbt Standard</span>{/if}
          </td>
          <td>
            {#if catalogError}
              <span class="kr-offline">{catalogError}</span>
            {:else}
              <select
                aria-label={`Konfiguriertes Modell für ${label}`}
                value={configuredKey(phase)}
                onchange={(e) => void changePhaseModel(phase, (e.target as HTMLSelectElement).value)}
              >
                <option value="">— wie Standard —</option>
                {#each modelChoices as entry (entryKey(entry))}
                  <option value={entryKey(entry)}>
                    {entry.provider} / {entry.modelId}{entry.available === false ? ' · nicht verfügbar' : ''}
                  </option>
                {/each}
                {#if r?.configuredModel && !modelChoices.some((e) => e.modelId === r.configuredModel)}
                  <option value={`raw|${r.configuredModel}`}>{r.configuredModel}</option>
                {/if}
              </select>
            {/if}
          </td>
          <td>
            {#if r?.servedModel}
              {#if r.fallback}
                <span class="kr-fallback">→ {r.servedModel}</span>
              {:else}
                {r.servedModel}
              {/if}
              {#if r.backendName}<span class="kr-backend"> @ {r.backendName}</span>{/if}
            {:else}
              <span class="kr-mute">—</span>
            {/if}
          </td>
          <td>
            <button
              class="ff-pill ff-pill--ghost"
              onclick={() => { openDrawerPhase = phase; }}
              aria-label={`Routing für ${label} bearbeiten`}
            >Kette…</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <a href="/sdlc/cockpit?deck=ki" class="kr-link">→ Key- & Provider-Konfiguration</a>

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
  .kr-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--admin-surface, #161b22);
    border: 1px solid var(--admin-border, #21262d);
    border-radius: var(--admin-radius, 0.375rem);
    overflow: hidden;
    font-size: 13px;
  }
  .kr-table th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    font-family: var(--admin-font-mono, monospace);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--admin-text-mute, #8c96a3);
    border-bottom: 1px solid var(--admin-border, #21262d);
  }
  .kr-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--admin-border, #21262d);
    vertical-align: middle;
  }
  .kr-table tr:last-child td {
    border-bottom: none;
  }
  .kr-default-row td {
    background: rgba(129, 140, 248, 0.06);
  }
  .kr-phase-label {
    font-size: 13px;
    white-space: nowrap;
  }
  .kr-default-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .kr-current {
    font-family: var(--admin-font-mono, monospace);
    font-size: 11px;
    color: var(--admin-text-mute, #8c96a3);
  }
  .kr-badge {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-family: var(--admin-font-mono, monospace);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: rgba(129, 140, 248, 0.15);
    color: var(--admin-primary, #818cf8);
  }
  .kr-badge--inherits {
    margin-left: 0.5rem;
    background: rgba(139, 148, 158, 0.15);
    color: var(--admin-text-mute, #8c96a3);
  }
  .kr-select,
  select {
    width: 100%;
    max-width: 320px;
    background: var(--admin-surface-hover, #1c2129);
    border: 1px solid var(--admin-border, #21262d);
    border-radius: var(--admin-radius, 0.375rem);
    color: var(--admin-text, #e6edf3);
    font-size: 12px;
    padding: 4px 8px;
  }
  .kr-fallback {
    color: var(--admin-warning, #d29922);
  }
  .kr-backend {
    font-family: var(--admin-font-mono, monospace);
    font-size: 11px;
    color: var(--admin-text-mute, #8c96a3);
  }
  .kr-offline {
    color: var(--danger, #f85149);
    font-family: var(--admin-font-mono, monospace);
    font-size: 12px;
  }
  .kr-mute {
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
