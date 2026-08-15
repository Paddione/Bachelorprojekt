<script lang="ts">
  import { onDestroy } from 'svelte';

  const WARN_BEFORE_MS = 10 * 60 * 1000; // show warning 10 min before expiry
  const CHECK_INTERVAL_MS = 60 * 1000;   // check every minute

  let showWarning = $state(false);
  let minutesLeft = $state(0);

  async function checkExpiry() {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) return;
      const data = await res.json() as { authenticated: boolean; expiresAt?: number };
      if (!data.authenticated || !data.expiresAt) return;

      const msLeft = data.expiresAt - Date.now();
      if (msLeft > 0 && msLeft <= WARN_BEFORE_MS) {
        minutesLeft = Math.ceil(msLeft / 60_000);
        showWarning = true;
      } else {
        showWarning = false;
      }
    } catch {
      // network error — don't show warning
    }
  }

  checkExpiry();
  const interval = setInterval(checkExpiry, CHECK_INTERVAL_MS);
  onDestroy(() => clearInterval(interval));
</script>

{#if showWarning}
  <div class="session-warning" role="alert">
    <span>⚠ Sitzung läuft in {minutesLeft} Min. ab.</span>
    <a href="/api/auth/login">Jetzt verlängern</a>
    <button onclick={() => showWarning = false} aria-label="Schließen">✕</button>
  </div>
{/if}

<style>
  .session-warning {
    position: fixed;
    bottom: 80px;
    right: 24px;
    z-index: 8999;
    background: #92400e;
    color: #fef3c7;
    border: 1px solid #d97706;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,.4);
  }
  .session-warning a {
    color: #fcd34d;
    text-decoration: underline;
    white-space: nowrap;
  }
  .session-warning button {
    background: transparent;
    border: none;
    color: #fef3c7;
    cursor: pointer;
    font-size: 13px;
    padding: 0;
    line-height: 1;
  }
</style>
