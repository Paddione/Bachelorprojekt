<script lang="ts">
  import { onMount } from 'svelte';
  import {
    loadPresets,
    savePreset,
    deletePreset,
    buildShareUrl,
    isLocalStorageAvailable,
    quotaEvictedFlag,
    type CockpitFilterState,
    type Preset
  } from '../../../lib/cockpit-presets';

  // Props using Svelte 5 runes
  let {
    currentFilter,
    onApplyPreset
  }: {
    currentFilter: CockpitFilterState;
    onApplyPreset: (state: CockpitFilterState) => void;
  } = $props();

  let presets = $state<Preset[]>([]);
  let dropdownOpen = $state(false);
  let showSaveDialog = $state(false);
  let newPresetName = $state('');
  let toastMsg = $state('');
  let isPrivate = $state(false);

  function refreshPresets() {
    presets = loadPresets();
  }

  onMount(() => {
    refreshPresets();
    isPrivate = !isLocalStorageAvailable();
    if (quotaEvictedFlag) {
      showToast('Älteste Presets wurden entfernt (Speicher voll)');
    }
  });

  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
  }

  function handleApply(preset: Preset) {
    onApplyPreset(preset.state);
    dropdownOpen = false;
  }

  function handleSave() {
    if (!newPresetName.trim()) return;
    savePreset(newPresetName.trim(), currentFilter);
    newPresetName = '';
    showSaveDialog = false;
    refreshPresets();
    showToast('Preset gespeichert');
  }

  function handleDelete(id: string) {
    deletePreset(id);
    refreshPresets();
    showToast('Preset gelöscht');
  }

  async function handleCopyUrl() {
    const url = buildShareUrl(currentFilter, window.location.origin);
    try {
      await navigator.clipboard.writeText(url);
      showToast('URL kopiert');
    } catch {
      showToast('Kopieren fehlgeschlagen');
    }
  }

  function showToast(msg: string) {
    toastMsg = msg;
    setTimeout(() => {
      if (toastMsg === msg) {
        toastMsg = '';
      }
    }, 2000);
  }
</script>

<div class="filter-bar">
  <div class="presets-dropdown-container">
    <button
      class="btn"
      data-testid="presets-toggle"
      onclick={toggleDropdown}
      aria-haspopup="listbox"
      aria-expanded={dropdownOpen}
    >
      📂 Preset laden
    </button>
    
    {#if dropdownOpen}
      <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
      <div class="presets-menu" role="listbox">
        {#each presets as p (p.id)}
          <div class="preset-item" data-testid="preset-item" role="option" aria-selected="false">
            <button class="apply-btn" onclick={() => handleApply(p)}>
              {p.name}
            </button>
            {#if p.isDefault}
              <span class="lock-icon" title="Standard-Preset" aria-label="Standard-Preset">🔒</span>
            {:else}
              <button
                class="delete-btn"
                onclick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                title="Preset löschen"
                aria-label="Preset löschen"
              >
                🗑️
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <button class="btn" onclick={() => (showSaveDialog = true)}>
    💾 Als Preset speichern
  </button>

  <button class="btn" onclick={handleCopyUrl}>
    🔗 URL kopieren
  </button>

  {#if toastMsg}
    <div class="toast" data-testid="preset-toast">
      {toastMsg}
    </div>
  {/if}
</div>

{#if isPrivate}
  <div class="private-banner" data-testid="private-banner">
    ⚠️ Presets nur für diese Session (Private/Incognito-Modus)
  </div>
{/if}

{#if showSaveDialog}
  <div class="modal-overlay" onclick={() => (showSaveDialog = false)} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal-card" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Als Preset speichern" tabindex="-1">
      <h3>Als Preset speichern</h3>
      <input
        type="text"
        bind:value={newPresetName}
        placeholder="Name des Presets..."
        aria-label="Name des Presets"
        onkeydown={(e) => e.key === 'Enter' && handleSave()}
      />
      <div class="modal-buttons">
        <button class="modal-btn save" onclick={handleSave}>Speichern</button>
        <button class="modal-btn cancel" onclick={() => (showSaveDialog = false)}>Abbrechen</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .filter-bar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    position: relative;
    padding: 0.25rem 0;
  }

  .presets-dropdown-container {
    position: relative;
    display: inline-block;
  }

  .btn {
    background: #21262d;
    color: #c9d1d9;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-size: 0.85rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-weight: 500;
    transition: background-color 0.2s, border-color 0.2s;
  }

  .btn:hover {
    background: #30363d;
    border-color: #8b949e;
  }

  .presets-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 0.25rem;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 100;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    padding: 0.25rem 0;
  }

  .preset-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.35rem 0.75rem;
    gap: 0.5rem;
    transition: background-color 0.2s;
  }

  .preset-item:hover {
    background: #21262d;
  }

  .apply-btn {
    background: none;
    border: none;
    color: #c9d1d9;
    font-size: 0.85rem;
    cursor: pointer;
    text-align: left;
    flex-grow: 1;
    padding: 0;
  }

  .apply-btn:hover {
    color: #58a6ff;
  }

  .lock-icon {
    font-size: 0.75rem;
    opacity: 0.6;
    padding: 0 0.2rem;
  }

  .delete-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
    opacity: 0.7;
    transition: opacity 0.2s;
    padding: 0 0.2rem;
  }

  .delete-btn:hover {
    opacity: 1;
  }

  .toast {
    position: absolute;
    left: 50%;
    bottom: -2.5rem;
    transform: translateX(-50%);
    background: #238636;
    color: #ffffff;
    padding: 0.3rem 0.8rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10;
  }

  /* Modal styling */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(2px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 200;
  }

  .modal-card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.5rem;
    width: 90%;
    max-width: 380px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-card h3 {
    margin: 0;
    color: #f0f6fc;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .modal-card input {
    background: #0d1117;
    border: 1px solid #30363d;
    color: #c9d1d9;
    border-radius: 6px;
    padding: 0.5rem;
    font-size: 0.9rem;
    outline: none;
    width: 100%;
  }

  .modal-card input:focus {
    border-color: #58a6ff;
  }

  .modal-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .modal-btn {
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .modal-btn.save {
    background: #238636;
    color: #ffffff;
  }

  .modal-btn.save:hover {
    background: #2ea043;
  }

  .modal-btn.cancel {
    background: #21262d;
    border-color: #30363d;
    color: #c9d1d9;
  }

  .modal-btn.cancel:hover {
    background: #30363d;
  }

  .private-banner {
    width: 100%;
    background: #d29922;
    color: #0d1117;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
  }
</style>
