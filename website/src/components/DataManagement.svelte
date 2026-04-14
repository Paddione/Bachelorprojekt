<script lang="ts">
  // Section 1: Cookie consent
  let cookieConsent = $state<string | null>(null);

  // Section 2: Auth state
  let authState = $state<{ authenticated: boolean; user?: { name: string; email: string; username: string; isAdmin: boolean } } | null>(null);

  // Section 3: DSGVO request form
  let requestType = $state<'auskunft' | 'loeschung' | null>(null);
  let requestName = $state('');
  let requestEmail = $state('');
  let requestStatus = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Delete account state (for logged-in users)
  let deleteConfirm = $state(false);
  let deleteStatus = $state<'idle' | 'deleting' | 'error'>('idle');

  $effect(() => {
    // Load cookie consent from localStorage
    try {
      cookieConsent = localStorage.getItem('cookie_consent_v1');
    } catch { cookieConsent = null; }

    // Load auth state
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => { authState = data; })
      .catch(() => { authState = { authenticated: false }; });
  });

  function reopenCookies() {
    window.dispatchEvent(new Event('cookie-consent-reopen'));
  }

  async function submitRequest() {
    if (!requestType || !requestName.trim() || !requestEmail.trim()) return;
    requestStatus = 'sending';
    try {
      const res = await fetch('/api/dsgvo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: requestType, name: requestName, email: requestEmail }),
      });
      requestStatus = res.ok ? 'sent' : 'error';
    } catch {
      requestStatus = 'error';
    }
  }

  async function deleteAccount() {
    deleteStatus = 'deleting';
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'POST' });
      if (res.ok) {
        window.location.href = '/?deleted=1';
      } else {
        deleteStatus = 'error';
      }
    } catch {
      deleteStatus = 'error';
    }
  }
</script>

