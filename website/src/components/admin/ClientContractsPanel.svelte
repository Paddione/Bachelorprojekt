<script lang="ts">
  type Props = {
    keycloakUserId: string;
    clientEmail: string;
    isNewsletterSubscribed: boolean;
  };

  const { keycloakUserId, clientEmail, isNewsletterSubscribed }: Props = $props();

  type Template = { id: string; title: string };
  type Assignment = {
    id: string;
    template_title: string;
    status: string;
    assigned_at: string;
    signed_at: string | null;
    docuseal_embed_src: string | null;
  };

  // ── Newsletter toggle ─────────────────────────────────────────────
  let subscribed = $state(isNewsletterSubscribed);
  let nlLoading = $state(false);
  let nlMsg = $state('');

  async function toggleNewsletter() {
    nlLoading = true; nlMsg = '';
    try {
      const res = await fetch('/api/admin/clients/newsletter-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keycloakUserId, subscribe: !subscribed }),
      });
      if (res.ok) {
        subscribed = !subscribed;
        nlMsg = subscribed ? 'Als Abonnent hinzugefügt.' : 'Abonnent entfernt.';
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        nlMsg = d.error ?? 'Fehler.';
      }
    } catch {
      nlMsg = 'Netzwerkfehler.';
    } finally {
      nlLoading = false;
    }
  }

  // ── Contract assignment ───────────────────────────────────────────
  let templates: Template[] = $state([]);
  let assignments: Assignment[] = $state([]);
  let selectedTemplateId = $state('');
  let assigning = $state(false);
  let assignMsg = $state('');

  async function loadData() {
    try {
      const [tRes, aRes] = await Promise.all([
        fetch('/api/admin/documents/templates'),
        fetch(`/api/admin/documents/assignments?keycloakUserId=${keycloakUserId}`),
      ]);
      templates = tRes.ok ? await tRes.json() : [];
      assignments = aRes.ok ? await aRes.json() : [];
    } catch {
      // silently ignore
    }
  }

  $effect(() => { loadData(); });

  async function assignContract() {
    if (!selectedTemplateId) { assignMsg = 'Bitte eine Vorlage wählen.'; return; }
    assigning = true; assignMsg = '';
    try {
      const res = await fetch('/api/admin/documents/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId, keycloakUserId }),
      });
      const data = await res.json();
      if (res.ok) {
        assignMsg = 'Vertrag zugewiesen.';
        selectedTemplateId = '';
        await loadData();
      } else {
        assignMsg = data.error ?? 'Fehler beim Zuweisen.';
      }
    } finally {
      assigning = false;
    }
  }

  function statusBadge(s: string) {
    if (s === 'completed') return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s === 'expired') return 'bg-red-500/10 text-red-400 border-red-500/20';
    return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  }

  function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
</script>

<!-- Newsletter Subscription -->
<div class="mb-6 p-4 bg-dark-light rounded-xl border border-dark-lighter">
  <h2 class="text-sm font-medium text-muted mb-3 uppercase tracking-wide">Newsletter</h2>
  <label class="flex items-center gap-3 cursor-pointer">
    <input
      type="checkbox"
      checked={subscribed}
      disabled={nlLoading}
      onchange={toggleNewsletter}
      class="accent-gold w-4 h-4"
    />
    <span class="text-sm text-light">
      {subscribed ? 'Newsletter-Abonnent (bestätigt)' : 'Kein Newsletter-Abonnent'}
    </span>
  </label>
  {#if nlMsg}
    <p class={`text-xs mt-2 ${nlMsg.includes('Fehler') || nlMsg.includes('fehler') ? 'text-red-400' : 'text-green-400'}`}>{nlMsg}</p>
  {/if}
</div>

<!-- Contract Assignment -->
<div class="p-4 bg-dark-light rounded-xl border border-dark-lighter">
  <h2 class="text-sm font-medium text-muted mb-3 uppercase tracking-wide">Vertrag zuweisen</h2>

  {#if templates.length > 0}
    <div class="flex gap-2 items-start mb-4">
      <select
        bind:value={selectedTemplateId}
        class="flex-1 bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
      >
        <option value="">— Vorlage wählen —</option>
        {#each templates as t}
          <option value={t.id}>{t.title}</option>
        {/each}
      </select>
      <button
        onclick={assignContract}
        disabled={assigning || !selectedTemplateId}
        class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 transition-colors disabled:opacity-50"
      >
        {assigning ? '…' : 'Zuweisen'}
      </button>
    </div>
    {#if assignMsg}
      <p class={`text-xs mb-3 ${assignMsg.includes('Fehler') || assignMsg.includes('fehler') ? 'text-red-400' : 'text-green-400'}`}>{assignMsg}</p>
    {/if}
  {:else}
    <p class="text-muted text-sm mb-4">
      Noch keine Vorlagen.
      <a href="/admin/dokumente" class="text-gold hover:underline">Vorlagen erstellen →</a>
    </p>
  {/if}

  {#if assignments.length > 0}
    <h3 class="text-xs text-muted uppercase tracking-wide mb-2">Zugewiesene Verträge</h3>
    <div class="flex flex-col gap-2">
      {#each assignments as a}
        <div class="flex items-center justify-between gap-3 p-3 bg-dark rounded-lg border border-dark-lighter">
          <div class="flex-1 min-w-0">
            <p class="text-light text-sm truncate">{a.template_title}</p>
            <p class="text-muted text-xs mt-0.5">Zugewiesen: {fmtDate(a.assigned_at)}{a.signed_at ? ` · Unterschrieben: ${fmtDate(a.signed_at)}` : ''}</p>
          </div>
          <span class={`px-2 py-0.5 rounded border text-xs flex-shrink-0 ${statusBadge(a.status)}`}>
            {a.status === 'completed' ? 'Unterschrieben' : a.status === 'expired' ? 'Abgelaufen' : 'Ausstehend'}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>
