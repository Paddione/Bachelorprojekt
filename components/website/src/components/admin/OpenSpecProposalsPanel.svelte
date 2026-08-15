<script lang="ts">
  type Proposal = { slug: string; status: string };

  let { proposals }: { proposals: Proposal[] } = $props();

  const STATUS_STYLES: Record<string, string> = {
    planning: 'text-gray-400 border-gray-600',
    plan_staged: 'text-gold border-gold/30',
    archived: 'text-green-400 border-green-600',
  };

  const STATUS_LABELS: Record<string, string> = {
    planning: 'Planung',
    plan_staged: 'Plan bereit',
    archived: 'Archiviert',
  };

  function badgeClass(status: string): string {
    return STATUS_STYLES[status] ?? STATUS_STYLES.planning;
  }

  function statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  function titleFromSlug(slug: string): string {
    return slug
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function proposalUrl(slug: string): string {
    return `https://github.com/Paddione/Bachelorprojekt/blob/main/openspec/changes/${slug}/proposal.md`;
  }
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
  <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide mb-3">
    OpenSpec Proposals
  </h2>
  <ul class="space-y-2" role="list">
    {#each proposals as proposal (proposal.slug)}
      <li class="flex items-center justify-between gap-3" role="listitem">
        <a
          href={proposalUrl(proposal.slug)}
          target="_blank"
          rel="noopener"
          class="text-sm text-light hover:text-gold hover:underline truncate"
          title={proposal.slug}
        >
          {titleFromSlug(proposal.slug)}
        </a>
        <span
          class={`shrink-0 text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${badgeClass(proposal.status)}`}
        >
          {statusLabel(proposal.status)}
        </span>
      </li>
    {/each}
  </ul>
</div>
