<script lang="ts">
  import { onMount } from 'svelte';

  interface ModelSlot {
    phase: string;
    provider: string;
    modelId: string;
    baseUrl: string | null;
  }

  interface CatalogItem {
    provider: string;
    modelId: string;
  }

  const PHASES = ['scout', 'plan', 'implement', 'verify', 'deploy'] as const;

  let slots = $state<ModelSlot[]>([]);
  let catalog = $state<CatalogItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let savingPhase = $state<string | null>(null);

  async function loadData() {
    try {
      loading = true;
      const res = await fetch('/api/factory-model-slots');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      slots = data.slots;
      catalog = data.catalog;
      error = null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load model slots';
    } finally {
      loading = false;
    }
  }

  async function updateSlot(phase: string, provider: string, modelId: string, baseUrl: string | null) {
    savingPhase = phase;
    const prevSlots = [...slots];
    const idx = slots.findIndex(s => s.phase === phase);
    const updatedSlot = { phase, provider, modelId, baseUrl };
    if (idx >= 0) {
      slots[idx] = updatedSlot;
    } else {
      slots.push(updatedSlot);
    }

    try {
      const res = await fetch('/api/factory-model-slots', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase, provider, modelId, baseUrl }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      slots = await res.json();
      error = null;
    } catch (err) {
      slots = prevSlots;
      error = err instanceof Error ? err.message : 'Update failed';
    } finally {
      savingPhase = null;
    }
  }

  function handleSelectChange(phase: string, event: Event) {
    const target = event.target as HTMLSelectElement;
    const value = target.value;
    if (!value) return;
    const [provider, modelId] = value.split('|');
    const existing = slots.find(s => s.phase === phase);
    updateSlot(phase, provider, modelId, existing?.baseUrl ?? null);
  }

  function handleBaseUrlChange(phase: string, event: Event) {
    const target = event.target as HTMLInputElement;
    const baseUrl = target.value.trim() || null;
    const existing = slots.find(s => s.phase === phase);
    if (existing) {
      if (existing.baseUrl === baseUrl) return;
      updateSlot(phase, existing.provider, existing.modelId, baseUrl);
    }
  }

  onMount(() => {
    loadData();
  });
</script>

<div class="factory-model-slots">
  <div class="slots-header">
    <h3>Modell-Slots per Phase</h3>
    <span class="slots-subtitle">Weise den einzelnen Phasen der Software Factory dedizierte LLM-Modelle zu.</span>
  </div>

  {#if loading}
    <div class="slots-loading">Modell-Slots werden geladen...</div>
  {:else if error && slots.length === 0}
    <div class="slots-error">
      <p>{error}</p>
      <button onclick={loadData} class="ff-pill ff-pill--ghost">Erneut versuchen</button>
    </div>
  {:else}
    <div class="slots-grid">
      {#each PHASES as phase}
        {@const current = slots.find(s => s.phase === phase)}
        {@const selectedValue = current ? `${current.provider}|${current.modelId}` : ''}
        <div class="slots-row" class:is-saving={savingPhase === phase}>
          <div class="phase-col">
            <span class="phase-name">{phase}</span>
          </div>

          <div class="select-col">
            <select
              value={selectedValue}
              onchange={(e) => handleSelectChange(phase, e)}
              class="slot-select"
            >
              <option value="">-- Standard (Provider Config) --</option>
              {#each catalog as item}
                <option value="{item.provider}|{item.modelId}">
                  {item.provider} / {item.modelId}
                </option>
              {/each}
            </select>
          </div>

          <div class="url-col">
            <input
              type="text"
              placeholder="Alternative Base URL (optional)"
              value={current?.baseUrl ?? ''}
              onchange={(e) => handleBaseUrlChange(phase, e)}
              class="slot-url-input"
              disabled={!current}
            />
          </div>

          {#if savingPhase === phase}
            <div class="saving-indicator">Speichern...</div>
          {/if}
        </div>
      {/each}
    </div>

    {#if error}
      <div class="slots-toast-error">
        Fehler: {error}
      </div>
    {/if}
  {/if}
</div>

<style>
  .factory-model-slots {
    background: var(--ink-850);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .slots-header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .slots-header h3 {
    margin: 0;
    font-family: var(--sans);
    font-size: 16px;
    font-weight: 600;
    color: var(--fg);
  }

  .slots-subtitle {
    font-size: 12px;
    color: var(--mute);
    font-family: var(--sans);
  }

  .slots-loading,
  .slots-error {
    padding: 2rem;
    text-align: center;
    font-family: var(--mono);
    color: var(--fg-soft);
    font-size: 13px;
  }

  .slots-error p {
    color: var(--danger);
    margin: 0 0 1rem;
  }

  .slots-grid {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--ink-900);
    overflow: hidden;
  }

  .slots-row {
    display: grid;
    grid-template-columns: 140px 1fr 1fr;
    align-items: center;
    padding: 0.875rem 1.25rem;
    border-bottom: 1px solid var(--line);
    gap: 1rem;
    position: relative;
    transition: background var(--dur-base) var(--ease-soft);
  }

  .slots-row:last-child {
    border-bottom: none;
  }

  .slots-row:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .slots-row.is-saving {
    opacity: 0.7;
  }

  .phase-col {
    display: flex;
    align-items: center;
  }

  .phase-name {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--brass);
    background: rgba(215, 178, 86, 0.1);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .slot-select,
  .slot-url-input {
    width: 100%;
    background: var(--ink-800);
    border: 1px solid var(--line-2);
    border-radius: var(--radius-sm);
    color: var(--fg);
    font-family: var(--sans);
    font-size: 13px;
    padding: 6px 10px;
    outline: none;
    transition: border-color var(--dur-base);
  }

  .slot-select:focus,
  .slot-url-input:focus {
    border-color: var(--brass);
  }

  .slot-url-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--ink-850);
  }

  .saving-indicator {
    position: absolute;
    right: 1.25rem;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--brass);
  }

  .slots-toast-error {
    padding: 0.75rem 1rem;
    background: rgba(215, 122, 110, 0.15);
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: var(--radius-md);
    font-family: var(--mono);
    font-size: 12px;
  }
</style>
