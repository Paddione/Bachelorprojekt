<script lang="ts">
  import { tick } from 'svelte';
  import ContactForm from './ContactForm.svelte';
  import BookingForm from './BookingForm.svelte';
  import { type Locale } from '../i18n/index';

  /** One selectable journey service (values fed by the page, T901024). */
  export interface JourneyService {
    key: string;
    name: string;
    durationMin: number;
    priceLabel: string;
    highlight?: boolean;
  }

  interface SlotOption {
    start: string;
    end: string;
    display: string;
  }

  interface SlotDay {
    date: string;
    weekday: string;
    slots: SlotOption[];
  }

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
    journeyServices?: JourneyService[];
    journeyEnabled?: boolean;
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
    journeyServices = [],
    journeyEnabled = false,
  }: Props = $props();

  type Mode = 'termin' | 'message' | 'callback' | 'anfrage';
  let activeMode = $state<Mode>(initialMode ?? (journeyEnabled ? 'anfrage' : 'termin'));

  // ── Journey state (T901024; inert unless journeyEnabled) ──────────────
  const validPreselect = initialServiceKey !== undefined
    && journeyServices.some((s) => s.key === initialServiceKey);
  let journeyStep = $state(1);
  let selectedServiceKey = $state(validPreselect && initialServiceKey !== undefined ? initialServiceKey : '');
  let slotDays = $state<SlotDay[]>([]);
  let slotsLoading = $state(false);
  let slotsError = $state<string | null>(null);
  let selectedSlotStart = $state('');
  let jName = $state('');
  let jEmail = $state('');
  let jPhone = $state('');
  let jMessage = $state('');
  let jConsent = $state(false);
  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let confirmation = $state<{ managePath: string } | null>(null);
  let confirmHeading: HTMLHeadingElement | null = $state(null);
  // One idempotency key per form instance; the disabled-while-pending
  // button plus the submitting guard make double submits a single POST.
  const journeyKey = crypto.randomUUID();

  const selectedService = $derived(
    journeyServices.find((s) => s.key === selectedServiceKey) ?? null,
  );
  const selectedSlot = $derived(
    slotDays.flatMap((d) => d.slots).find((s) => s.start === selectedSlotStart) ?? null,
  );

  function berlinDayKeyLocal(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  }

  async function loadSlots(): Promise<void> {
    const service = selectedService;
    if (!service) return;
    slotsLoading = true;
    slotsError = null;
    try {
      const from = berlinDayKeyLocal(new Date(Date.now() + 86400000));
      const res = await fetch(`/api/calendar/slots?from=${from}&durationMin=${service.durationMin}`);
      if (!res.ok) throw new Error('slots');
      const days = (await res.json()) as SlotDay[];
      const today = berlinDayKeyLocal(new Date());
      // Defense in depth: Gleich-Tag-Slots nie anzeigen, auch wenn die API sie liefern würde.
      slotDays = days
        .map((d) => ({ ...d, slots: d.slots.filter((s) => berlinDayKeyLocal(new Date(s.start)) > today) }))
        .filter((d) => d.slots.length > 0);
      const stillThere = slotDays.flatMap((d) => d.slots).some((s) => s.start === selectedSlotStart);
      if (!stillThere) {
        const pre = slotDays.flatMap((d) => d.slots).find((s) => s.start === initialStart);
        selectedSlotStart = pre?.start ?? '';
      }
    } catch {
      slotDays = [];
      slotsError = 'Termine konnten nicht geladen werden. Bitte versuchen Sie es später erneut. (Entwurf)';
    } finally {
      slotsLoading = false;
    }
  }

  function goStep2(): void {
    if (!selectedService) return;
    journeyStep = 2;
    void loadSlots();
  }

  async function submitJourney(e: Event): Promise<void> {
    e.preventDefault();
    const slot = selectedSlot;
    const service = selectedService;
    if (submitting || !jConsent || !service || !slot) return;
    submitting = true;
    submitError = null;
    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': journeyKey },
        body: JSON.stringify({
          name: jName,
          email: jEmail,
          phone: jPhone === '' ? null : jPhone,
          type: 'termin',
          message: jMessage === '' ? null : jMessage,
          slotStart: slot.start,
          slotEnd: slot.end,
          slotDisplay: slot.display,
          date: berlinDayKeyLocal(new Date(slot.start)),
          serviceKey: service.key,
          idempotencyKey: journeyKey,
        }),
      });
      const data = (await res.json()) as { requestToken?: unknown; error?: unknown };
      if (!res.ok) {
        submitError = typeof data.error === 'string' ? data.error : 'Es ist ein Fehler aufgetreten. (Entwurf)';
        return;
      }
      if (typeof data.requestToken === 'string') {
        confirmation = { managePath: `/anfrage/${data.requestToken}` };
        journeyStep = 4;
        await tick();
        confirmHeading?.focus();
      } else {
        submitError = 'Die Antwort war unvollständig. Bitte versuchen Sie es erneut. (Entwurf)';
      }
    } catch {
      submitError = 'Verbindungsfehler. Bitte versuchen Sie es später erneut.';
    } finally {
      submitting = false;
    }
  }
