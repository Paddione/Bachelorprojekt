<script lang="ts">
  import { decideBanner, type BannerDecision } from '../../lib/assistant/sidekick-nudge';

  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox' | 'agent-guide' | 'mediaviewer';

  let {
    onNavigate,
    onClose,
    pendingQuestionnaires = 0,
    helpSection = '',
    helpContext = 'portal',
    pendingTickets = 0,
    pendingInbox = 0,
    summary = null,
  }: {
    onNavigate: (view: View) => void;
    onClose?: () => void;
    pendingQuestionnaires?: number;
    helpSection?: string;
    helpContext?: string;
    pendingTickets?: number;
    pendingInbox?: number;
    summary?: { done: number; total: number; pct: number } | null;
  } = $props();

  const banner = $derived<BannerDecision | null>(decideBanner(summary));
  const progressSub = $derived(
    summary && summary.total > 0 ? `${summary.done}/${summary.total} gelernt` : null
  );

  const isAdmin = $derived(helpContext === 'admin');

  type Item = { id: View; no: string; title: string; sub: string; badge?: number; show?: boolean; href?: string };

  const items = $derived<Item[]>([
    { id: 'tickets',       no: '01', title: 'Anfragen',           sub: 'Tickets erstellen & bearbeiten', badge: pendingTickets > 0 ? pendingTickets : undefined,       show: isAdmin },
    { id: 'inbox',         no: '02', title: 'Postfach',           sub: 'Nachrichten & Anfragen',         badge: pendingInbox > 0 ? pendingInbox : undefined,           show: isAdmin },
    { id: 'questionnaire', no: isAdmin ? '03' : '01', title: 'Fragebögen', sub: 'Aufgaben beantworten', badge: pendingQuestionnaires > 0 ? pendingQuestionnaires : undefined, show: true },
    { id: 'support',       no: isAdmin ? '04' : '02', title: 'Feedback & Support', sub: 'Fehler melden, Ideen teilen', show: true },
    { id: 'agent-guide',   no: isAdmin ? '05' : '03', title: 'Agent-Anleitung', sub: progressSub ? `Lernen · ${progressSub}` : 'Lernen, wie alles funktioniert', show: true },
    { id: 'loslernen',     no: isAdmin ? '06' : '04', title: 'Lernpfad',     sub: progressSub ?? 'Fortschritt verfolgen',            show: true, href: '/portal/loslernen' },
    { id: 'mediaviewer',   no: isAdmin ? '07' : '05', title: 'Mediaviewer', sub: 'Hilfe- & Onboarding-Videos', show: true },
    { id: 'help',          no: isAdmin ? '08' : '06', title: 'Hilfe',        sub: 'Kontexthilfe für diese Seite', show: !!helpSection },
  ].filter(i => i.show));

  let hover = $state<string | null>(null);
</script>