<!-- Section 1: Cookie-Einstellungen -->
<div class="mb-8 p-6 bg-dark-light rounded-2xl border border-dark-lighter">
  <h2 class="text-xl font-semibold text-gold mb-3">Cookie-Einstellungen</h2>
  {#if cookieConsent}
    <p class="text-muted mb-4">Aktueller Status: <span class="text-light">{cookieConsent === 'all' ? 'Alle akzeptiert' : cookieConsent === 'essential' ? 'Nur notwendige' : cookieConsent}</span></p>
  {:else}
    <p class="text-muted mb-4">Keine Cookie-Einwilligung gefunden (nur technisch notwendige Cookies aktiv).</p>
  {/if}
  <button onclick={reopenCookies} class="px-4 py-2 bg-gold text-dark font-semibold rounded hover:bg-gold/90 transition-colors text-sm">
    Einstellungen ändern
  </button>
</div>

<!-- Section 2: Anmeldung / Session -->
<div class="mb-8 p-6 bg-dark-light rounded-2xl border border-dark-lighter">
  <h2 class="text-xl font-semibold text-gold mb-3">Anmeldung / Session</h2>
  {#if authState === null}
    <p class="text-muted">Wird geladen…</p>
  {:else if authState.authenticated && authState.user}
    <p class="text-muted mb-1">Angemeldet als: <span class="text-light">{authState.user.name}</span></p>
    <p class="text-muted mb-4">E-Mail: <span class="text-light">{authState.user.email}</span></p>
    <a href="/api/auth/logout" class="px-4 py-2 border border-dark-lighter text-muted hover:text-light hover:border-light rounded text-sm transition-colors">
      Ausloggen
    </a>
  {:else}
    <p class="text-muted mb-4">Kein Konto angemeldet.</p>
    <a href="/api/auth/login" class="px-4 py-2 bg-gold text-dark font-semibold rounded hover:bg-gold/90 transition-colors text-sm">
      Zum Login
    </a>
  {/if}
</div>

<!-- Section 3: Daten einsehen und löschen -->
<div class="p-6 bg-dark-light rounded-2xl border border-dark-lighter">
  <h2 class="text-xl font-semibold text-gold mb-3">Daten einsehen und löschen</h2>

  {#if authState?.authenticated}
    <!-- Logged-in: direct delete -->
    <div class="mb-6">
      <h3 class="text-light font-semibold mb-2">Konto löschen</h3>
      <p class="text-muted mb-3 text-sm">Löscht Ihr Konto dauerhaft. Dieser Vorgang kann nicht rückgängig gemacht werden.</p>
      {#if !deleteConfirm}
        <button onclick={() => deleteConfirm = true} class="px-4 py-2 border border-red-600 text-red-400 hover:bg-red-600 hover:text-white rounded text-sm transition-colors">
          Konto löschen
        </button>
      {:else}
        <p class="text-red-400 font-semibold mb-3">Sind Sie sicher? Dieser Vorgang kann nicht rückgängig gemacht werden.</p>
        <div class="flex gap-3">
          <button onclick={deleteAccount} disabled={deleteStatus === 'deleting'} class="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors disabled:opacity-50">
            {deleteStatus === 'deleting' ? 'Wird gelöscht…' : 'Ja, Konto löschen'}
          </button>
          <button onclick={() => { deleteConfirm = false; deleteStatus = 'idle'; }} class="px-4 py-2 border border-dark-lighter text-muted hover:text-light rounded text-sm transition-colors">
            Abbrechen
          </button>
        </div>
        {#if deleteStatus === 'error'}
          <p class="text-red-400 mt-2 text-sm">Fehler beim Löschen. Bitte versuchen Sie es erneut.</p>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- DSGVO request form (always shown) -->
  {#if requestStatus === 'sent'}
    <p class="text-green-400">Ihre Anfrage wurde übermittelt. Wir melden uns innerhalb von 30 Tagen.</p>
  {:else}
    <div>
      <h3 class="text-light font-semibold mb-3">Anfrage stellen</h3>
      <div class="flex gap-3 mb-4 flex-wrap">
        <button
          onclick={() => requestType = 'auskunft'}
          class={`px-4 py-2 rounded text-sm border transition-colors ${requestType === 'auskunft' ? 'bg-gold text-dark border-gold' : 'border-dark-lighter text-muted hover:text-light'}`}
        >
          Auskunft anfordern (Art. 15 DSGVO)
        </button>
        <button
          onclick={() => requestType = 'loeschung'}
          class={`px-4 py-2 rounded text-sm border transition-colors ${requestType === 'loeschung' ? 'bg-gold text-dark border-gold' : 'border-dark-lighter text-muted hover:text-light'}`}
        >
          Löschung beantragen (Art. 17 DSGVO)
        </button>
      </div>
      {#if requestType}
        <div class="space-y-3">
          <label for="req-name" class="sr-only">Ihr Name</label>
          <input
            id="req-name"
            type="text"
            placeholder="Ihr Name"
            bind:value={requestName}
            class="w-full px-4 py-2.5 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold/20 text-sm"
          />
          <label for="req-email" class="sr-only">Ihre E-Mail-Adresse</label>
          <input
            id="req-email"
            type="email"
            placeholder="Ihre E-Mail-Adresse"
            bind:value={requestEmail}
            class="w-full px-4 py-2.5 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold/20 text-sm"
          />
          <button
            onclick={submitRequest}
            disabled={requestStatus === 'sending' || !requestName.trim() || !requestEmail.trim()}
            class="px-4 py-2 bg-gold text-dark font-semibold rounded hover:bg-gold/90 transition-colors text-sm disabled:opacity-50"
          >
            {requestStatus === 'sending' ? 'Wird gesendet…' : 'Anfrage senden'}
          </button>
          {#if requestStatus === 'error'}
            <p class="text-red-400 text-sm">Fehler beim Senden. Bitte versuchen Sie es erneut.</p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
