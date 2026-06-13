<script lang="ts">
  import { t, type Locale } from '../i18n/index';

  interface Props {
    locale?: Locale;
  }

  let { locale = 'de' }: Props = $props();

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
  <h2 class="text-xl font-semibold text-gold mb-3">{t(locale, 'data.cookie-title')}</h2>
  {#if cookieConsent}
    <p class="text-muted mb-4">Aktueller Status: <span class="text-light">{cookieConsent === 'all' ? t(locale, 'data.cookie-all') : cookieConsent === 'essential' ? t(locale, 'data.cookie-essential') : cookieConsent}</span></p>
  {:else}
    <p class="text-muted mb-4">{t(locale, 'data.cookie-none')}</p>
  {/if}
  <button onclick={reopenCookies} class="px-4 py-2 bg-gold text-dark font-semibold rounded hover:bg-gold/90 transition-colors text-sm">
    {t(locale, 'data.cookie-change')}
  </button>
</div>

<!-- Section 2: Anmeldung / Session -->
<div class="mb-8 p-6 bg-dark-light rounded-2xl border border-dark-lighter">
  <h2 class="text-xl font-semibold text-gold mb-3">{t(locale, 'data.session-title')}</h2>
  {#if authState === null}
    <p class="text-muted">{t(locale, 'data.loading')}</p>
  {:else if authState.authenticated && authState.user}
    <p class="text-muted mb-1">{t(locale, 'data.logged-in-as')} <span class="text-light">{authState.user.name}</span></p>
    <p class="text-muted mb-4">{t(locale, 'data.email-label')} <span class="text-light">{authState.user.email}</span></p>
    <a href="/api/auth/logout" class="px-4 py-2 border border-dark-lighter text-muted hover:text-light hover:border-light rounded text-sm transition-colors">
      {t(locale, 'data.logout')}
    </a>
  {:else}
    <p class="text-muted mb-4">{t(locale, 'data.no-account')}</p>
    <a href="/api/auth/login" class="px-4 py-2 bg-gold text-dark font-semibold rounded hover:bg-gold/90 transition-colors text-sm">
      {t(locale, 'data.go-login')}
    </a>
  {/if}
</div>

<!-- Section 3: Daten einsehen und löschen -->
<div class="p-6 bg-dark-light rounded-2xl border border-dark-lighter">
  <h2 class="text-xl font-semibold text-gold mb-3">{t(locale, 'data.data-title')}</h2>

  {#if authState?.authenticated}
    <!-- Logged-in: direct delete -->
    <div class="mb-6">
      <h3 class="text-light font-semibold mb-2">{t(locale, 'data.download-title')}</h3>
      <p class="text-muted mb-3 text-sm">{t(locale, 'data.download-desc')}</p>
      <a href="/api/portal/profile/export"
         class="px-4 py-2 border border-dark-lighter text-muted hover:text-light hover:border-light rounded text-sm transition-colors inline-block">
        {t(locale, 'data.download-btn')}
      </a>
    </div>
    <div class="mb-6">
      <h3 class="text-light font-semibold mb-2">{t(locale, 'data.delete-title')}</h3>
      <p class="text-muted mb-3 text-sm">{t(locale, 'data.delete-desc')}</p>
      {#if !deleteConfirm}
        <button onclick={() => deleteConfirm = true} class="px-4 py-2 border border-red-600 text-red-400 hover:bg-red-600 hover:text-white rounded text-sm transition-colors">
          {t(locale, 'data.delete-btn')}
        </button>
      {:else}
        <p class="text-red-400 font-semibold mb-3">{t(locale, 'data.delete-confirm')}</p>
        <div class="flex gap-3">
          <button onclick={deleteAccount} disabled={deleteStatus === 'deleting'} class="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors disabled:opacity-50">
            {deleteStatus === 'deleting' ? t(locale, 'data.delete-deleting') : t(locale, 'data.delete-yes')}
          </button>
          <button onclick={() => { deleteConfirm = false; deleteStatus = 'idle'; }} class="px-4 py-2 border border-dark-lighter text-muted hover:text-light rounded text-sm transition-colors">
            {t(locale, 'data.cancel')}
          </button>
        </div>
        {#if deleteStatus === 'error'}
          <p class="text-red-400 mt-2 text-sm">{t(locale, 'data.delete-error')}</p>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- DSGVO request form (always shown) -->
  {#if requestStatus === 'sent'}
    <p class="text-green-400">{t(locale, 'data.dsgvo-sent')}</p>
  {:else}
    <div>
      <h3 class="text-light font-semibold mb-3">{t(locale, 'data.request-title')}</h3>
      <div class="flex gap-3 mb-4 flex-wrap">
        <button
          onclick={() => requestType = 'auskunft'}
          class={`px-4 py-2 rounded text-sm border transition-colors ${requestType === 'auskunft' ? 'bg-gold text-dark border-gold' : 'border-dark-lighter text-muted hover:text-light'}`}
        >
          {t(locale, 'data.request-auskunft')}
        </button>
        <button
          onclick={() => requestType = 'loeschung'}
          class={`px-4 py-2 rounded text-sm border transition-colors ${requestType === 'loeschung' ? 'bg-gold text-dark border-gold' : 'border-dark-lighter text-muted hover:text-light'}`}
        >
          {t(locale, 'data.request-loeschung')}
        </button>
      </div>
      {#if requestType}
        <div class="space-y-3">
          <label for="req-name" class="sr-only">{t(locale, 'data.request-name')}</label>
          <input
            id="req-name"
            type="text"
            placeholder={t(locale, 'data.request-name')}
            bind:value={requestName}
            class="w-full px-4 py-2.5 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold/20 text-sm"
          />
          <label for="req-email" class="sr-only">{t(locale, 'data.request-email')}</label>
          <input
            id="req-email"
            type="email"
            placeholder={t(locale, 'data.request-email')}
            bind:value={requestEmail}
            class="w-full px-4 py-2.5 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold/20 text-sm"
          />
          <button
            onclick={submitRequest}
            disabled={requestStatus === 'sending' || !requestName.trim() || !requestEmail.trim()}
            class="px-4 py-2 bg-gold text-dark font-semibold rounded hover:bg-gold/90 transition-colors text-sm disabled:opacity-50"
          >
            {requestStatus === 'sending' ? t(locale, 'data.request-sending') : t(locale, 'data.request-send')}
          </button>
          {#if requestStatus === 'error'}
            <p class="text-red-400 text-sm">{t(locale, 'data.request-error')}</p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
