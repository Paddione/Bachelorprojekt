<script lang="ts">
  import ContactForm from './ContactForm.svelte';
  import BookingForm from './BookingForm.svelte';
  import { type Locale } from '../i18n/index';

  interface Props {
    locale?: Locale;
    initialMode?: 'message' | 'termin' | 'callback' | null;
    initialServiceKey?: string;
    initialDate?: string;
    initialStart?: string;
    initialEnd?: string;
    phone?: string;
    showPhone?: boolean;
    email?: string;
    city?: string;
    sidebarText?: string;
    sidebarCta?: string;
    showSteps?: boolean;
  }

  let {
    locale = 'de',
    initialMode = null,
    initialServiceKey,
    initialDate = '',
    initialStart = '',
    initialEnd = '',
    phone = '',
    showPhone = false,
    email = '',
    city = '',
    sidebarText = '',
    sidebarCta = '',
    showSteps = false,
  } = $props<Props>();

  let activeMode = $state<'termin' | 'message' | 'callback'>(initialMode ?? 'termin');
</script>

<div class="ch-root">
  <!-- Full-width mode switcher -->
  <div class="ch-modes-wrap">
    <div class="ch-container">
      <div class="ch-modes" role="tablist" aria-label="Wie möchten Sie Kontakt aufnehmen?">
        <div class="ch-modes-row">

          <button type="button" role="tab" aria-selected={activeMode === 'termin'}
            class="ch-mode" class:is-active={activeMode === 'termin'}
            onclick={() => (activeMode = 'termin')}>
            <span class="ch-mode-num">01 — Termin</span>
            <span class="ch-mode-title">Erstgespräch <em>buchen.</em></span>
            <span class="ch-mode-sub">30 Minuten, Online oder vor Ort. Direkter Slot in meinem Kalender.</span>
          </button>

          <button type="button" role="tab" aria-selected={activeMode === 'message'}
            class="ch-mode" class:is-active={activeMode === 'message'}
            onclick={() => (activeMode = 'message')}
            data-testid="tab-nachricht" aria-label="02 – Nachricht senden">
            <span class="ch-mode-num">02 — Nachricht</span>
            <span class="ch-mode-title">Eine Frage stellen.</span>
            <span class="ch-mode-sub">Wenn Sie erst kurz schildern möchten, was Sie beschäftigt.</span>
          </button>

          <button type="button" role="tab" aria-selected={activeMode === 'callback'}
            class="ch-mode" class:is-active={activeMode === 'callback'}
            onclick={() => (activeMode = 'callback')}>
            <span class="ch-mode-num">03 — Rückruf</span>
            <span class="ch-mode-title">Anrufen lassen.</span>
            <span class="ch-mode-sub">Sie nennen Zeitfenster, ich melde mich. Werktags 9–17 Uhr.</span>
          </button>

        </div>
      </div>
    </div>
  </div>

  <!-- Booking section -->
  <section class="ch-section">
    <div class="ch-container">
      <div class="ch-grid">

        <!-- Main panel -->
        <div class="ch-panel">
          <header class="ch-panel-head">
            {#if activeMode === 'termin'}
              <h2>Termin <em>vorschlagen.</em></h2>
              <span class="ch-panel-meta">Lüneburg · DE</span>
            {:else if activeMode === 'message'}
              <h2>Eine Frage <em>stellen.</em></h2>
            {:else}
              <h2>Rückruf <em>anfragen.</em></h2>
            {/if}
          </header>

          {#if activeMode === 'termin'}
            <BookingForm initialType="erstgespraech" serviceKey={initialServiceKey}
              {initialDate} {initialStart} {initialEnd} />
          {:else if activeMode === 'message'}
            <ContactForm {locale} />
          {:else}
            <BookingForm initialType="callback" serviceKey={initialServiceKey} />
          {/if}
        </div>

        <!-- Sidebar -->
        <aside class="ch-sidebar">

          <div class="ch-side-block">
            <span class="ch-side-label">Direkt erreichen</span>
            <ul class="ch-contact-list">
              {#if showPhone && phone}
                <li>
                  <span class="ch-key">Telefon</span>
                  <a class="ch-val" href="tel:{phone}">{phone}</a>
                  <span class="ch-sub">Werktags 9–17 Uhr</span>
                </li>
              {/if}
              <li>
                <span class="ch-key">E-Mail</span>
                <a class="ch-val" href="mailto:{email}">{email}</a>
                <span class="ch-sub">Antwort meist binnen 24 h</span>
              </li>
              <li>
                <span class="ch-key">Standort</span>
                <span class="ch-val">{city}</span>
                <span class="ch-sub">Persönlich vor Ort, Online überall.</span>
              </li>
            </ul>
            <div class="ch-availability">
              <span class="ch-pulse" aria-hidden="true"></span>
              <span class="ch-avail-text"><strong>Aktuell verfügbar</strong> · Erstgespräch kostenfrei</span>
            </div>
          </div>

          <div class="ch-side-block">
            <span class="ch-side-label">Kostenloses Erstgespräch</span>
            <h3 class="ch-side-h3">30 Minuten <em>Klarheit.</em></h3>
            {#if sidebarText}<p class="ch-side-p">{sidebarText}</p>{/if}
            {#if sidebarCta}<p class="ch-three-beat">{sidebarCta}</p>{/if}
          </div>

          {#if showSteps}
            <div class="ch-side-block">
              <span class="ch-side-label">Wie geht es weiter?</span>
              <ol class="ch-steps">
                <li><span class="ch-step-n">1.</span><span>Sie schreiben mir über das Formular oder per E-Mail</span></li>
                <li><span class="ch-step-n">2.</span><span>Ich melde mich innerhalb von 24 Stunden</span></li>
                <li><span class="ch-step-n">3.</span><span>Wir vereinbaren ein Kennenlerngespräch</span></li>
                <li><span class="ch-step-n">4.</span><span>Danach entscheiden Sie, ob wir zusammenarbeiten</span></li>
              </ol>
            </div>
          {/if}

        </aside>
      </div>
    </div>
  </section>
</div>

<style>
  .ch-root { position: relative; z-index: 2; }
  .ch-container { max-width: 1240px; margin: 0 auto; padding: 0 40px; }

  /* Mode switcher */
  .ch-modes-wrap { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .ch-modes-row { display: grid; grid-template-columns: repeat(3, 1fr); }

  .ch-mode {
    position: relative; padding: 28px 4px 26px;
    display: flex; flex-direction: column; gap: 10px;
    color: var(--fg); background: transparent; border: none;
    cursor: pointer; text-align: left;
    transition: background 200ms ease;
  }
  .ch-mode + .ch-mode { border-left: 1px solid var(--line); }
  .ch-mode:hover { background: linear-gradient(to bottom, rgba(255,255,255,.015), transparent); }

  .ch-mode-num {
    font-family: var(--mono); font-size: 11px;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--mute);
  }
  .ch-mode-title {
    font-family: var(--serif); font-size: 26px; font-weight: 400;
    letter-spacing: -0.015em; line-height: 1.1; color: var(--fg);
  }
  .ch-mode-title :global(em) { font-style: italic; color: var(--brass-2); }
  .ch-mode-sub {
    font-family: var(--sans); font-size: 13px;
    color: var(--mute); line-height: 1.55; max-width: 32ch;
  }

  .ch-mode.is-active {
    background: linear-gradient(to bottom, oklch(0.80 0.09 75 / .04), transparent 60%);
  }
  .ch-mode.is-active::before {
    content: ""; position: absolute;
    top: -1px; left: 0; right: 0; height: 1px;
    background: var(--brass);
  }
  .ch-mode.is-active .ch-mode-num { color: var(--brass); }

  /* Booking section */
  .ch-section { padding: 80px 0 120px; }
  .ch-grid {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 56px;
    align-items: start;
  }

  /* Panel header */
  .ch-panel-head {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: 36px; gap: 24px;
  }
  .ch-panel-head h2 {
    font-family: var(--serif); font-weight: 400; font-size: 38px;
    line-height: 1.1; letter-spacing: -0.02em; color: var(--fg); margin: 0;
  }
  .ch-panel-head h2 :global(em) { font-style: italic; color: var(--brass-2); }
  .ch-panel-meta {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--mute);
    white-space: nowrap; padding-top: 14px;
  }

  /* Sidebar */
  .ch-sidebar {
    display: flex; flex-direction: column; gap: 32px;
    position: sticky; top: 100px;
  }
  .ch-side-block {
    padding-top: 28px;
    border-top: 1px solid var(--line-2);
  }
  .ch-side-label {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em;
    text-transform: uppercase; color: var(--brass);
    display: inline-flex; align-items: center; gap: 12px;
  }
  .ch-side-label::before { content: ""; width: 22px; height: 1px; background: currentColor; opacity: .8; }
  .ch-side-h3 {
    margin: 18px 0 0; font-family: var(--serif); font-weight: 400;
    font-size: 24px; letter-spacing: -0.01em; color: var(--fg);
  }
  .ch-side-h3 :global(em) { font-style: italic; color: var(--brass-2); }
  .ch-side-p { margin: 14px 0 0; color: var(--fg-soft); font-size: 15px; line-height: 1.6; }
  .ch-three-beat { margin-top: 18px; color: var(--brass-2); font-size: 14px; font-weight: 500; }

  /* Contact list */
  .ch-contact-list {
    list-style: none; margin: 22px 0 0; padding: 0;
    display: flex; flex-direction: column;
  }
  .ch-contact-list li {
    display: grid; grid-template-columns: 1fr;
    gap: 4px; padding: 16px 0;
    border-bottom: 1px solid var(--line);
  }
  .ch-contact-list li:last-child { border-bottom: none; }
  .ch-key {
    font-family: var(--mono); font-size: 10px;
    letter-spacing: 0.16em; text-transform: uppercase; color: var(--mute);
  }
  .ch-val {
    font-family: var(--serif); font-size: 19px;
    color: var(--fg); letter-spacing: -0.01em; text-decoration: none;
  }
  a.ch-val { transition: color 200ms ease; }
  a.ch-val:hover { color: var(--brass-2); }
  .ch-sub { font-size: 13px; color: var(--mute); line-height: 1.5; margin-top: 2px; }

  /* Availability */
  .ch-availability {
    margin-top: 24px; display: flex; align-items: center;
    gap: 12px; padding: 14px 0;
    border-top: 1px solid var(--line);
  }
  .ch-pulse {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--sage); flex: 0 0 8px;
    animation: ch-pulse 2.2s infinite cubic-bezier(.22, .61, .36, 1);
  }
  @keyframes ch-pulse {
    0%   { box-shadow: 0 0 0 0 oklch(0.80 0.06 160 / .55); }
    70%  { box-shadow: 0 0 0 10px oklch(0.80 0.06 160 / 0); }
    100% { box-shadow: 0 0 0 0 oklch(0.80 0.06 160 / 0); }
  }
  .ch-avail-text {
    font-family: var(--mono); font-size: 11px;
    letter-spacing: 0.12em; color: var(--fg-soft); line-height: 1.5;
  }
  .ch-avail-text :global(strong) { color: var(--fg); font-weight: 500; }

  /* Steps */
  .ch-steps {
    list-style: none; margin: 18px 0 0; padding: 0;
    display: flex; flex-direction: column; gap: 12px;
  }
  .ch-steps li {
    display: flex; gap: 12px;
    color: var(--fg-soft); font-size: 14px; line-height: 1.5;
  }
  .ch-step-n { color: var(--brass); font-weight: 600; flex-shrink: 0; }

  /* Responsive */
  @media (max-width: 960px) {
    .ch-container { padding: 0 22px; }
    .ch-grid { grid-template-columns: 1fr; gap: 64px; }
    .ch-sidebar { position: static; }
    .ch-modes-row { grid-template-columns: 1fr; }
    .ch-mode + .ch-mode { border-left: none; border-top: 1px solid var(--line); }
    .ch-mode { padding: 20px 0; }
    .ch-section { padding: 48px 0 80px; }
  }
</style>
