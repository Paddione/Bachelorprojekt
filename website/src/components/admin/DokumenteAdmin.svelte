<script lang="ts">
  type Assignment = {
    id: string;
    customer_name: string | null;
    customer_email: string | null;
    template_title: string;
    status: 'pending' | 'completed' | 'expired' | 'revoked';
    assigned_at: string;
    signed_at: string | null;
  };

  let { assignments = [] }: { assignments: Assignment[] } = $props();

  const PAGE_SIZE = 20;
  let statusFilter: 'all' | Assignment['status'] = $state('all');
  let page = $state(0);

  let filtered = $derived(
    statusFilter === 'all'
      ? assignments
      : assignments.filter((a) => a.status === statusFilter),
  );
  let totalPages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  let pageRows = $derived(filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE));

  $effect(() => {
    void statusFilter;
    page = 0;
  });

  const badgeClass: Record<Assignment['status'], string> = {
    pending: 'bg-yellow-500/20 text-yellow-300',
    completed: 'bg-green-500/20 text-green-300',
    expired: 'bg-red-500/20 text-red-300',
    revoked: 'bg-gray-500/20 text-gray-300',
  };
  const statusLabel: Record<Assignment['status'], string> = {
    pending: 'Offen',
    completed: 'Signiert',
    expired: 'Abgelaufen',
    revoked: 'Widerrufen',
  };

  function fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function previewUrl(id: string): string {
    return `/api/admin/documents/assignments/${id}/pdf?inline=1`;
  }
  function downloadUrl(id: string): string {
    return `/api/admin/documents/assignments/${id}/pdf`;
  }
</script>

<div class="flex items-center gap-2 mb-4">
  <label for="statusFilter" class="text-sm text-muted">Status:</label>
  <select
    id="statusFilter"
    bind:value={statusFilter}
    class="bg-dark border border-dark-lighter rounded-lg px-3 py-1.5 text-light text-sm focus:border-gold outline-none"
  >
    <option value="all">Alle</option>
    <option value="pending">Offen</option>
    <option value="completed">Signiert</option>
    <option value="expired">Abgelaufen</option>
    <option value="revoked">Widerrufen</option>
  </select>
  <span class="text-muted text-sm ml-auto">{filtered.length} Zuweisung{filtered.length !== 1 ? 'en' : ''}</span>
</div>

{#if pageRows.length === 0}
  <p class="text-muted text-sm">Keine Zuweisungen.</p>
{:else}
  <div class="flex flex-col gap-2">
    {#each pageRows as a (a.id)}
      <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter flex items-center justify-between gap-4">
        <div class="flex-1 min-w-0">
          <p class="text-light font-medium truncate">{a.customer_name ?? a.customer_email ?? 'Unbekannt'}</p>
          <p class="text-muted text-xs mt-0.5 truncate">
            {a.template_title} · zugewiesen {fmtDate(a.assigned_at)}
            {#if a.signed_at} · signiert {fmtDate(a.signed_at)}{/if}
          </p>
        </div>
        <span class={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${badgeClass[a.status]}`}>
          {statusLabel[a.status]}
        </span>
        <div class="flex items-center gap-3 flex-shrink-0">
          <a href={previewUrl(a.id)} target="_blank" rel="noopener" class="text-xs text-gold hover:text-gold/80 transition-colors">Vorschau</a>
          <a href={downloadUrl(a.id)} class="text-xs text-muted hover:text-light transition-colors">Download</a>
        </div>
      </div>
    {/each}
  </div>

  {#if totalPages > 1}
    <div class="flex items-center justify-center gap-4 mt-6">
      <button
        onclick={() => (page = Math.max(0, page - 1))}
        disabled={page === 0}
        class="px-3 py-1.5 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light disabled:opacity-40"
      >Zurück</button>
      <span class="text-muted text-sm">Seite {page + 1} / {totalPages}</span>
      <button
        onclick={() => (page = Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        class="px-3 py-1.5 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light disabled:opacity-40"
      >Weiter</button>
    </div>
  {/if}
{/if}
