<script lang="ts">
  import { t, type Locale } from '../i18n/index';

  let { locale = 'de' }: { locale?: Locale } = $props();

  let name = $state('');
  let email = $state('');
  let phone = $state('');
  let type = $state('allgemein');
  let message = $state('');
  let submitting = $state(false);
  let result = $state<{ success: boolean; message: string } | null>(null);

  // Submission-Values bleiben stabil (API-Kontrakt); Labels kommen aus i18n.
  const typeOptions = [
    { value: 'allgemein', key: 'contact.type-allgemein' },
    { value: 'erstgespraech', key: 'contact.type-erstgespraech' },
    { value: '50plus-digital', key: 'contact.type-50plus' },
    { value: 'coaching', key: 'contact.type-coaching' },
    { value: 'beratung', key: 'contact.type-beratung' },
    { value: 'support', key: 'contact.type-support' },
    { value: 'feedback', key: 'contact.type-feedback' },
  ];

  async function handleSubmit(e: Event) {
    e.preventDefault();
    submitting = true;
    result = null;

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, type, message }),
      });

      const data = await response.json();

      if (response.ok) {
        result = { success: true, message: t(locale, 'contact.success') };
        name = '';
        email = '';
        phone = '';
        type = 'allgemein';
        message = '';
      } else {
        result = { success: false, message: data.error || t(locale, 'contact.error-generic') };
      }
    } catch {
      result = { success: false, message: t(locale, 'contact.error-connection') };
    } finally {
      submitting = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="cf-form">

  <div class="cf-field">
    <label for="cf-type" class="cf-label">{t(locale, 'contact.type-label')}</label>
    <select id="cf-type" bind:value={type} class="cf-input">
      {#each typeOptions as item}
        <option value={item.value}>{t(locale, item.key)}</option>
      {/each}
    </select>
  </div>

  <div class="cf-field-row">
    <div class="cf-field">
      <label for="cf-name" class="cf-label">{t(locale, 'contact.name-label')} <span class="cf-req">{t(locale, 'contact.required')}</span></label>
      <input id="cf-name" type="text" bind:value={name} required
        placeholder={t(locale, 'contact.name-placeholder')} class="cf-input" />
    </div>
    <div class="cf-field">
      <label for="cf-email" class="cf-label">{t(locale, 'contact.email-label')} <span class="cf-req">{t(locale, 'contact.required')}</span></label>
      <input id="cf-email" type="email" bind:value={email} required
        placeholder={t(locale, 'contact.email-placeholder')} class="cf-input" />
    </div>
  </div>

  <div class="cf-field">
    <label for="cf-phone" class="cf-label">{t(locale, 'contact.phone-label')} <span class="cf-opt">{t(locale, 'contact.phone-optional')}</span></label>
    <input id="cf-phone" type="tel" bind:value={phone}
      placeholder={t(locale, 'contact.phone-placeholder')} class="cf-input" />
  </div>

  <div class="cf-field">
    <label for="cf-message" class="cf-label">{t(locale, 'contact.message-label')} <span class="cf-req">{t(locale, 'contact.required')}</span></label>
    <textarea id="cf-message" bind:value={message} required rows="5"
      placeholder={t(locale, 'contact.message-placeholder')}
      class="cf-input cf-textarea"></textarea>
  </div>

  <div class="cf-submit-area">
    <button type="submit" disabled={submitting} class="cf-btn">
      {#if submitting}{t(locale, 'contact.submitting')}{:else}{t(locale, 'contact.submit')}{/if}
    </button>
    <p class="cf-submit-note">
      {t(locale, 'contact.consent-text')}
    </p>
  </div>

  {#if result}
    <div class="cf-result" class:is-success={result.success} class:is-error={!result.success}>
      {result.message}
    </div>
  {/if}

</form>

<style>
  .cf-form { display: flex; flex-direction: column; gap: 22px; }
  .cf-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
  .cf-field { display: flex; flex-direction: column; gap: 8px; }

  .cf-label {
    font-family: var(--mono); font-size: 11px;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--mute);
  }
  .cf-req { color: var(--brass); }
  .cf-opt { text-transform: none; letter-spacing: 0; font-family: var(--sans); font-size: 12px; color: var(--mute-2); }

  .cf-input {
    background: transparent; border: none;
    border-bottom: 1px solid var(--line-2);
    padding: 10px 0 12px; font-family: var(--sans); font-size: 16px;
    color: var(--fg); outline: none; width: 100%;
    transition: border-color 200ms ease;
    -webkit-appearance: none; appearance: none;
  }
  .cf-input::placeholder { color: var(--mute-2); }
  .cf-input:focus { border-color: var(--brass); }
  .cf-textarea { resize: vertical; min-height: 100px; line-height: 1.55; }

  /* select arrow */
  select.cf-input {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238c96a3' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 4px center;
    padding-right: 24px;
    cursor: pointer;
  }

  .cf-submit-area { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .cf-btn {
    display: inline-flex; align-items: center; gap: 10px;
    background: var(--brass); color: #1a130a; border: none;
    padding: 15px 28px; border-radius: 999px;
    font-family: var(--sans); font-size: 15px; font-weight: 600;
    cursor: pointer; transition: background 200ms ease, transform 200ms ease;
  }
  .cf-btn:hover:not(:disabled) { background: var(--brass-2); transform: translateY(-1px); }
  .cf-btn:disabled { background: var(--ink-800); color: var(--mute); cursor: not-allowed; }
  .cf-submit-note { font-size: 13px; color: var(--mute); max-width: 38ch; line-height: 1.5; }
  .cf-submit-note a { color: var(--fg-soft); border-bottom: 1px solid var(--brass); text-decoration: none; }
  .cf-submit-note a:hover { color: var(--brass-2); }

  .cf-result { padding: 16px; font-size: 14px; line-height: 1.55; border-radius: 8px; }
  .cf-result.is-success { background: oklch(0.80 0.06 160 / .1); color: oklch(0.80 0.06 160); border: 1px solid oklch(0.80 0.06 160 / .25); }
  .cf-result.is-error { background: oklch(0.62 0.18 22 / .1); color: oklch(0.75 0.12 22); border: 1px solid oklch(0.62 0.18 22 / .25); }

  @media (max-width: 640px) {
    .cf-field-row { grid-template-columns: 1fr; }
  }
</style>
