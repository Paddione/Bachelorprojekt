<script lang="ts">
  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox';

  let {
    onNavigate,
    pendingQuestionnaires = 0,
    helpSection = '',
    helpContext = 'portal',
    pendingTickets = 0,
    pendingInbox = 0,
  }: {
    onNavigate: (view: View) => void;
    pendingQuestionnaires?: number;
    helpSection?: string;
    helpContext?: string;
    pendingTickets?: number;
    pendingInbox?: number;
  } = $props();

  const isAdmin = $derived(helpContext === 'admin');

  // SVG icon strings — same 16px viewBox style as AdminLayout icons
  const icons = {
    clipboard: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M5.5 2.5h5v2.5h-5V2.5z"/><rect x="3" y="2.5" width="10" height="12" rx="1"/><path d="M5.5 7.5h5M5.5 10.5h5M5.5 13.5h3"/></svg>`,
    bug: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><circle cx="8" cy="9" r="3.5"/><path d="M8 5.5V3.5M5 7H2.5M11 7h2.5M5.5 5l-2-2M10.5 5l2-2M5 12l-2 1.5M11 12l2 1.5"/></svg>`,
    tag: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M2 2.5h4.5l7 7a2 2 0 0 1 0 2.8l-2.2 2.2a2 2 0 0 1-2.8 0l-7-7V2.5z"/><circle cx="5.5" cy="5.5" r=".75" fill="currentColor" stroke="none"/></svg>`,
    inbox: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><rect x="2" y="3.5" width="12" height="10" rx="1"/><path d="M2 10h3.5l1.5 2 1.5-2H12"/></svg>`,
  };
</script>

<div class="home">
  <p class="greeting">Wie kann ich dir helfen?</p>

  <div class="cards">
    {#if isAdmin}
      <button class="card" onclick={() => onNavigate('tickets')}>
        <span class="card-icon">{@html icons.tag}</span>
        <div class="card-body">
          <span class="card-label">Anfragen</span>
          <span class="card-desc">Tickets erstellen &amp; bearbeiten</span>
        </div>
        {#if pendingTickets > 0}
          <span class="badge">{pendingTickets > 99 ? '99+' : pendingTickets}</span>
        {/if}
        <span class="chevron">›</span>
      </button>

      <button class="card" onclick={() => onNavigate('inbox')}>
        <span class="card-icon">{@html icons.inbox}</span>
        <div class="card-body">
          <span class="card-label">Postfach</span>
          <span class="card-desc">Nachrichten &amp; Anfragen</span>
        </div>
        {#if pendingInbox > 0}
          <span class="badge">{pendingInbox > 99 ? '99+' : pendingInbox}</span>
        {/if}
        <span class="chevron">›</span>
      </button>
    {/if}

    <button class="card" onclick={() => onNavigate('questionnaire')}>
      <span class="card-icon">{@html icons.clipboard}</span>
      <div class="card-body">
        <span class="card-label">Fragebögen</span>
        <span class="card-desc">Aufgaben beantworten</span>
      </div>
      {#if pendingQuestionnaires > 0}
        <span class="badge">{pendingQuestionnaires > 99 ? '99+' : pendingQuestionnaires}</span>
      {/if}
      <span class="chevron">›</span>
    </button>

    <button class="card" onclick={() => onNavigate('support')}>
      <span class="card-icon">{@html icons.bug}</span>
      <div class="card-body">
        <span class="card-label">Feedback &amp; Support</span>
        <span class="card-desc">Fehler melden, Ideen teilen</span>
      </div>
      <span class="chevron">›</span>
    </button>

    {#if helpSection}
      <button class="card" onclick={() => onNavigate('help')}>
        <span class="card-icon card-icon-help">?</span>
        <div class="card-body">
          <span class="card-label">Hilfe</span>
          <span class="card-desc">Kontexthilfe für diese Seite</span>
        </div>
        <span class="chevron">›</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .home {
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .greeting {
    font-size: 13px;
    color: var(--admin-text-mute, #8899aa);
    margin: 0;
    font-weight: 500;
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 12px;
    background: var(--admin-surface, #131f33);
    border: 1px solid var(--admin-border, #243049);
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
    width: 100%;
  }
  .card:hover {
    border-color: rgba(232, 200, 112, 0.4);
    background: #1a2438;
  }

  .card-icon {
    font-size: 20px;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--admin-text-mute, #8899aa);
  }

  .card-icon-help {
    background: #4f46e5;
    border-radius: 50%;
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    font-style: normal;
  }

  .card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-label {
    font-size: 13px;
    font-weight: 600;
    color: #e8e8f0;
  }

  .card-desc {
    font-size: 11px;
    color: var(--admin-text-mute, #5566aa);
  }

  .badge {
    flex-shrink: 0;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: #ef4444;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: monospace;
  }

  .chevron {
    font-size: 18px;
    color: #5566aa;
    flex-shrink: 0;
    line-height: 1;
  }
</style>