<div class="sk-home">
  <!-- Eyebrow + headline -->
  <div class="sk-intro">
    <div class="sk-eyebrow">
      <span class="sk-eyebrow-bar" aria-hidden="true"></span>
      Helpdesk · {String(items.length).padStart(2, '0')} Bereiche
    </div>
    <h2 class="sk-headline">
      Womit kann ich Ihnen <em>helfen?</em>
    </h2>
    <p class="sk-sub">Kein Skript, kein Bot — direkter Zugang zu Tickets, Nachrichten und Kontexthilfe.</p>
  </div>

  {#if banner}
    {#if banner.cta}
      <button type="button" class="sk-banner sk-banner--{banner.kind}" onclick={() => { onClose?.(); window.location.href = '/portal/loslernen'; }}>
        <span class="sk-banner-label">{banner.label}</span>
        <span class="sk-banner-arrow" aria-hidden="true">→</span>
      </button>
    {:else}
      <div class="sk-banner sk-banner--done" role="status">
        <span class="sk-banner-label">{banner.label}</span>
      </div>
    {/if}
  {/if}

  <!-- Numbered item list -->
  <div class="sk-list" role="list">
    {#each items as item (item.id)}
      {#if item.href}
        <a
          href={item.href}
          class="sk-row sk-row--link"
          class:sk-row--hover={hover === item.id}
          onmouseenter={() => hover = item.id}
          onmouseleave={() => hover = null}
          onclick={() => onClose?.()}
          role="listitem"
          aria-label="{item.title} — {item.sub}"
        >
          <span class="sk-no" class:sk-no--active={hover === item.id}>{item.no}</span>
          <span class="sk-body">
            <span class="sk-item-title">{item.title}</span>
            <span class="sk-item-sub">{item.sub}</span>
          </span>
          <span class="sk-badge-slot"></span>
          <span class="sk-arrow" class:sk-arrow--active={hover === item.id} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M13 5l7 7-7 7"/>
            </svg>
          </span>
        </a>
      {:else}
        <button
          class="sk-row"
          class:sk-row--hover={hover === item.id}
          onmouseenter={() => hover = item.id}
          onmouseleave={() => hover = null}
          onclick={() => onNavigate(item.id)}
          role="listitem"
          aria-label="{item.title} — {item.sub}"
        >
          <span class="sk-no" class:sk-no--active={hover === item.id}>{item.no}</span>

          <span class="sk-body">
            <span class="sk-item-title">{item.title}</span>
            <span class="sk-item-sub">{item.sub}</span>
          </span>

          <span class="sk-badge-slot">
            {#if item.badge}
              <span class="sk-brass-badge">{Math.min(99, item.badge)}</span>
            {/if}
          </span>

          <span class="sk-arrow" class:sk-arrow--active={hover === item.id} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M13 5l7 7-7 7"/>
            </svg>
          </span>
        </button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .sk-home {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  /* ── Intro block ── */
  .sk-intro {
    padding: 32px 22px 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sk-eyebrow {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--brass);
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  .sk-eyebrow-bar {
    width: 22px;
    height: 1px;
    background: currentColor;
    opacity: 0.8;
    flex-shrink: 0;
  }

  .sk-headline {
    margin: 0;
    font-family: var(--serif);
    font-size: 28px;
    line-height: 1.08;
    letter-spacing: -0.02em;
    font-weight: 400;
    color: var(--fg);
  }

  .sk-headline em {
    font-style: italic;
    font-weight: 400;
    color: var(--brass-2);
  }

  .sk-sub {
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    color: var(--fg-soft);
    max-width: 38ch;
  }

  /* ── Item list ── */
  .sk-list {
    margin-top: 22px;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
  }

  .sk-row {
    display: grid;
    grid-template-columns: 40px 1fr auto 32px;
    align-items: center;
    gap: 14px;
    padding: 20px 22px;
    min-height: 64px;            /* tap target ≥44px even on smallest items */
    border: none;
    border-bottom: 1px solid var(--line);
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    position: relative;
    transition: background 220ms var(--ease-out, ease);
    width: 100%;
  }
  .sk-row:focus-visible {
    outline: 2px solid var(--brass);
    outline-offset: -2px;
  }

  .sk-row--link {
    text-decoration: none;
    color: inherit;
  }

  .sk-row--hover {
    background: linear-gradient(
      to right,
      transparent,
      oklch(0.80 0.09 75 / 0.06),
      transparent
    );
  }

  .sk-no {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--mute-2);
    transition: color 180ms var(--ease-out, ease);
  }

  .sk-no--active {
    color: var(--brass);
  }

  .sk-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .sk-item-title {
    font-family: var(--serif);
    font-size: 20px;
    line-height: 1.15;
    letter-spacing: -0.015em;
    font-weight: 400;
    color: var(--fg);
  }

  .sk-item-sub {
    font-size: 13px;
    color: var(--mute);
    line-height: 1.45;
  }

  .sk-badge-slot {
    display: flex;
    justify-content: flex-end;
    min-width: 24px;
  }

  .sk-brass-badge {
    min-width: 24px;
    height: 24px;
    padding: 0 8px;
    border-radius: var(--radius-pill, 999px);
    background: var(--brass);
    color: var(--ink-900);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sk-arrow {
    width: 30px;
    height: 30px;
    border-radius: var(--radius-pill, 999px);
    border: 1px solid var(--line-2);
    background: transparent;
    color: var(--mute);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: border-color 200ms var(--ease-out, ease),
                background 200ms var(--ease-out, ease),
                color 200ms var(--ease-out, ease);
    flex-shrink: 0;
  }

  .sk-arrow--active {
    border-color: var(--brass);
    background: var(--brass);
    color: var(--ink-900);
  }

  @media (max-width: 480px) {
    .sk-intro { padding: 28px 18px 10px; }
    .sk-headline { font-size: 26px; }
    .sk-row { padding: 18px; grid-template-columns: 36px 1fr auto 28px; }
  }

  .sk-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: calc(100% - 44px);
    margin: 4px 22px 0;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid var(--brass, #b8860b);
    background: oklch(0.80 0.09 75 / 0.08);
    color: var(--fg);
    font-size: 14px;
    cursor: pointer;
    text-align: left;
    transition: background 180ms var(--ease-out, ease);
  }
  .sk-banner:hover { background: oklch(0.80 0.09 75 / 0.16); }
  .sk-banner--done { cursor: default; opacity: 0.85; }
  .sk-banner-label { font-family: var(--serif); }
  .sk-banner-arrow { color: var(--brass, #b8860b); }
  @media (max-width: 480px) { .sk-banner { width: calc(100% - 36px); margin: 4px 18px 0; } }
</style>
