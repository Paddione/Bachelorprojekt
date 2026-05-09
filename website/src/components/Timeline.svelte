<script lang="ts">
  // Live PR-feed timeline — fed by /api/timeline (bachelorprojekt.v_timeline +
  // bugs.bug_tickets.fixed_in_pr). The data contract is the same one
  // KoreTimeline used. SSR seeds the first 20 rows; "Mehr laden" pages.

  type Row = {
    id: number; day: string; pr_number: number | null;
    title: string; description: string | null;
    category: string; scope: string | null; brand: string | null;
    requirement_id: string | null; bugs_fixed: number;
  };

  let { initialRows = [] }: { initialRows?: Row[] } = $props();
  let rows = $state<Row[]>(initialRows);
  let category = $state<string>('');
  let loading = $state(false);
  let exhausted = $state(false);

  async function loadMore() {
    if (loading || exhausted) return;
    loading = true;
    const params = new URLSearchParams({
      offset: String(rows.length),
      limit: '20',
    });
    if (category) params.set('cat', category);
    const r = await fetch(`/api/timeline?${params}`);
    const j = await r.json();
    if (j.rows.length === 0) exhausted = true;
    rows = [...rows, ...j.rows];
    loading = false;
  }

  async function setCategory(c: string) {
    category = c;
    rows = [];
    exhausted = false;
    await loadMore();
  }
</script>

<div class="filters" role="tablist" aria-label="Kategorie-Filter">
  {#each [['', 'Alle'], ['feat', 'Features'], ['fix', 'Fixes'], ['infra', 'Infra'], ['docs', 'Docs']] as [k, l]}
    <button class:active={category === k} onclick={() => setCategory(k)} role="tab">{l}</button>
  {/each}
</div>

<ol class="log">
  {#each rows as r (r.id)}
    <li>
      <span class="when">{r.day}</span>
      <span class="what">
        {r.title}
        {#if r.description}<span class="sub">{r.description.split('\n')[0].slice(0, 140)}</span>{/if}
      </span>
      <span class="meta">
        {#if r.pr_number}<span class="pr">PR #{r.pr_number}</span>{/if}
        {#if r.bugs_fixed > 0}<span class="bug">+{r.bugs_fixed} fix</span>{/if}
      </span>
    </li>
  {/each}
</ol>

{#if !exhausted}
  <button class="load-more" onclick={loadMore} disabled={loading}>
    {loading ? 'Lade…' : 'Mehr laden'}
  </button>
{:else}
  <p class="exhausted">Ende der Liste.</p>
{/if}

<style>
  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .filters button {
    padding: 6px 14px;
    border: 1px solid var(--line-2);
    border-radius: 999px;
    background: transparent;
    color: var(--fg-soft);
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 200ms ease;
  }
  .filters button:hover {
    border-color: var(--brass);
    color: var(--brass);
  }
  .filters button.active {
    background: var(--brass-d, rgba(255,255,255,0.04));
    color: var(--brass);
    border-color: var(--brass);
  }

  .log {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .log li {
    display: grid;
    grid-template-columns: 140px 1fr auto;
    gap: 24px;
    align-items: start;
    padding: 18px 0;
    border-bottom: 1px solid var(--line);
  }
  .when {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.10em;
    color: var(--mute);
    text-transform: uppercase;
  }
  .what {
    font-family: var(--sans);
    font-size: 14.5px;
    color: var(--fg);
  }
  .what .sub {
    display: block;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--mute);
    margin-top: 4px;
    letter-spacing: 0.04em;
  }
  .meta {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--mute);
    text-transform: uppercase;
    text-align: right;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-end;
  }
  .meta .pr { color: var(--brass); }
  .meta .bug { color: var(--sage, #5bd4d0); }

  .load-more {
    margin-top: 24px;
    padding: 10px 22px;
    border: 1px solid var(--line-2);
    border-radius: 999px;
    background: transparent;
    color: var(--fg-soft);
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 200ms ease;
  }
  .load-more:hover:not(:disabled) {
    border-color: var(--brass);
    color: var(--brass);
  }
  .load-more:disabled { opacity: 0.5; cursor: wait; }

  .exhausted {
    margin-top: 24px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--mute);
    text-align: center;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  @media (max-width: 720px) {
    .log li {
      grid-template-columns: 1fr;
      gap: 6px;
    }
    .meta { text-align: left; align-items: flex-start; flex-direction: row; }
  }
</style>
