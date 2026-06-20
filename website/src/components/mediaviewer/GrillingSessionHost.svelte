<script lang="ts">
  import MediaviewerPanel from '../MediaviewerPanel.svelte';
  import { buildGrillingSessionData, type GrillingSessionData } from '../../lib/tickets/final-grilling';

  let {
    mediaviewerHost,
    ticketId,
    sessionType = 'final-grilling-v1',
  }: {
    mediaviewerHost: string;
    ticketId: string;
    sessionType?: string;
  } = $props();

  let grillingData = $state<GrillingSessionData | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    (async () => {
      loading = true;
      error = null;
      try {
        const res = await fetch(`/api/admin/tickets/${ticketId}`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`Ticket-API Fehler: ${res.status}`);
        const ticket = await res.json() as {
          external_id: string;
          title: string;
          body?: string;
          grilling_answers?: Record<string, Record<string, string>>;
          attachments?: Array<{ filename: string; url: string; mimetype: string }>;
        };
        grillingData = buildGrillingSessionData(ticket, sessionType);
      } catch (e) {
        error = e instanceof Error ? e.message : 'Unbekannter Fehler';
      } finally {
        loading = false;
      }
    })();
  });

  async function handleGrillingAnswer(questionId: string, answer: string) {
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          grilling_answers: {
            [sessionType]: {
              [questionId]: answer,
            },
          },
        }),
      });
      if (!res.ok) throw new Error(`PATCH fehlgeschlagen: ${res.status}`);
    } catch {
      /* fail-soft */
    }
  }

  async function handleGrillingComplete(answers: Record<string, string>) {
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          grilling_answers: {
            [sessionType]: answers,
          },
        }),
      });
      if (!res.ok) throw new Error(`PATCH fehlgeschlagen: ${res.status}`);
    } catch {
      /* fail-soft */
    }
  }
</script>

{#if loading}
  <div class="gh-loading">Grilling-Daten werden geladen …</div>
{:else if error}
  <div class="gh-error">Fehler: {error}</div>
{:else if grillingData}
  <MediaviewerPanel
    {mediaviewerHost}
    videos={[]}
    mode="grilling"
    {grillingData}
    onGrillingAnswer={handleGrillingAnswer}
    onGrillingComplete={handleGrillingComplete}
  />
{:else}
  <div class="gh-loading">Keine Daten verfügbar.</div>
{/if}

<style>
  .gh-loading,
  .gh-error {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--mute, #888);
    font-size: 14px;
    padding: 24px;
  }
  .gh-error {
    color: oklch(0.65 0.18 25);
  }
</style>
