<script lang="ts">
  interface Props {
    keycloakUserId: string;
    status: string;
    acquisitionSource: string;
    tags: string[];
  }
  let { keycloakUserId, status: initialStatus, acquisitionSource: initialSrc, tags: initialTags }: Props = $props();

  const STATUSES = ['aktiv', 'inaktiv', 'potentiell', 'pausiert', 'abgeschlossen'];
  let status = $state(initialStatus || 'aktiv');
  let acquisitionSource = $state(initialSrc || '');
  let tags = $state<string[]>([...initialTags]);
  let newTag = $state('');
  let saving = $state(false);
  let message = $state('');
  let error = $state('');

  function addTag() {
    const t = newTag.trim();
    if (t && !tags.includes(t) && tags.length < 20) { tags = [...tags, t]; newTag = ''; }
  }
  function removeTag(t: string) { tags = tags.filter(x => x !== t); }

  async function save() {
    saving = true; message = ''; error = '';
    try {
      const res = await fetch('/api/admin/clients/update-crm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keycloak_user_id: keycloakUserId, customer_status: status, acquisition_source: acquisitionSource, tags }),
      });
      if (res.ok) message = 'Gespeichert.';
      else { const j = await res.json().catch(() => ({})); error = j.error || 'Fehler.'; }
    } catch { error = 'Netzwerkfehler.'; }
    finally { saving = false; }
  }

  const STATUS_COLOR: Record<string, string> = {
    aktiv: 'text-[#22c55e] border-[#22c55e]/40',
    inaktiv: 'text-[#737373] border-[#30363d]',
    potentiell: 'text-[#f59e0b] border-[#f59e0b]/40',
    pausiert: 'text-[#eab308] border-[#eab308]/40',
    abgeschlossen: 'text-[#a3a3a3] border-[#30363d]',
  };
</script>

<div class="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
  <h3 class="text-xs font-mono uppercase tracking-widest text-[#a3a3a3] mb-4">CRM-Status</h3>
  <div class="flex flex-wrap items-center gap-4 mb-4">
    <label class="flex items-center gap-2 text-sm text-[#e5e5e5]">
      Status
      <select bind:value={status} class="bg-[#0d1117] border {STATUS_COLOR[status] ?? 'border-[#30363d]'} rounded px-2 py-1 text-sm">
        {#each STATUSES as s}<option value={s}>{s}</option>{/each}
      </select>
    </label>
    <label class="flex items-center gap-2 text-sm text-[#e5e5e5]">
      Akquisition
      <input bind:value={acquisitionSource} maxlength="100" placeholder="z. B. Weiterempfehlung"
        class="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm text-[#e5e5e5]" />
    </label>
  </div>
  <div class="mb-4">
    <div class="flex flex-wrap gap-2 mb-2">
      {#each tags as t}
        <span class="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-[#21262d] text-[#e5e5e5] border border-[#30363d]">
          {t}<button type="button" onclick={() => removeTag(t)} class="text-[#737373] hover:text-[#ef4444]" aria-label="Tag entfernen">×</button>
        </span>
      {/each}
    </div>
    <div class="flex items-center gap-2">
      <input bind:value={newTag} maxlength="40" onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
        placeholder="+ Tag" class="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs text-[#e5e5e5] w-40" />
      <button type="button" onclick={addTag} class="text-xs px-2 py-1 border border-[#30363d] rounded text-[#a3a3a3] hover:border-[#f59e0b]/40">Hinzufügen</button>
    </div>
  </div>
  <div class="flex items-center gap-3">
    <button onclick={save} disabled={saving}
      class="px-4 py-1.5 bg-[#f59e0b] text-[#0d1117] rounded text-sm font-semibold hover:bg-[#d97706] disabled:opacity-50">
      {saving ? '...' : 'Speichern'}
    </button>
    {#if message}<span class="text-xs text-[#22c55e]">{message}</span>{/if}
    {#if error}<span class="text-xs text-[#ef4444]">{error}</span>{/if}
  </div>
</div>
