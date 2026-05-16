<script lang="ts">
  import type { KiConfig } from '../../../lib/coaching-ki-config-db';
  import type { StepTemplate } from '../../../lib/coaching-templates-db';

  let {
    initialProviders,
    initialTemplates,
  }: {
    initialProviders: KiConfig[];
    initialTemplates: StepTemplate[];
  } = $props();

  let activeTab = $state<'ki' | 'templates'>('ki');
  let providers = $state<KiConfig[]>(initialProviders);
  let templates = $state<StepTemplate[]>(initialTemplates);
  let savingProvider = $state<string | null>(null);
  let editingTemplate = $state<StepTemplate | null>(null);
  let editFields = $state({ stepName: '', systemPrompt: '', userPromptTpl: '', keywords: '' });

  // KI-Provider Inline-Edit
  let editingProvider = $state<KiConfig | null>(null);
  let providerEditTab = $state<'connection' | 'behavior'>('connection');
  let savingProviderEdit = $state(false);
  let showApiKey = $state(false);

  // Custom-Provider Anlegen
  let creatingProvider = $state(false);
  let savingNewProvider = $state(false);
  let newProviderForm = $state({
    displayName: '',
    slug: '',
    enabledFields: [] as string[],
  });

  const ALL_FIELDS: { key: string; label: string }[] = [
    { key: 'apiKey',           label: 'API-Key' },
    { key: 'apiEndpoint',      label: 'API-Endpunkt' },
    { key: 'modelName',        label: 'Modell' },
    { key: 'temperature',      label: 'Temperature' },
    { key: 'maxTokens',        label: 'Max Tokens' },
    { key: 'topP',             label: 'top_p' },
    { key: 'topK',             label: 'top_k' },
    { key: 'thinkingMode',     label: 'Thinking-Modus (Claude)' },
    { key: 'presencePenalty',  label: 'Presence Penalty' },
    { key: 'frequencyPenalty', label: 'Frequency Penalty' },
    { key: 'safePrompt',       label: 'Safe Prompt (Mistral)' },
    { key: 'randomSeed',       label: 'Random Seed' },
    { key: 'organizationId',   label: 'Organization ID' },
    { key: 'euEndpoint',       label: 'EU-Endpunkt (DSGVO)' },
    { key: 'systemPrompt',     label: 'System-Prompt' },
    { key: 'notes',            label: 'Notiz / Freitext' },
  ];

  type ProviderFields = {
    displayName: string; modelName: string;
    apiKey: string; apiEndpoint: string;
    temperature: string; maxTokens: string; topP: string;
    systemPrompt: string; notes: string;
    topK: string; thinkingMode: boolean;
    presencePenalty: string; frequencyPenalty: string;
    safePrompt: boolean; randomSeed: string;
    organizationId: string; euEndpoint: boolean;
  };

  let providerFields = $state<ProviderFields>({
    displayName: '', modelName: '',
    apiKey: '', apiEndpoint: '',
    temperature: '', maxTokens: '', topP: '',
    systemPrompt: '', notes: '',
    topK: '', thinkingMode: false,
    presencePenalty: '', frequencyPenalty: '',
    safePrompt: false, randomSeed: '',
    organizationId: '', euEndpoint: false,
  });

  function parseNum(s: string): number | null {
    const v = parseFloat(s);
    return isNaN(v) ? null : v;
  }

  function parseInt2(s: string): number | null {
    const v = parseInt(s, 10);
    return isNaN(v) ? null : v;
  }

  const KNOWN_FIELD_MAP: Record<string, string[]> = {
    claude:  ['apiKey', 'apiEndpoint', 'modelName', 'temperature', 'maxTokens', 'topP', 'topK', 'thinkingMode', 'systemPrompt', 'notes'],
    openai:  ['apiKey', 'apiEndpoint', 'modelName', 'temperature', 'maxTokens', 'topP', 'presencePenalty', 'frequencyPenalty', 'organizationId', 'systemPrompt', 'notes'],
    mistral: ['apiKey', 'apiEndpoint', 'modelName', 'temperature', 'maxTokens', 'topP', 'topK', 'safePrompt', 'randomSeed', 'euEndpoint', 'systemPrompt', 'notes'],
    lumo:    ['euEndpoint', 'notes'],
  };

  function showField(p: KiConfig, field: string): boolean {
    if (p.enabledFields !== null) return p.enabledFields.includes(field);
    return (KNOWN_FIELD_MAP[p.provider] ?? []).includes(field);
  }

  const PROVIDER_BADGE: Record<string, string> = {
    claude: 'Anthropic', openai: 'OpenAI', mistral: 'Mistral AI', lumo: 'Lumo',
  };

  function providerBadgeLabel(p: KiConfig): string {
    return PROVIDER_BADGE[p.provider] ?? (p.displayName || p.provider);
  }

  function isCustom(p: KiConfig): boolean {
    return p.provider.startsWith('custom_');
  }

  function startEditProvider(p: KiConfig) {
    editingProvider = p;
    providerEditTab = 'connection';
    showApiKey = false;
    providerFields = {
      displayName: p.displayName,
      modelName: p.modelName ?? '',
      apiKey: p.apiKey ?? '',
      apiEndpoint: p.apiEndpoint ?? '',
      temperature: p.temperature != null ? String(p.temperature) : '',
      maxTokens: p.maxTokens != null ? String(p.maxTokens) : '',
      topP: p.topP != null ? String(p.topP) : '',
      systemPrompt: p.systemPrompt ?? '',
      notes: p.notes ?? '',
      topK: p.topK != null ? String(p.topK) : '',
      thinkingMode: p.thinkingMode,
      presencePenalty: p.presencePenalty != null ? String(p.presencePenalty) : '',
      frequencyPenalty: p.frequencyPenalty != null ? String(p.frequencyPenalty) : '',
      safePrompt: p.safePrompt,
      randomSeed: p.randomSeed != null ? String(p.randomSeed) : '',
      organizationId: p.organizationId ?? '',
      euEndpoint: p.euEndpoint,
    };
  }

  async function saveProviderEdit() {
    if (!editingProvider) return;
    savingProviderEdit = true;
    const p = editingProvider;
    const payload: Record<string, unknown> = {
      displayName: providerFields.displayName,
      modelName: providerFields.modelName.trim() || null,
      apiKey: providerFields.apiKey.trim() || null,
      apiEndpoint: providerFields.apiEndpoint.trim() || null,
      temperature: parseNum(providerFields.temperature),
      maxTokens: parseInt2(providerFields.maxTokens),
      topP: parseNum(providerFields.topP),
      systemPrompt: providerFields.systemPrompt.trim() || null,
      notes: providerFields.notes.trim() || null,
    };
    if (showField(p, 'topK'))             payload.topK = parseInt2(providerFields.topK);
    if (showField(p, 'thinkingMode'))     payload.thinkingMode = providerFields.thinkingMode;
    if (showField(p, 'presencePenalty'))  payload.presencePenalty = parseNum(providerFields.presencePenalty);
    if (showField(p, 'frequencyPenalty')) payload.frequencyPenalty = parseNum(providerFields.frequencyPenalty);
    if (showField(p, 'safePrompt'))       payload.safePrompt = providerFields.safePrompt;
    if (showField(p, 'randomSeed'))       payload.randomSeed = parseInt2(providerFields.randomSeed);
    if (showField(p, 'organizationId'))   payload.organizationId = providerFields.organizationId.trim() || null;
    if (showField(p, 'euEndpoint'))       payload.euEndpoint = providerFields.euEndpoint;

    await fetch(`/api/admin/coaching/ki-config/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    providers = (await (await fetch('/api/admin/coaching/ki-config')).json()).providers;
    editingProvider = null;
    savingProviderEdit = false;
  }

  async function activateProvider(provider: string) {
    savingProvider = provider;
    await fetch('/api/admin/coaching/ki-config/active', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    providers = (await (await fetch('/api/admin/coaching/ki-config')).json()).providers;
    savingProvider = null;
  }

  function toggleNewField(key: string) {
    if (newProviderForm.enabledFields.includes(key)) {
      newProviderForm.enabledFields = newProviderForm.enabledFields.filter(k => k !== key);
    } else {
      newProviderForm.enabledFields = [...newProviderForm.enabledFields, key];
    }
  }

  async function saveNewProvider() {
    savingNewProvider = true;
    const res = await fetch('/api/admin/coaching/ki-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: newProviderForm.displayName.trim(),
        slug: newProviderForm.slug.trim(),
        enabledFields: newProviderForm.enabledFields,
      }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? 'Fehler beim Anlegen'); savingNewProvider = false; return; }
    providers = (await (await fetch('/api/admin/coaching/ki-config')).json()).providers;
    creatingProvider = false;
    newProviderForm = { displayName: '', slug: '', enabledFields: [] };
    savingNewProvider = false;
  }

  async function deleteProvider(p: KiConfig) {
    if (!confirm(`Anbieter "${p.displayName}" wirklich löschen?`)) return;
    const res = await fetch(`/api/admin/coaching/ki-config/${p.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? 'Fehler beim Löschen'); return; }
    providers = providers.filter(x => x.id !== p.id);
  }

  // Templates
  function startEdit(t: StepTemplate) {
    editingTemplate = t;
    editFields = {
      stepName: t.stepName,
      systemPrompt: t.systemPrompt,
      userPromptTpl: t.userPromptTpl,
      keywords: t.keywords.join(', '),
    };
  }

  const EMPTY_TEMPLATE: Omit<StepTemplate, 'id' | 'brand' | 'createdAt'> = {
    stepNumber: 1, stepName: '', phase: 'problem_ziel',
    systemPrompt: '', userPromptTpl: '', inputSchema: [],
    keywords: [], isActive: true, sortOrder: 0,
  };

  function startNewTemplate() {
    editingTemplate = { ...EMPTY_TEMPLATE, id: '', brand: '', createdAt: new Date() } as StepTemplate;
    editFields = { stepName: '', systemPrompt: '', userPromptTpl: '', keywords: '' };
  }

  async function saveTemplate() {
    if (!editingTemplate) return;
    const isNew = editingTemplate.id === '';
    const payload = {
      stepNumber: editingTemplate.stepNumber,
      stepName: editFields.stepName,
      phase: editingTemplate.phase,
      systemPrompt: editFields.systemPrompt,
      userPromptTpl: editFields.userPromptTpl,
      inputSchema: editingTemplate.inputSchema,
      keywords: editFields.keywords.split(',').map(s => s.trim()).filter(Boolean),
      isActive: true,
      sortOrder: editingTemplate.sortOrder,
    };
    if (isNew) {
      await fetch('/api/admin/coaching/step-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/admin/coaching/step-templates/${editingTemplate.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    }
    templates = (await (await fetch('/api/admin/coaching/step-templates')).json()).templates;
    editingTemplate = null;
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Template wirklich löschen?')) return;
    const res = await fetch(`/api/admin/coaching/step-templates/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }
    templates = templates.filter(t => t.id !== id);
  }
</script>

<div class="settings">
  <div class="tabs">
    <button class="tab {activeTab === 'ki' ? 'active' : ''}" onclick={() => activeTab = 'ki'}>KI-Provider</button>
    <button class="tab {activeTab === 'templates' ? 'active' : ''}" onclick={() => activeTab = 'templates'}>Prompt-Templates</button>
  </div>

  {#if activeTab === 'ki'}
    {#if editingProvider}
      <div class="edit-panel">
        <div class="edit-panel-header">
          <div class="edit-title">
            <span class="provider-badge {isCustom(editingProvider) ? 'custom' : editingProvider.provider}">{providerBadgeLabel(editingProvider)}</span>
            <span>{editingProvider.displayName}</span>
          </div>
          <button class="btn-sm" onclick={() => editingProvider = null}>✕ Schließen</button>
        </div>

        <div class="edit-tabs">
          <button class="edit-tab {providerEditTab === 'connection' ? 'active' : ''}" onclick={() => providerEditTab = 'connection'}>Verbindung</button>
          <button class="edit-tab {providerEditTab === 'behavior' ? 'active' : ''}" onclick={() => providerEditTab = 'behavior'}>Verhalten</button>
        </div>

        {#if providerEditTab === 'connection'}
          <div class="edit-section">
            <label class="field-label">Name / Label
              <input type="text" bind:value={providerFields.displayName} />
            </label>
            {#if editingProvider.provider === 'lumo'}
              <div class="lumo-info">
                <strong>Lumo (Proton)</strong> hat derzeit keine öffentliche API — das Profil dient als Platzhalter.
              </div>
              <label class="checkbox-label">
                <input type="checkbox" bind:checked={providerFields.euEndpoint} />
                EU-Endpunkt verwenden (DSGVO)
              </label>
            {:else}
              {#if showField(editingProvider, 'modelName')}
                <label class="field-label">Modell
                  <input type="text" bind:value={providerFields.modelName} placeholder="leer = Standardmodell" />
                </label>
              {/if}
              {#if showField(editingProvider, 'apiKey')}
                <label class="field-label">API-Key
                  <div class="api-key-row">
                    {#if showApiKey}
                      <input type="text" bind:value={providerFields.apiKey} placeholder="sk-..." class="api-key-input" />
                    {:else}
                      <input type="password" bind:value={providerFields.apiKey} placeholder="sk-..." class="api-key-input" />
                    {/if}
                    <button class="btn-icon" onclick={() => showApiKey = !showApiKey}>{showApiKey ? '🙈' : '👁'}</button>
                  </div>
                </label>
              {/if}
              {#if showField(editingProvider, 'apiEndpoint')}
                <label class="field-label">API-Endpunkt (optional)
                  <input type="url" bind:value={providerFields.apiEndpoint} placeholder="https://api.example.com/v1" />
                </label>
              {/if}
              {#if showField(editingProvider, 'organizationId')}
                <label class="field-label">Organization ID (optional)
                  <input type="text" bind:value={providerFields.organizationId} placeholder="org-..." />
                </label>
              {/if}
              {#if showField(editingProvider, 'euEndpoint')}
                <label class="checkbox-label">
                  <input type="checkbox" bind:checked={providerFields.euEndpoint} />
                  EU-Endpunkt verwenden
                </label>
              {/if}
            {/if}
          </div>
        {:else}
          <div class="edit-section">
            {#if editingProvider.provider === 'lumo'}
              <p class="lumo-info">Lumo unterstützt derzeit keine konfigurierbaren Verhaltenparameter.</p>
            {:else}
              <div class="field-row">
                {#if showField(editingProvider, 'temperature')}
                  <label class="field-label">Temperature (0.0–2.0)
                    <input type="number" step="0.01" min="0" max="2" bind:value={providerFields.temperature} placeholder="leer = Standard" />
                  </label>
                {/if}
                {#if showField(editingProvider, 'maxTokens')}
                  <label class="field-label">Max Tokens
                    <input type="number" min="1" bind:value={providerFields.maxTokens} placeholder="leer = Standard" />
                  </label>
                {/if}
                {#if showField(editingProvider, 'topP')}
                  <label class="field-label">top_p
                    <input type="number" step="0.01" min="0" max="1" bind:value={providerFields.topP} placeholder="leer = Standard" />
                  </label>
                {/if}
              </div>
              {#if showField(editingProvider, 'topK')}
                <div class="field-row">
                  <label class="field-label">top_k
                    <input type="number" min="1" bind:value={providerFields.topK} placeholder="leer = Standard" />
                  </label>
                </div>
              {/if}
              {#if showField(editingProvider, 'thinkingMode')}
                <label class="checkbox-label">
                  <input type="checkbox" bind:checked={providerFields.thinkingMode} />
                  Extended Thinking aktivieren (Claude)
                </label>
              {/if}
              {#if showField(editingProvider, 'presencePenalty')}
                <div class="field-row">
                  <label class="field-label">Presence Penalty (–2 bis 2)
                    <input type="number" step="0.01" min="-2" max="2" bind:value={providerFields.presencePenalty} placeholder="leer = Standard" />
                  </label>
                  <label class="field-label">Frequency Penalty (–2 bis 2)
                    <input type="number" step="0.01" min="-2" max="2" bind:value={providerFields.frequencyPenalty} placeholder="leer = Standard" />
                  </label>
                </div>
              {/if}
              {#if showField(editingProvider, 'safePrompt')}
                <label class="checkbox-label">
                  <input type="checkbox" bind:checked={providerFields.safePrompt} />
                  Safe Prompt aktivieren (Mistral)
                </label>
              {/if}
              {#if showField(editingProvider, 'randomSeed')}
                <label class="field-label">Random Seed (leer = zufällig)
                  <input type="number" bind:value={providerFields.randomSeed} placeholder="z.B. 42" />
                </label>
              {/if}
              {#if showField(editingProvider, 'systemPrompt')}
                <label class="field-label">System-Prompt
                  <textarea rows="5" bind:value={providerFields.systemPrompt} placeholder="Optionaler System-Prompt…"></textarea>
                </label>
              {/if}
            {/if}
            {#if showField(editingProvider, 'notes')}
              <label class="field-label">Notiz / Freitext
                <textarea rows="2" bind:value={providerFields.notes} placeholder="Interne Beschreibung…"></textarea>
              </label>
            {/if}
          </div>
        {/if}

        <div class="edit-actions">
          <button class="btn-primary" onclick={saveProviderEdit} disabled={savingProviderEdit}>
            {savingProviderEdit ? 'Speichern…' : 'Speichern'}
          </button>
          <button class="btn-sm" onclick={() => editingProvider = null}>Abbrechen</button>
        </div>
      </div>

    {:else if creatingProvider}
      <div class="edit-panel">
        <div class="edit-panel-header">
          <div class="edit-title">Neuer KI-Anbieter</div>
          <button class="btn-sm" onclick={() => creatingProvider = false}>✕ Schließen</button>
        </div>
        <div class="edit-section">
          <label class="field-label">Name / Label
            <input type="text" bind:value={newProviderForm.displayName} placeholder="z.B. Mein eigener GPT" />
          </label>
          <label class="field-label">Interner Slug (nur a–z, 0–9, Bindestrich — wird zu <code>custom_&lt;slug&gt;</code>)
            <input type="text" bind:value={newProviderForm.slug} placeholder="z.B. mein-gpt" />
          </label>
          <div class="field-label">Verfügbare Felder auswählen
            <div class="fields-grid">
              {#each ALL_FIELDS as f}
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newProviderForm.enabledFields.includes(f.key)}
                    onchange={() => toggleNewField(f.key)}
                  />
                  {f.label}
                </label>
              {/each}
            </div>
          </div>
        </div>
        <div class="edit-actions">
          <button class="btn-primary" onclick={saveNewProvider} disabled={savingNewProvider}>
            {savingNewProvider ? 'Anlegen…' : 'Anbieter anlegen'}
          </button>
          <button class="btn-sm" onclick={() => creatingProvider = false}>Abbrechen</button>
        </div>
      </div>

    {:else}
      <div class="ki-grid-header">
        <button class="btn-primary" onclick={() => creatingProvider = true}>+ Neuer KI-Anbieter</button>
      </div>
      <div class="ki-grid">
        {#each providers as p}
          <div class="provider-card {p.isActive ? 'active' : ''}">
            <div class="card-head">
              <span class="provider-badge {isCustom(p) ? 'custom' : p.provider}">{providerBadgeLabel(p)}</span>
              {#if p.isActive}<span class="active-badge">● Aktiv</span>{/if}
            </div>
            <div class="provider-name">{p.displayName}</div>
            <div class="provider-model">{p.modelName ?? 'kein Modell'}</div>
            {#if p.apiKey}
              <div class="provider-key">API-Key gesetzt ✓</div>
            {:else if p.provider !== 'lumo'}
              <div class="provider-key warn">kein API-Key</div>
            {/if}
            <div class="provider-actions">
              {#if !p.isActive}
                <button class="btn-activate" onclick={() => activateProvider(p.provider)} disabled={savingProvider === p.provider}>
                  {savingProvider === p.provider ? '…' : 'Aktivieren'}
                </button>
              {/if}
              <button class="btn-sm" onclick={() => startEditProvider(p)}>Bearbeiten</button>
              {#if isCustom(p)}
                <button class="btn-sm btn-danger" onclick={() => deleteProvider(p)}>🗑</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

  {:else}
    <div class="templates-list">
      {#if editingTemplate}
        <div class="edit-modal">
          <h3>{editingTemplate.id === '' ? 'Neues Template' : `Schritt ${editingTemplate.stepNumber}: bearbeiten`}</h3>
          <label>Schritt-Nr.
            <input type="number" min="1" bind:value={editingTemplate.stepNumber} />
          </label>
          <label>Phase
            <select bind:value={editingTemplate.phase}>
              <option value="problem_ziel">Problem & Ziel</option>
              <option value="analyse">Analyse</option>
              <option value="ressourcen">Ressourcen</option>
              <option value="loesungsweg">Lösungsweg</option>
              <option value="abschluss">Abschluss</option>
            </select>
          </label>
          <label>Name
            <input type="text" bind:value={editFields.stepName} />
          </label>
          <label>System-Prompt
            <textarea rows="4" bind:value={editFields.systemPrompt}></textarea>
          </label>
          <label>Prompt-Template (Platzhalter: &#123;feldname&#125;)
            <textarea rows="5" bind:value={editFields.userPromptTpl}></textarea>
          </label>
          <label>Schlagwörter (kommagetrennt)
            <input type="text" bind:value={editFields.keywords} />
          </label>
          <div class="edit-actions">
            <button class="btn-primary" onclick={saveTemplate}>Speichern</button>
            <button class="btn-sm" onclick={() => editingTemplate = null}>Abbrechen</button>
          </div>
        </div>
      {:else}
        <div class="templates-header">
          <button class="btn-primary" onclick={startNewTemplate}>+ Neues Template</button>
        </div>
        <table class="table">
          <thead><tr><th>#</th><th>Name</th><th>Phase</th><th>Schlagwörter</th><th></th></tr></thead>
          <tbody>
            {#each templates as t (t.id)}
              <tr>
                <td>{t.stepNumber}</td>
                <td>{t.stepName}</td>
                <td>{t.phase}</td>
                <td>{t.keywords.join(', ') || '—'}</td>
                <td>
                  <button class="btn-sm" onclick={() => startEdit(t)}>✏️ Bearbeiten</button>
                  <button class="btn-sm btn-danger" onclick={() => deleteTemplate(t.id)}>🗑</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</div>

<style>
  .settings { max-width: 960px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--line,#333); }
  .tab { padding: 0.5rem 1rem; background: none; border: none; color: var(--text-muted,#888); cursor: pointer; font-size: 0.9rem; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab.active { color: var(--gold,#c9a55c); border-bottom-color: var(--gold,#c9a55c); }

  .ki-grid-header { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
  .ki-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
  .provider-card { padding: 1.2rem; border: 1px solid var(--line,#333); border-radius: 8px; background: var(--bg-2,#1a1a1a); display: flex; flex-direction: column; gap: 0.4rem; }
  .provider-card.active { border-color: var(--gold,#c9a55c); }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .provider-name { font-weight: 700; color: var(--text-light,#f0f0f0); margin-top: 0.2rem; }
  .provider-model { font-size: 0.78rem; color: var(--text-muted,#888); }
  .provider-key { font-size: 0.72rem; color: #4ade80; font-family: monospace; }
  .provider-key.warn { color: #f97316; }
  .active-badge { color: var(--gold,#c9a55c); font-size: 0.78rem; font-weight: 600; white-space: nowrap; }
  .provider-actions { display: flex; gap: 0.4rem; align-items: center; margin-top: 0.5rem; flex-wrap: wrap; }
  .btn-activate { padding: 0.4rem 0.8rem; background: var(--gold,#c9a55c); color: #111; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.82rem; }
  .btn-activate:disabled { opacity: 0.5; cursor: not-allowed; }

  .provider-badge { font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 99px; letter-spacing: 0.03em; }
  .provider-badge.claude  { background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed44; }
  .provider-badge.openai  { background: #16a34a22; color: #4ade80; border: 1px solid #16a34a44; }
  .provider-badge.mistral { background: #ea580c22; color: #fb923c; border: 1px solid #ea580c44; }
  .provider-badge.lumo    { background: #0891b222; color: #38bdf8; border: 1px solid #0891b244; }
  .provider-badge.custom  { background: #52525b22; color: #a1a1aa; border: 1px solid #52525b44; }

  .edit-panel { border: 1px solid var(--gold,#c9a55c); border-radius: 10px; background: var(--bg-2,#1a1a1a); padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
  .edit-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .edit-title { display: flex; align-items: center; gap: 0.75rem; font-weight: 700; color: var(--text-light,#f0f0f0); }
  .edit-tabs { display: flex; gap: 0.5rem; border-bottom: 1px solid var(--line,#333); }
  .edit-tab { padding: 0.4rem 1rem; background: none; border: none; color: var(--text-muted,#888); cursor: pointer; font-size: 0.85rem; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .edit-tab.active { color: var(--gold,#c9a55c); border-bottom-color: var(--gold,#c9a55c); }
  .edit-section { display: flex; flex-direction: column; gap: 0.9rem; padding-top: 0.5rem; }
  .field-label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.8rem; color: var(--text-muted,#888); }
  .field-label input, .field-label textarea, .field-label select {
    padding: 0.45rem 0.7rem; background: var(--bg-dark,#111); border: 1px solid var(--line,#333);
    border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.88rem; outline: none; resize: vertical;
  }
  .field-label textarea { min-height: 80px; }
  .field-row { display: flex; gap: 1rem; flex-wrap: wrap; }
  .field-row .field-label { flex: 1; min-width: 120px; }
  .checkbox-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-muted,#888); cursor: pointer; }
  .checkbox-label input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--gold,#c9a55c); cursor: pointer; }
  .api-key-row { display: flex; gap: 0.4rem; align-items: center; }
  .api-key-input { flex: 1; }
  .btn-icon { padding: 0.4rem 0.6rem; background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 6px; cursor: pointer; font-size: 0.9rem; }
  .lumo-info { background: #0891b211; border: 1px solid #0891b244; border-radius: 8px; padding: 0.9rem 1rem; color: #38bdf8; font-size: 0.85rem; line-height: 1.5; }
  .fields-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.4rem 1rem; margin-top: 0.4rem; }
  code { font-family: monospace; background: var(--bg-dark,#111); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85em; }

  .edit-actions { display: flex; gap: 0.5rem; }
  .btn-sm { padding: 0.3rem 0.7rem; border: 1px solid var(--line,#444); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted,#888); background: none; cursor: pointer; }
  .btn-danger { border-color: #ef4444; color: #ef4444; }
  .btn-primary { padding: 0.5rem 1.2rem; background: var(--gold,#c9a55c); color: #111; border: none; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.85rem; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .table { width: 100%; border-collapse: collapse; }
  .table th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line,#333); font-size: 0.82rem; color: var(--text-muted,#888); }
  .table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line,#222); font-size: 0.88rem; }
  .templates-header { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
  .edit-modal { background: var(--bg-2,#1a1a1a); border: 1px solid var(--gold,#c9a55c); border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
  .edit-modal label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem; color: var(--text-muted,#888); }
  .edit-modal input, .edit-modal textarea { padding: 0.5rem 0.75rem; background: var(--bg-dark,#111); border: 1px solid var(--line,#333); border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.88rem; outline: none; resize: vertical; }
  .edit-modal select { padding: 0.5rem 0.75rem; background: var(--bg-dark,#111); border: 1px solid var(--line,#333); border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.88rem; }
</style>
