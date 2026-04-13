<script lang="ts">
  import { onMount } from 'svelte';

  const CONSENT_KEY = 'cookie_consent_v1';

  let visible = $state(false);
  let detailsOpen = $state(false);

  onMount(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      visible = true;
    }
  });

  function accept() {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    visible = false;
  }

  // Exported so the footer link can call it
  export function reopen() {
    localStorage.removeItem(CONSENT_KEY);
    visible = true;
  }
</script>

{#if visible}
  <div
    class="fixed bottom-0 left-0 right-0 z-50 border-t border-dark-lighter bg-dark-light shadow-lg"
    role="dialog"
    aria-label="Cookie-Einstellungen"
    aria-modal="false"
  >
    <div class="max-w-6xl mx-auto px-6 py-4">
      <!-- Main row -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-4">
        <div class="flex-1 text-sm text-muted">
          <span class="font-semibold text-gold">Cookies</span> — Diese Website verwendet ausschließlich technisch notwendige Cookies, die für den Betrieb der Website erforderlich sind.
        </div>
        <div class="flex flex-wrap gap-3 items-center shrink-0">
          <button
            onclick={() => (detailsOpen = !detailsOpen)}
            class="text-xs text-muted hover:text-gold transition-colors underline underline-offset-2"
          >
            {detailsOpen ? 'Details ausblenden' : 'Details anzeigen'}
          </button>
          <button
            onclick={accept}
            class="px-4 py-2 rounded text-sm font-semibold border border-gold text-gold hover:bg-gold hover:text-dark transition-colors"
          >
            Nur notwendige
          </button>
          <button
            onclick={accept}
            class="px-4 py-2 rounded text-sm font-semibold bg-gold text-dark hover:bg-gold-light transition-colors"
          >
            Alle akzeptieren
          </button>
        </div>
      </div>

      <!-- Detail panel -->
      {#if detailsOpen}
        <div class="mt-4 pt-4 border-t border-dark-lighter">
          <h3 class="text-sm font-semibold text-gold mb-3">Notwendige Cookies</h3>
          <p class="text-xs text-muted mb-3">
            Diese Cookies sind für die Grundfunktionen der Website zwingend erforderlich und können nicht deaktiviert werden.
          </p>
          <table class="w-full text-xs text-muted border-collapse">
            <thead>
              <tr class="border-b border-dark-lighter">
                <th class="text-left py-2 pr-4 font-semibold text-light">Name</th>
                <th class="text-left py-2 pr-4 font-semibold text-light">Zweck</th>
                <th class="text-left py-2 font-semibold text-light">Dauer</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b border-dark-lighter">
                <td class="py-2 pr-4 font-mono">session</td>
                <td class="py-2 pr-4">Authentifizierung / Login-Sitzung</td>
                <td class="py-2">Sitzung</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono">KEYCLOAK_*</td>
                <td class="py-2 pr-4">SSO-Session (Keycloak OIDC)</td>
                <td class="py-2">Sitzung</td>
              </tr>
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
{/if}
