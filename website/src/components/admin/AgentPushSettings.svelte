<!-- website/src/components/admin/AgentPushSettings.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  let settings = $state({ opencode: false, agy: false });
  let loading = $state(true);
  let error = $state('');
  let toast = $state('');

  async function loadSettings() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/admin/agent-push/settings');
      if (!res.ok) throw new Error(`Laden fehlgeschlagen: ${res.status}`);
      settings = await res.json();
    } catch (err: any) {
      error = err.message || 'Fehler beim Laden';
    } finally {
      loading = false;
    }
  }

  async function toggleSetting(source: 'opencode' | 'agy') {
    const nextVal = !settings[source];
    try {
      const res = await fetch('/api/admin/agent-push/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, enabled: nextVal }),
      });
      if (!res.ok) throw new Error(`Aktualisierung fehlgeschlagen: ${res.status}`);
      settings = await res.json();
      showToast(`${source === 'opencode' ? 'opencode' : 'agy'} push notification updated.`);
    } catch (err: any) {
      error = err.message || 'Fehler beim Speichern';
    }
  }

  function showToast(msg: string) {
    toast = msg;
    setTimeout(() => {
      if (toast === msg) toast = '';
    }, 3000);
  }

  onMount(() => {
    loadSettings();
  });
</script>

<div class="settings-card">
  <h2>Push-Benachrichtigungen (ntfy)</h2>
  <p class="description">
    Erhalte Echtzeit-Updates auf dein Smartphone bei opencode- oder agy-Session-Events.
  </p>

  {#if loading}
    <div class="loading">Lade Einstellungen...</div>
  {:else if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if !loading}
    <div class="settings-list">
      <div class="setting-item">
        <div class="info">
          <span class="label">opencode-Sessions</span>
          <span class="detail">Session gestartet, abgeschlossen, fehlgeschlagen oder PR-Events</span>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            checked={settings.opencode}
            onchange={() => toggleSetting('opencode')}
          />
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="info">
          <span class="label">agy-Tasks</span>
          <span class="detail">Task zugewiesen, abgeschlossen, blockiert oder fehlgeschlagen</span>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            checked={settings.agy}
            onchange={() => toggleSetting('agy')}
          />
          <span class="slider"></span>
        </label>
      </div>
    </div>
  {/if}

  {#if toast}
    <div class="toast">{toast}</div>
  {/if}
</div>

<style>
  .settings-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    padding: 1.5rem;
    max-width: 32rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    position: relative;
  }
  h2 {
    margin-top: 0;
    font-size: 1.25rem;
    color: var(--text-primary, #111827);
  }
  .description {
    font-size: 0.875rem;
    color: var(--text-secondary, #4b5563);
    margin-bottom: 1.5rem;
  }
  .loading {
    color: var(--text-secondary, #4b5563);
    font-size: 0.875rem;
  }
  .error-banner {
    background: #fee2e2;
    color: #991b1b;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }
  .settings-list {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border-color, #f3f4f6);
  }
  .setting-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .label {
    font-weight: 500;
    color: var(--text-primary, #111827);
  }
  .detail {
    font-size: 0.75rem;
    color: var(--text-secondary, #6b7280);
  }
  
  /* Toggle Switch styling */
  .switch {
    position: relative;
    display: inline-block;
    width: 2.75rem;
    height: 1.5rem;
  }
  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: .4s;
    border-radius: 34px;
  }
  .slider:before {
    position: absolute;
    content: "";
    height: 1.125rem;
    width: 1.125rem;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .4s;
    border-radius: 50%;
  }
  input:checked + .slider {
    background-color: #2563eb;
  }
  input:checked + .slider:before {
    transform: translateX(1.25rem);
  }
  .toast {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    background: #10b981;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.15);
  }
</style>
