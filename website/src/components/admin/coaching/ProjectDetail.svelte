<script lang="ts">
  import type { CoachingProject } from '../../../lib/coaching-project-db';
  import type { Session } from '../../../lib/coaching-session-db';

  let {
    project: initialProject,
    sessions: initialSessions,
  }: { project: CoachingProject; sessions: Session[] } = $props();

  let project = $state<CoachingProject>(initialProject);
  let sessions = $state<Session[]>(initialSessions);

  let kiContext = $state(project.kiContext ?? '');
  let notes = $state(project.notes ?? '');
  let displayAlias = $state(project.displayAlias ?? '');

  let savingContext = $state(false);
  let savingNotes = $state(false);
  let msgContext = $state('');
  let msgNotes = $state('');

  async function saveContext() {
    savingContext = true; msgContext = '';
    const res = await fetch(`/api/admin/coaching/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kiContext, displayAlias }),
    });
    if (res.ok) {
      const json = await res.json();
      project = json.project;
      msgContext = 'Gespeichert.';
    } else {
      msgContext = 'Fehler beim Speichern.';
    }
    savingContext = false;
  }

  async function saveNotes() {
    savingNotes = true; msgNotes = '';
    const res = await fetch(`/api/admin/coaching/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    if (res.ok) { msgNotes = 'Gespeichert.'; }
    else { msgNotes = 'Fehler beim Speichern.'; }
    savingNotes = false;
  }

  function fmtDate(d: Date | string | null | undefined) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const STATUS_LABELS: Record<string, string> = {
    active: 'Läuft', paused: 'Pause', completed: 'Abgeschlossen', abandoned: 'Abgebrochen',
  };
</script>

<div class="detail">
  <div class="header">
    <div class="header-left">
      <span class="kunden-nr">{project.customerNumber}</span>
      <span class="session-count">{sessions.length} {sessions.length === 1 ? 'Session' : 'Sessions'}</span>
    </div>
    <a href="/admin/coaching/sessions/new" class="btn-primary">+ Neue Session</a>
  </div>

  <!-- KI-Kontext -->
  <section class="card">
    <h2 class="card-title">KI-Kontext <span class="hint">(wird an KI übergeben — nur anonym formulieren)</span></h2>
    <div class="field">
      <label class="label" for="display-alias">Interner Bezeichner (nur für Coach)</label>
      <input id="display-alias" class="input" type="text" bind:value={displayAlias} placeholder="z.B. Firma Müller oder leer lassen" />
    </div>
    <div class="field">
      <label class="label" for="ki-context">Dauerhafter Kontext für die KI</label>
      <textarea id="ki-context" class="textarea" rows={5} bind:value={kiContext}
        placeholder="z.B. Klient befindet sich in einer beruflichen Neuorientierung. Schwerpunkt: Entscheidungsfindung."
      ></textarea>
    </div>
    {#if msgContext}<div class="msg">{msgContext}</div>{/if}
    <button class="btn-save" onclick={saveContext} disabled={savingContext}>
      {savingContext ? 'Speichere…' : 'KI-Kontext speichern'}
    </button>
  </section>

  <!-- Coach-Notizen -->
  <section class="card">
    <h2 class="card-title">Coach-Notizen <span class="hint">(privat — nie an KI übergeben)</span></h2>
    <div class="field">
      <textarea class="textarea" rows={4} bind:value={notes}
        placeholder="Interne Beobachtungen, Hintergrundinformationen, Erinnerungen…"
      ></textarea>
    </div>
    {#if msgNotes}<div class="msg">{msgNotes}</div>{/if}
    <button class="btn-save" onclick={saveNotes} disabled={savingNotes}>
      {savingNotes ? 'Speichere…' : 'Notizen speichern'}
    </button>
  </section>

  <!-- Sessions -->
  <section class="card">
    <h2 class="card-title">Sessions</h2>
    {#if sessions.length === 0}
      <p class="empty">Noch keine Sessions für dieses Projekt.</p>
    {:else}
      <table class="table">
        <thead>
          <tr>
            <th>Titel</th>
            <th>Datum</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each sessions as s (s.id)}
            <tr>
              <td><a href={`/admin/coaching/sessions/${s.id}`}>{s.title}</a></td>
              <td>{fmtDate(s.createdAt)}</td>
              <td><span class="badge badge-{s.status}">{STATUS_LABELS[s.status] ?? s.status}</span></td>
              <td><a href={`/admin/coaching/sessions/${s.id}`} class="btn-sm">Öffnen</a></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</div>

<style>
  .detail { max-width: 800px; margin: 0 auto; padding: 1rem 1.5rem 3rem; display: flex; flex-direction: column; gap: 1.5rem; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
  .header-left { display: flex; align-items: center; gap: 1rem; }
  .kunden-nr { font-family: monospace; font-size: 1.5rem; font-weight: 700; color: var(--gold,#c9a55c); }
  .session-count { font-size: 0.85rem; color: var(--text-muted,#888); }
  .btn-primary { padding: 0.5rem 1.2rem; background: var(--gold,#c9a55c); color: #111; font-weight: 700; border-radius: 6px; text-decoration: none; font-size: 0.85rem; }
  .card { background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .card-title { font-size: 1rem; font-weight: 700; color: var(--text-light,#f0f0f0); margin: 0; }
  .hint { font-size: 0.75rem; color: var(--text-muted,#888); font-weight: 400; }
  .field { display: flex; flex-direction: column; gap: 0.35rem; }
  .label { font-size: 0.78rem; color: var(--text-muted,#888); }
  .input, .textarea { background: var(--bg,#111); border: 1px solid var(--line,#333); border-radius: 6px; padding: 0.55rem 0.75rem; color: var(--text-light,#f0f0f0); font-size: 0.88rem; outline: none; width: 100%; box-sizing: border-box; }
  .textarea { resize: vertical; font-family: inherit; }
  .input:focus, .textarea:focus { border-color: var(--gold,#c9a55c); }
  .btn-save { align-self: flex-start; padding: 0.45rem 1.1rem; background: var(--gold,#c9a55c); color: #111; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
  .btn-save:disabled { opacity: 0.5; cursor: default; }
  .msg { font-size: 0.82rem; color: var(--gold,#c9a55c); }
  .table { width: 100%; border-collapse: collapse; }
  .table th { text-align: left; padding: 0.4rem 0.6rem; font-size: 0.78rem; color: var(--text-muted,#888); border-bottom: 1px solid var(--line,#333); }
  .table td { padding: 0.55rem 0.6rem; font-size: 0.88rem; border-bottom: 1px solid var(--line,#222); }
  .table a { color: var(--gold,#c9a55c); text-decoration: none; }
  .badge { font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; }
  .badge-active { color: #60a5fa; } .badge-paused { color: #f59e0b; }
  .badge-completed { color: #4ade80; } .badge-abandoned { color: #94a3b8; }
  .btn-sm { padding: 0.3rem 0.7rem; border: 1px solid var(--line,#444); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted,#888); text-decoration: none; }
  .empty { color: var(--text-muted,#888); font-size: 0.88rem; }
</style>
