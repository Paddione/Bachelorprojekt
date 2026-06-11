<script lang="ts">
  interface Entry {
    id: string; contact_type: string; subject?: string; content?: string;
    direction?: string; created_at: string;
  }
  interface Props { keycloakUserId: string; entries: Entry[]; }
  let { keycloakUserId, entries: initial }: Props = $props();

  let entries = $state<Entry[]>([...initial]);
  let contactType = $state('note');
  let subject = $state('');
  let content = $state('');
  let saving = $state(false);
  let error = $state('');

  const TYPES = [
    { v: 'email', label: 'E-Mail', icon: '📧' },
    { v: 'phone', label: 'Telefon', icon: '📞' },
    { v: 'meeting', label: 'Termin', icon: '🤝' },
    { v: 'note', label: 'Notiz', icon: '📝' },
  ];
  const icon = (t: string) => TYPES.find(x => x.v === t)?.icon ?? '•';
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });

  async function add() {
    if (!subject.trim()) { error = 'Betreff erforderlich.'; return; }
    saving = true; error = '';
    try {
      const res = await fetch('/api/admin/clients/contact-history/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keycloak_user_id: keycloakUserId, contact_type: contactType, subject, content }),
      });
      if (res.ok) {
        const j = await res.json();
        entries = [j.entry, ...entries];
        subject = ''; content = '';
      } else { const j = await res.json().catch(() => ({})); error = j.error || 'Fehler.'; }
    } catch { error = 'Netzwerkfehler.'; }
    finally { saving = false; }
  }
</script>

<div class="rounded-lg border border-[#30363d] bg-[#161b22] p-5 mt-4">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-xs font-mono uppercase tracking-widest text-[#a3a3a3]">Kontakthistorie</h3>
  </div>

  <div class="rounded-md border border-[#30363d] bg-[#0d1117] p-3 mb-5">
    <div class="flex flex-wrap gap-2 mb-2">
      <select bind:value={contactType} class="bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-sm text-[#e5e5e5]">
        {#each TYPES as t}<option value={t.v}>{t.icon} {t.label}</option>{/each}
      </select>
      <input bind:value={subject} maxlength="200" placeholder="Betreff"
        class="flex-1 min-w-40 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-sm text-[#e5e5e5]" />
    </div>
    <textarea bind:value={content} maxlength="5000" rows="2" placeholder="Notiz (optional)"
      class="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-sm text-[#e5e5e5] mb-2"></textarea>
    <div class="flex items-center gap-3">
      <button onclick={add} disabled={saving}
        class="px-3 py-1 bg-[#f59e0b] text-[#0d1117] rounded text-sm font-semibold hover:bg-[#d97706] disabled:opacity-50">
        {saving ? '...' : '+ Eintrag'}
      </button>
      {#if error}<span class="text-xs text-[#ef4444]">{error}</span>{/if}
    </div>
  </div>

  {#if entries.length === 0}
    <p class="text-sm text-[#737373]">Noch keine Einträge.</p>
  {:else}
    <ul class="flex flex-col gap-3">
      {#each entries as e}
        <li class="flex gap-3 border-l-2 border-[#30363d] pl-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 text-sm">
              <span>{icon(e.contact_type)}</span>
              <span class="font-mono text-xs text-[#a3a3a3]">{fmt(e.created_at)}</span>
              <span class="text-[#e5e5e5] font-medium">{e.subject ?? '—'}</span>
            </div>
            {#if e.content}<p class="text-xs text-[#a3a3a3] mt-0.5 whitespace-pre-wrap">{e.content}</p>{/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
