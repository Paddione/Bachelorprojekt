<script lang="ts">
  type View = 'home' | 'support' | 'questionnaire' | 'help';

  let {
    onNavigate,
    pendingQuestionnaires = 0,
    helpSection = '',
    helpContext = 'portal',
  }: {
    onNavigate: (view: View) => void;
    pendingQuestionnaires?: number;
    helpSection?: string;
    helpContext?: string;
  } = $props();
</script>

<div class="home">
  <p class="greeting">Wie kann ich dir helfen?</p>

  <div class="cards">
    <button class="card" onclick={() => onNavigate('questionnaire')}>
      <span class="card-icon">📋</span>
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
      <span class="card-icon">🐞</span>
      <div class="card-body">
        <span class="card-label">Feedback & Support</span>
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
    color: #8899aa;
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
    background: #0f1623;
    border: 1px solid #243049;
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
    width: 100%;
  }
  .card:hover {
    border-color: #e8c870;
    background: #1a2438;
  }

  .card-icon {
    font-size: 22px;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
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
    color: #5566aa;
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