</script>

<div class="ch-root">
  <!-- Full-width mode switcher -->
  <div class="ch-modes-wrap">
    <div class="ch-container">
      <div class="ch-modes" role="tablist" aria-label="Wie möchten Sie Kontakt aufnehmen?">
        <div class="ch-modes-row" class:has-journey={journeyEnabled}>

          {#if journeyEnabled}
            <button type="button" role="tab" aria-selected={activeMode === 'anfrage'}
              class="ch-mode" class:is-active={activeMode === 'anfrage'}
              onclick={() => (activeMode = 'anfrage')}>
              <span class="ch-mode-num">01 — Anfrage</span>
              <span class="ch-mode-title">Termin <em>anfragen.</em></span>
              <span class="ch-mode-sub">Service, Wunschtermin, Daten — Bestätigung durch die Inhaberin.</span>
            </button>
          {/if}

          <button type="button" role="tab" aria-selected={activeMode === 'termin'}
            class="ch-mode" class:is-active={activeMode === 'termin'}
            onclick={() => (activeMode = 'termin')}>
            <span class="ch-mode-num">{journeyEnabled ? '02 — Termin' : '01 — Termin'}</span>
            <span class="ch-mode-title">Erstgespräch <em>buchen.</em></span>
            <span class="ch-mode-sub">30 Minuten, Online oder vor Ort. Direkter Slot in meinem Kalender.</span>
          </button>

          <button type="button" role="tab" aria-selected={activeMode === 'message'}
            class="ch-mode" class:is-active={activeMode === 'message'}
            onclick={() => (activeMode = 'message')}
            data-testid="tab-nachricht" aria-label={journeyEnabled ? '03 – Nachricht senden' : '02 – Nachricht senden'}>
            <span class="ch-mode-num">{journeyEnabled ? '03 — Nachricht' : '02 — Nachricht'}</span>
            <span class="ch-mode-title">Eine Frage stellen.</span>
            <span class="ch-mode-sub">Wenn Sie erst kurz schildern möchten, was Sie beschäftigt.</span>
          </button>

          <button type="button" role="tab" aria-selected={activeMode === 'callback'}
            class="ch-mode" class:is-active={activeMode === 'callback'}
            onclick={() => (activeMode = 'callback')}>
            <span class="ch-mode-num">{journeyEnabled ? '04 — Rückruf' : '03 — Rückruf'}</span>
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
            {:else if activeMode === 'callback'}
              <h2>Rückruf <em>anfragen.</em></h2>
            {:else}
              <h2>Termin <em>anfragen.</em></h2>
              <span class="ch-panel-meta">Bestätigung durch die Inhaberin</span>
            {/if}
          </header>

          {#if activeMode === 'termin'}
            <BookingForm initialType="erstgespraech" serviceKey={initialServiceKey}
              {initialDate} {initialStart} {initialEnd} />
          {:else if activeMode === 'message'}
            <ContactForm {locale} />
          {:else if activeMode === 'callback'}
            <BookingForm initialType="callback" serviceKey={initialServiceKey} />
          {:else}
            <ol class="j-steps" aria-label="Fortschritt der Anfrage">
              <li aria-current={journeyStep === 1 ? 'step' : undefined}>1. Service</li>
              <li aria-current={journeyStep === 2 ? 'step' : undefined}>2. Slot</li>
              <li aria-current={journeyStep === 3 ? 'step' : undefined}>3. Daten</li>
              <li aria-current={journeyStep === 4 ? 'step' : undefined}>4. Fertig</li>
            </ol>

            {#if journeyStep === 1}
              {#if journeyServices.length === 0}
                <p role="status">Derzeit sind keine Services verfügbar. (Entwurf)</p>
              {:else}
                <fieldset class="j-cards">
                  <legend>1. Service wählen</legend>
                  {#each journeyServices as service (service.key)}
                    <label class="j-card">
                      <input type="radio" name="j-service" value={service.key} bind:group={selectedServiceKey} />
                      <span class="j-card-name">{service.name}</span>
                      <span class="j-card-meta">{service.durationMin} Min. · {service.priceLabel}</span>
                      {#if service.highlight}<span class="j-badge">Beliebt (Entwurf)</span>{/if}
                    </label>
                  {/each}
                </fieldset>
                <p class="j-hint">Preise sind Platzhalter — finale Preise folgen. (Entwurf)</p>
                <button type="button" class="j-btn" disabled={selectedServiceKey === ''} onclick={goStep2}>
                  Weiter zu Schritt 2
                </button>
              {/if}
            {/if}

            {#if journeyStep === 2}
              <h3 class="j-h3">2. Wunschtermin wählen</h3>
              <p class="j-lead">Anfragen sind bis zum Vortag möglich — heute ist kein Slot mehr buchbar. (Entwurf, finaler Wortlaut offen)</p>
              <div role="status" aria-live="polite">
                {#if slotsLoading}
                  <p>Termine werden geladen …</p>
                {:else if slotsError}
                  <p>{slotsError}</p>
                  <button type="button" class="j-btn j-btn-ghost" onclick={() => void loadSlots()}>Erneut versuchen</button>
                {:else if slotDays.length === 0}
                  <p>Keine freien Termine in den nächsten Tagen. Bitte versuchen Sie es später erneut. (Entwurf)</p>
                {:else}
                  <fieldset class="j-slots">
                    <legend>Freie Termine</legend>
                    {#each slotDays as day (day.date)}
                      <h4 class="j-day">{day.weekday}, {day.date}</h4>
                      {#each day.slots as slot (slot.start)}
                        <label class="j-slot">
                          <input type="radio" name="j-slot" value={slot.start} bind:group={selectedSlotStart} />
                          <span>{slot.display}</span>
                        </label>
                      {/each}
                    {/each}
                  </fieldset>
                {/if}
              </div>
              <div class="j-nav">
                <button type="button" class="j-btn j-btn-ghost" onclick={() => (journeyStep = 1)}>Zurück</button>
                <button type="button" class="j-btn" disabled={selectedSlotStart === ''} onclick={() => (journeyStep = 3)}>
                  Weiter zu Schritt 3
                </button>
              </div>
            {/if}

            {#if journeyStep === 3}
              <h3 class="j-h3">3. Ihre Daten</h3>
              <form class="j-form" onsubmit={submitJourney}>
                <label for="j-name">Name *</label>
                <input id="j-name" autocomplete="name" required minlength="2" bind:value={jName} aria-describedby="j-name-hint" />
                <p class="j-hint" id="j-name-hint">So dürfen wir Sie ansprechen.</p>
                <label for="j-email">E-Mail *</label>
                <input id="j-email" type="email" autocomplete="email" required bind:value={jEmail} aria-describedby="j-email-hint" />
                <p class="j-hint" id="j-email-hint">Die Bestätigung und Ihr Verwaltungs-Link gehen an diese Adresse.</p>
                <label for="j-phone">Telefon (optional)</label>
                <input id="j-phone" type="tel" autocomplete="tel" bind:value={jPhone} />
                <label for="j-message">Nachricht (optional)</label>
                <textarea id="j-message" rows="3" maxlength="2000" bind:value={jMessage}></textarea>
                <label class="j-consent">
                  <input type="checkbox" required bind:checked={jConsent} />
                  <span>AGB-/Datenschutz-Hinweis gelesen * (Entwurf). Es gelten unsere AGB (Kurztext folgt, Platzhalter) und die Hinweise zum <a href="/datenschutz">Datenschutz</a>.</span>
                </label>
                {#if submitError}
                  <p class="j-error" role="alert">{submitError}</p>
                {/if}
                <div class="j-nav">
                  <button type="button" class="j-btn j-btn-ghost" onclick={() => (journeyStep = 2)}>Zurück</button>
                  <button type="submit" class="j-btn" disabled={submitting || !jConsent}>
                    {submitting ? 'Wird gesendet …' : 'Anfrage absenden'}
                  </button>
                </div>
              </form>
            {/if}

            {#if journeyStep === 4 && confirmation !== null}
              <div aria-live="assertive">
                <h3 class="j-h3" bind:this={confirmHeading} tabindex="-1">Vielen Dank für Ihre Anfrage! (Entwurf)</h3>
                <p>Wir prüfen Ihren Wunschtermin und melden uns per E-Mail mit einer Bestätigung. (Entwurf)</p>
                <p>Verwalten Sie Ihre Anfrage hier: <a href={confirmation.managePath}>{confirmation.managePath}</a></p>
                <p class="j-lead">Bitte diesen Link aufbewahren — nur über ihn sind Umbuchung und Storno möglich. (Entwurf)</p>
              </div>
            {/if}
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
              {#if email}
                <li>
                  <span class="ch-key">E-Mail</span>
                  <a class="ch-val" href="mailto:{email}">{email}</a>
                  <span class="ch-sub">Antwort meist binnen 24 h</span>
                </li>
              {/if}
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

  /* Journey (T901024) */
  .ch-modes-row.has-journey { grid-template-columns: repeat(4, 1fr); }
  .j-steps {
    list-style: none; margin: 0 0 28px; padding: 0;
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--mute);
  }
  .j-steps li { padding: 10px 4px; border-top: 2px solid var(--line); }
  .j-steps li[aria-current="step"] { color: var(--brass); border-top-color: var(--brass); }
  .j-h3 { font-family: var(--serif); font-weight: 400; font-size: 24px; margin: 0 0 12px; color: var(--fg); }
  .j-lead { color: var(--fg-soft); font-size: 15px; line-height: 1.6; margin: 0 0 20px; }
  .j-hint { color: var(--mute); font-size: 13px; line-height: 1.55; margin: 8px 0 0; }
  .j-error { color: #b3261e; font-size: 14px; font-weight: 600; }
  .j-cards, .j-slots { border: none; margin: 0 0 8px; padding: 0; display: grid; gap: 12px; }
  .j-cards legend, .j-slots legend {
    font-family: var(--serif); font-size: 22px; color: var(--fg); padding: 0; margin-bottom: 12px;
  }
  .j-card, .j-slot {
    display: flex; align-items: center; gap: 12px;
    min-height: 44px; padding: 12px 16px;
    border: 1px solid var(--line-2); border-radius: 10px; cursor: pointer;
  }
  .j-card:has(input:checked), .j-slot:has(input:checked) { border-color: var(--brass); }
  .j-card input, .j-slot input { width: 20px; height: 20px; flex-shrink: 0; accent-color: var(--brass); }
  .j-card-name { font-weight: 600; }
  .j-card-meta { color: var(--mute); font-size: 13px; }
  .j-badge {
    margin-left: auto; font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--brass); white-space: nowrap;
  }
  .j-day { font-family: var(--mono); font-size: 12px; letter-spacing: 0.1em; color: var(--mute); margin: 16px 0 4px; }
  .j-form label { display: block; margin: 16px 0 6px; font-weight: 600; font-size: 14px; }
  .j-form input[type="text"], .j-form input:not([type]), .j-form input[type="email"],
  .j-form input[type="tel"], .j-form textarea {
    width: 100%; box-sizing: border-box; padding: 12px; min-height: 44px;
    border: 1px solid var(--line-2); border-radius: 8px; font: inherit; background: transparent; color: var(--fg);
  }
  .j-consent { display: flex !important; gap: 12px; align-items: flex-start; font-weight: 400 !important; }
  .j-consent input { width: 22px; height: 22px; flex-shrink: 0; margin-top: 2px; accent-color: var(--brass); }
  .j-nav { display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
  .j-btn {
    min-height: 44px; padding: 12px 24px; border-radius: 8px; font: inherit; cursor: pointer;
    border: 1px solid var(--brass); background: var(--brass); color: #fff;
  }
  .j-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .j-btn-ghost { background: transparent; color: var(--fg); border-color: var(--line-2); }

  /* Responsive */
  @media (max-width: 960px) {
    .ch-container { padding: 0 22px; }
    .ch-grid { grid-template-columns: 1fr; gap: 64px; }
    .j-steps { grid-template-columns: 1fr 1fr; }
    .ch-sidebar { position: static; }
    .ch-modes-row { grid-template-columns: 1fr; }
    .ch-modes-row.has-journey { grid-template-columns: 1fr; }
    .ch-mode + .ch-mode { border-left: none; border-top: 1px solid var(--line); }
    .ch-mode { padding: 20px 0; }
    .ch-section { padding: 48px 0 80px; }
  }
</style>
