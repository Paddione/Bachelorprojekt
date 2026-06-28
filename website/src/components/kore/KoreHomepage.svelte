<script lang="ts">
  import Timeline from '../Timeline.svelte';
  import GoalsDashboard from '../GoalsDashboard.svelte';
  import type { DaySlots } from '../../lib/caldav';
  import type { BrandConfig, FooterConfig, HomepageService } from '../../config/types';

  interface KoreContact {
    name?: string;
    email?: string;
    phone?: string;
    city?: string;
  }

  interface KoreLegal {
    jobtitle?: string;
    tagline?: string;
    street?: string;
    zip?: string;
    ustId?: string;
    website?: string;
    chamber?: string;
  }

  interface TimelineRow {
    id: number;
    day: string;
    pr_number: number | null;
    title: string;
    description: string | null;
    category: string;
    scope: string | null;
    brand: string | null;
    requirement_id: string | null;
    bugs_fixed: number;
    ticket_external_id: string | null;
    ticket_id: string | null;
  }

  export let services: HomepageService[] = [];
  export let homepage: Partial<BrandConfig['homepage']> = {};
  export let contact: KoreContact = {};
  export let legal: KoreLegal = {};
  export let footerColumns: FooterConfig['columns'] = [];
  export let footerCopyright: string = '';
  export let nextDay: DaySlots | null = null;
  export let initialTimeline: TimelineRow[] = [];
  export let wantsTimeline: boolean = false;

  // Nav active section
  let activeSection = 'leistungen';

  // Booking slot picker
  let pickedSlot: string | null = null;

  $: bookingSlots = nextDay
    ? nextDay.slots.slice(0, 6).map((s, i) => ({
        id: `slot-${i}`,
        day: nextDay!.weekday,
        date: nextDay!.date,
        display: s.display,
        time: s.start.substring(11, 16),
      }))
    : [];

  // Service glyphs — inline SVGs matching the Kore 1.5px-stroke line style
  const serviceGlyphs: Record<string, string> = {
    'ki-beratung': `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a9 9 0 0 1 9 9c0 3.18-1.66 5.97-4.15 7.56L16 21H8l-.85-2.44A9 9 0 0 1 12 2z"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/><path d="M9 11h6M12 8v6"/></svg>`,
    'software-dev': `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    'deployment': `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>`,
  };

  // Milestones used in the "Ausgewählte Arbeit" section
  const milestones = [
    {
      eye: 'IT-Management · Früher',
      title: 'Systeme betrieben,<br><em>bevor ich sie baute.</em>',
      body: 'Jahrelang die IT großer und kleiner Unternehmen gemanaged — Server, Netzwerke, Helpdesk, Strategie. Technik, die wirklich funktionieren muss.',
      stat1lab: 'Erfahrung',
      stat1val: '10',
      stat1unit: 'Jahre',
      stat1sub: 'Betrieb & Beratung',
      stat2lab: 'Fokus',
      stat2val: 'IT',
      stat2sub: 'Management & Support',
      tags: 'WINDOWS · LINUX · NETZWERK',
    },
    {
      eye: 'IT-Sicherheit · Studium',
      title: 'Security als<br><em>Grundhaltung.</em>',
      body: 'B.Sc. IT-Sicherheit: Penetration Testing, Kryptographie, sichere Architekturen. Was bleibt: ein tiefes Misstrauen gegenüber "haben wir immer so gemacht".',
      stat1lab: 'Abschluss',
      stat1val: 'B.Sc.',
      stat1unit: '',
      stat1sub: 'IT-Sicherheit',
      stat2lab: 'Schwerpunkt',
      stat2val: 'PenTest',
      stat2sub: 'Kryptographie · Auth',
      tags: 'OWASP · PKI · PENTEST',
    },
  ];
</script>

<!-- ═══════════════════════════════ HERO ═══════════════════════════════════ -->
<section class="w-hero">
  <span class="w-ticker">
    <span class="dot"></span>
    <b>Lüneburg / Remote</b>&nbsp;·
    <span style="color:var(--mute)">KI · Kubernetes · Security</span>
  </span>

  <span class="eyebrow no-rule">[ Software Engineering ]</span>

  <h1>Kubernetes & KI,<br><em>ruhig betrieben.</em></h1>

  <p class="lede">
    {legal.tagline ?? homepage.servicesSubheadline}
    Ich bringe Architektur, Security und KI zusammen — ohne Buzzwords, ohne Vendor-Lock-in.
  </p>

  <div class="cta-row">
    <a class="btn primary" href="/kontakt">Kennenlerngespräch →</a>
    <a class="btn ghost" href="#leistungen">Leistungen ansehen</a>
  </div>

  <div class="meta-row">
    {#each homepage.stats ?? [] as stat}
      <div>
        <div class="lab">{stat.label}</div>
        <div class="v">{stat.value}</div>
        <div class="s">&nbsp;</div>
      </div>
    {/each}
  </div>
</section>

<!-- ═══════════════════════════════ SERVICES ══════════════════════════════ -->
<section class="w-section" id="leistungen">
  <div class="head">
    <span class="num">01 / 04</span>
    <h2>Was ich tue, <em>und wie.</em></h2>
    <span class="hint">{services.length} Leistungen</span>
  </div>

  <div class="w-services">
    {#each services as svc}
      <article class="w-svc">
        <div class="glyph">
          {@html serviceGlyphs[svc.slug] ?? serviceGlyphs['deployment']}
        </div>
        <h3>{svc.title.split(' ')[0]} <em>{svc.title.split(' ').slice(1).join(' ')}</em></h3>
        <p>{svc.description}</p>
        <div class="tags">
          {#each (svc.features ?? []).slice(0, 3) as f}
            <span>{f.split(' ').slice(0,2).join(' ').toUpperCase()}</span>
          {/each}
        </div>
        <a class="btn ghost sm" style="margin-top:auto" href="/{svc.slug}">Mehr erfahren →</a>
      </article>
    {/each}
  </div>
</section>

<!-- ═══════════════════════════════ WORK / CASES ══════════════════════════ -->
<section class="w-section" id="ansatz">
  <div class="head">
    <span class="num">02 / 04</span>
    <h2>Gelebte Praxis, <em>kein Lernprojekt.</em></h2>
    <span class="hint">Erfahrung</span>
  </div>

  <div class="w-cases">
    {#each milestones as m, i}
      <article class="w-case {i === 0 ? 'lg' : ''}">
        <span class="eye">{m.eye}</span>
        <h3>{@html m.title}</h3>
        <p style="color:var(--fg-soft); margin-top:14px; font-size:14.5px; line-height:1.55">
          {m.body}
        </p>
        {#if i === 0}
          <div class="stats">
            <div class="stat">
              <div class="lab">{m.stat1lab}</div>
              <div class="v">
                {m.stat1val}{#if m.stat1unit}<span class="u">{m.stat1unit}</span>{/if}
              </div>
              <div class="s">{m.stat1sub}</div>
            </div>
            <div class="stat">
              <div class="lab">{m.stat2lab}</div>
              <div class="v">{m.stat2val}</div>
              <div class="s">{m.stat2sub}</div>
            </div>
          </div>
        {/if}
        <div class="small-meta">{m.tags}</div>
      </article>
    {/each}
  </div>
</section>

<!-- ═══════════════════════════════ TEAM / PERSON ════════════════════════ -->
<section class="w-section" id="ueber">
  <div class="head">
    <span class="num">03 / 04</span>
    <h2>Ein Mensch <em>macht die Arbeit.</em></h2>
    <span class="hint">Solo · seit 2022</span>
  </div>

  <div class="w-team">
    <div class="who">
      <div class="portrait">
        <img
          src="/brand/korczewski/kore-assets/portrait.jpg"
          alt="Patrick Korczewski"
          style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;border-radius:14px;"
          on:error={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
        />
        <div class="id">
          <b>Patrick Korczewski</b><br>
          {legal.jobtitle ?? 'Software Engineering & IT-Security'}
        </div>
      </div>
    </div>

    <div>
      <span class="role">Operator · Inhaber</span>
      <h3>Patrick <em>Korczewski</em></h3>
      <p class="bio">
        Manche Leute finden ihren Weg geradlinig. Ich habe meinen eher im Zickzack gefunden —
        und bin überzeugt, dass genau das der Grund ist, warum ich heute gute Beratung machen kann.
      </p>
      <p class="bio">
        B.Sc. IT-Sicherheit. Seit Tag 1 von ChatGPT mit KI in echten Projekten.
        Kubernetes in Produktion — multi-tenant, multi-cluster, mit GitOps.
        Ich baue Systeme, die ich hinterher selbst betreibe.
      </p>

      <dl class="credits">
        <dt>Studium</dt>
        <dd>B.Sc. IT-Sicherheit</dd>
        <dt>Expertise</dt>
        <dd>Kubernetes · KI-Integration · <em>Security</em></dd>
        <dt>Standort</dt>
        <dd>Lüneburg · Remote EU-weit</dd>
        <dt>Arbeitet mit</dt>
        <dd>Claude Code · FluxCD · k3s · Astro · Go</dd>
      </dl>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════ CONTACT ═══════════════════════════════ -->
<section class="w-section" id="kontakt">
  <div class="head">
    <span class="num">04 / 04</span>
    <h2>Gespräch innerhalb <em>einer Woche.</em></h2>
    <span class="hint">Kein Formular, kein Funnel</span>
  </div>

  <div class="w-contact">
    <div class="panel">
      <h3>Der direkte <em>Weg.</em></h3>
      <p>E-Mail oder Kontaktformular. Antwort innerhalb eines Werktages.</p>

      {#if contact.email}
        <div class="row">
          <span class="lab">E-Mail</span>
          <span class="v">
            <a href="mailto:{contact.email}">{contact.email}</a>
          </span>
        </div>
      {/if}
      {#if contact.phone}
        <div class="row">
          <span class="lab">Telefon</span>
          <span class="v">{contact.phone}</span>
        </div>
      {/if}
      {#if contact.city}
        <div class="row">
          <span class="lab">Standort</span>
          <span class="v">
            {contact.city}
            <span class="small">Remote-Zusammenarbeit bevorzugt</span>
          </span>
        </div>
      {/if}
      <div class="row">
        <span class="lab">Kontakt</span>
        <span class="v">
          <a href="/kontakt" style="color:var(--copper)">Kontaktformular →</a>
          <span class="small">Alle Anfragen, direkt und ohne CRM-Overhead</span>
        </span>
      </div>
    </div>

    <div class="booker">
      <span class="lab">Kennenlerngespräch</span>
      <h3>30 Minuten, <em>20 Euro.</em></h3>

      {#if bookingSlots.length > 0}
        <div class="slots">
          {#each bookingSlots as slot}
            <button
              type="button"
              class="slot {pickedSlot === slot.id ? 'sel' : ''}"
              style={pickedSlot === slot.id ? 'border-color:var(--copper);background:var(--copper-tint)' : ''}
              on:click={() => pickedSlot = slot.id}
            >
              <span class="day">{slot.day}</span>
              <span class="time">{slot.time}</span>
            </button>
          {/each}
        </div>
        {#if pickedSlot}
          <a class="btn primary" style="width:100%;margin-top:18px;justify-content:center" href="/termin">
            Termin bestätigen →
          </a>
        {:else}
          <p class="note">Alle Zeiten Europe/Berlin. Ich sende eine Kalendereinladung innerhalb einer Stunde.</p>
        {/if}
      {:else}
        <p class="note" style="margin-top:22px">
          Aktuell keine Slots verfügbar — schreiben Sie mir direkt per
          <a href="/kontakt" style="color:var(--copper)">Kontaktformular</a>.
        </p>
        <a class="btn primary" style="margin-top:18px" href="/kontakt">Anfrage senden →</a>
      {/if}
    </div>
  </div>
</section>

<!-- ═══════════════════════════════ TIMELINE ══════════════════════════════ -->
{#if wantsTimeline}
  <section class="timeline-kore" id="timeline">
    <div class="tl-head">
      <span class="eyebrow no-rule">Live aus der Entwicklung</span>
      <h2>Implementierte Features.</h2>
      <p class="lede" style="margin-top:14px">
        Jede gemergte Pull Request landet hier — direkt aus der Datenbank, ohne Filter.
      </p>
    </div>
    <Timeline initialRows={initialTimeline} />
  </section>
{/if}

<!-- ═══════════════════════════════ HEALTH DASHBOARD ═════════════════════ -->
<section class="w-section" id="health">
  <div class="head">
    <span class="num"><!-- dynamic --></span>
    <h2>Repo Health, <em>gemessen.</em></h2>
    <span class="hint">Mess-Stichtag: 2026-06-28</span>
  </div>
  <GoalsDashboard />
</section>

<!-- ═══════════════════════════════ FOOTER ════════════════════════════════ -->
<footer class="w-foot">
  <div class="w-foot-inner">
    <div>
      <div class="brand">
        Korczewski<span class="dot">.</span>
      </div>
      <p style="color:var(--mute);font-size:13px;margin-top:14px;font-family:var(--mono);line-height:1.6">
        Software Engineering & IT-Security.<br>
        {contact.city ?? 'Lüneburg'} · Remote EU-weit.
      </p>
    </div>

    {#each footerColumns as col}
      <div class="col">
        <h5>{col.heading}</h5>
        {#each col.links as link}
          <a href={link.href}>{link.label}</a>
        {/each}
      </div>
    {/each}
  </div>

  <div class="legal">
    <span>{footerCopyright}</span>
    <span>
      <a href="/impressum" style="color:inherit;text-decoration:none">Impressum</a>
      &nbsp;·&nbsp;
      <a href="/datenschutz" style="color:inherit;text-decoration:none">Datenschutz</a>
    </span>
  </div>
</footer>

<style>
  /* Timeline section — Kore-styled wrapper */
  .timeline-kore {
    max-width: 1280px;
    margin: 0 auto;
    padding: 80px 28px;
    border-top: 1px solid var(--line);
  }

  .tl-head {
    margin-bottom: 48px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--line);
  }

  .tl-head h2 {
    font-family: var(--serif);
    font-weight: 400;
    font-size: 38px;
    letter-spacing: -0.02em;
    margin: 12px 0 0;
    color: var(--fg);
  }

  /* Slot button — override default button reset */
  .slot {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
    border: 1px solid var(--line-2);
    border-radius: 12px;
    cursor: pointer;
    transition: all 200ms var(--ease);
    background: rgba(255, 255, 255, 0.02);
    text-align: left;
    width: 100%;
  }

  .slot:hover {
    border-color: var(--copper);
    background: var(--copper-tint);
  }
</style>
