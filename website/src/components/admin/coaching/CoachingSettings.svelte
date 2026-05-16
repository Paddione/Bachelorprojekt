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

  const ENV_KEY_MAP: Record<string, string> = {
    claude:  'ANTHROPIC_API_KEY',
    openai:  'OPENAI_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    lumo:    'LUMO_API_KEY',
  };

  // Task 3: Inline-Edit für KI-Provider
  let editingProvider = $state<KiConfig | null>(null);
  let providerFields = $state({ displayName: '', modelName: '' });
  let savingProviderEdit = $state(false);

  function startEditProvider(p: KiConfig) {
    editingProvider = p;
    providerFields = { displayName: p.displayName, modelName: p.modelName ?? '' };
  }

  async function saveProviderEdit() {
    if (!editingProvider) return;
    savingProviderEdit = true;
    await fetch(`/api/admin/coaching/ki-config/${editingProvider.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: providerFields.displayName,
        modelName: providerFields.modelName.trim() || null,
      }),
    });
    const res = await fetch('/api/admin/coaching/ki-config');
    const data = await res.json();
    providers = data.providers;
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
    const res = await fetch('/api/admin/coaching/ki-config');
    const data = await res.json();
    providers = data.providers;
    savingProvider = null;
  }

  function startEdit(t: StepTemplate) {
    editingTemplate = t;
    editFields = {
      stepName: t.stepName,
      systemPrompt: t.systemPrompt,
      userPromptTpl: t.userPromptTpl,
      keywords: t.keywords.join(', '),
    };
  }

  // Task 4: Neues Template anlegen
  const EMPTY_TEMPLATE: Omit<StepTemplate, 'id' | 'brand' | 'createdAt'> = {
    stepNumber: 1,
    stepName: '',
    phase: 'problem_ziel',
    systemPrompt: '',
    userPromptTpl: '',
    inputSchema: [],
    keywords: [],
    isActive: true,
    sortOrder: 0,
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/admin/coaching/step-templates/${editingTemplate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    const res = await fetch('/api/admin/coaching/step-templates');
    const data = await res.json();
    templates = data.templates;
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
  <!-- Tabs -->
  <div class="tabs">
    <button class="tab {activeTab === 'ki' ? 'active' : ''}" onclick={() => activeTab = 'ki'}>KI-Provider</button>
    <button class="tab {activeTab === 'templates' ? 'active' : ''}" onclick={() => activeTab = 'templates'}>Prompt-Templates</button>
  </div>

  {#if activeTab === 'ki'}
    <div class="ki-grid">
      {#each providers as p}
        <div class="provider-card {p.isActive ? 'active' : ''}">
          {#if editingProvider?.id === p.id}
            <label class="edit-label">Name
              <input type="text" bind:value={providerFields.displayName} />
            </label>
            <label class="edit-label">Modell (z.B. claude-sonnet-4-5)
              <input type="text" bind:value={providerFields.modelName} placeholder="leer = Standard" />
            </label>
            <div class="edit-actions">
              <button class="btn-activate" onclick={saveProviderEdit} disabled={savingProviderEdit}>
                {savingProviderEdit ? '…' : 'Speichern'}
              </button>
              <button class="btn-sm" onclick={() => editingProvider = null}>Abbrechen</button>
            </div>
          {:else}
            <div class="provider-name">{p.displayName}</div>
            <div class="provider-model">{p.modelName ?? 'kein Modell'}</div>
            <div class="provider-key">
              {ENV_KEY_MAP[p.provider] ? `${ENV_KEY_MAP[p.provider]}` : '—'}
            </div>
            <div class="provider-actions">
              {#if p.isActive}
                <span class="active-badge">● Aktiv</span>
              {:else}
                <button
                  class="btn-activate"
                  onclick={() => activateProvider(p.provider)}
                  disabled={savingProvider === p.provider}
                >
                  {savingProvider === p.provider ? '…' : 'Aktivieren'}
                </button>
              {/if}
              <button class="btn-sm" onclick={() => startEditProvider(p)}>✏️</button>
            </div>
          {/if}
        </div>
      {/each}
    </div>

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
  .settings { max-width: 900px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--line,#333); }
  .tab { padding: 0.5rem 1rem; background: none; border: none; color: var(--text-muted,#888); cursor: pointer; font-size: 0.9rem; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab.active { color: var(--gold,#c9a55c); border-bottom-color: var(--gold,#c9a55c); }
  .ki-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
  .provider-card { padding: 1.2rem; border: 1px solid var(--line,#333); border-radius: 8px; background: var(--bg-2,#1a1a1a); display: flex; flex-direction: column; gap: 0.4rem; }
  .provider-card.active { border-color: var(--gold,#c9a55c); }
  .provider-name { font-weight: 700; color: var(--text-light,#f0f0f0); }
  .provider-model { font-size: 0.78rem; color: var(--text-muted,#888); }
  .provider-key { font-size: 0.72rem; color: var(--text-muted,#666); font-family: monospace; }
  .active-badge { color: var(--gold,#c9a55c); font-size: 0.82rem; font-weight: 600; }
  .btn-activate { margin-top: 0.4rem; padding: 0.4rem 0.8rem; background: var(--gold,#c9a55c); color: #111; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.82rem; }
  .btn-activate:disabled { opacity: 0.5; cursor: not-allowed; }
  .provider-actions { display: flex; gap: 0.4rem; align-items: center; margin-top: 0.4rem; flex-wrap: wrap; }
  .edit-label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.78rem; color: var(--text-muted,#888); }
  .edit-label input { padding: 0.35rem 0.6rem; background: var(--bg-dark,#111); border: 1px solid var(--line,#333); border-radius: 4px; color: var(--text-light,#f0f0f0); font-size: 0.82rem; }
  .table { width: 100%; border-collapse: collapse; }
  .table th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line,#333); font-size: 0.82rem; color: var(--text-muted,#888); }
  .table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line,#222); font-size: 0.88rem; }
  .btn-sm { padding: 0.3rem 0.7rem; border: 1px solid var(--line,#444); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted,#888); background: none; cursor: pointer; }
  .btn-danger { border-color: #ef4444; color: #ef4444; }
  .btn-primary { padding: 0.5rem 1.2rem; background: var(--gold,#c9a55c); color: #111; border: none; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.85rem; }
  .edit-modal { background: var(--bg-2,#1a1a1a); border: 1px solid var(--gold,#c9a55c); border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
  .edit-modal label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem; color: var(--text-muted,#888); }
  .edit-modal input, .edit-modal textarea { padding: 0.5rem 0.75rem; background: var(--bg-dark,#111); border: 1px solid var(--line,#333); border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.88rem; outline: none; resize: vertical; }
  .edit-modal select { padding: 0.5rem 0.75rem; background: var(--bg-dark,#111); border: 1px solid var(--line,#333); border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.88rem; }
  .edit-actions { display: flex; gap: 0.5rem; }
  .templates-header { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
</style>
