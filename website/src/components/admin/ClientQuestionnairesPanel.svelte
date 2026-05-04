<!-- website/src/components/admin/ClientQuestionnairesPanel.svelte -->
<script lang="ts">
  type Props = { keycloakUserId: string };
  const { keycloakUserId }: Props = $props();

  type Assignment = { id: string; template_title: string; status: string; assigned_at: string; submitted_at: string | null };
  type Template = { id: string; title: string };

  let assignments: Assignment[] = $state([]);
  let templates: Template[] = $state([]);
  let selectedTemplateId = $state('');
  let assigning = $state(false);
  let assignMsg = $state('');

  async function loadData() {
    const [aRes, tRes] = await Promise.all([
      fetch(`/api/admin/questionnaires/assignments?keycloakUserId=${keycloakUserId}`),
      fetch('/api/admin/questionnaires/templates'),
    ]);
    assignments = aRes.ok ? await aRes.json() : [];
    const allTpls: Template[] = tRes.ok ? await tRes.json() : [];
    templates = allTpls.filter((t: any) => t.status === 'published');
  }

  $effect(() => { loadData(); });

  async function assign() {
    if (!selectedTemplateId) { assignMsg = 'Bitte eine Vorlage wählen.'; return; }
    assigning = true; assignMsg = '';
    try {
      const r = await fetch('/api/admin/questionnaires/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId, keycloakUserId }),
      });
      const data = await r.json();
      if (r.ok) {
        assignMsg = 'Fragebogen zugewiesen.';
        selectedTemplateId = '';
        await loadData();
      } else {
        assignMsg = data.error ?? 'Fehler.';
      }
    } finally { assigning = false; }
  }

  function statusBadge(s: string) {
    if (s === 'submitted' || s === 'reviewed') return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s === 'in_progress') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (s === 'dismissed') return 'bg-red-500/10 text-red-400 border-red-500/20';
    return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  }

  function statusLabel(s: string) {
    if (s === 'reviewed') return 'Besprochen';
    if (s === 'submitted') return 'Eingereicht';
    if (s === 'in_progress') return 'In Bearbeitung';
    if (s === 'dismissed') return 'Abgelehnt';
    return 'Ausstehend';
  }

  function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
</script>

<div class="p-4 bg-dark-light rounded-xl border border-dark-lighter">
  <h2 class="text-sm font-medium text-muted mb-3 uppercase tracking-wide">Fragebögen</h2>

  {#if templates.length > 0}
    <div class="flex gap-2 items-start mb-4">
      <select bind:value={selectedTemplateId}
        class="flex-1 bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none">
        <option value="">— Vorlage wählen —</option>
        {#each templates as t}
          <option value={t.id}>{t.title}</option>
        {/each}
      </select>
      <button onclick={assign} disabled={assigning || !selectedTemplateId}
        class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-50">
        {assigning ? '…' : 'Zuweisen'}
      </button>
    </div>
    {#if assignMsg}
      <p class={`text-xs mb-3 ${assignMsg.includes('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{assignMsg}</p>
    {/if}
  {:else}
    <p class="text-muted text-sm mb-4">
      Keine veröffentlichten Vorlagen.
      <a href="/admin/dokumente" class="text-gold hover:underline">Vorlagen erstellen →</a>
    </p>
  {/if}

  {#if assignments.length > 0}
    <div class="flex flex-col gap-2">
      {#each assignments as a}
        <div class="flex items-center justify-between gap-3 p-3 bg-dark rounded-lg border border-dark-lighter">
          <div class="flex-1 min-w-0">
            <p class="text-light text-sm truncate">{a.template_title}</p>
            <p class="text-muted text-xs mt-0.5">
              Zugewiesen: {fmtDate(a.assigned_at)}
              {a.submitted_at ? ` · Eingereicht: ${fmtDate(a.submitted_at)}` : ''}
            </p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class={`px-2 py-0.5 rounded border text-xs ${statusBadge(a.status)}`}>
              {statusLabel(a.status)}
            </span>
            {#if a.status === 'submitted' || a.status === 'reviewed'}
              <a href={`/admin/fragebogen/${a.id}`} class="text-xs text-gold hover:underline">Auswertung →</a>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
