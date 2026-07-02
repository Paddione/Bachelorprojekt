<script lang="ts">
  // Fail-soft client island that loads the live PR-timeline on idle.
  // Replaces the SSR-side listTimeline() await in pages/index.astro:
  // the homepage must stay available when the DB is down or slow
  // (T001490 Task 5). The endpoint is already fail-soft (returns
  // `{ rows: [] }` on error), so on failure we just render nothing.

  export let wantsTimeline: boolean = true;
  export let brand: string = 'mentolder';
  export let limit: number = 20;

  type Row = {
    id: number;
    day: string;
    pr_number: number | null;
    title: string;
    description: string | null;
    category: string;
    scope: string | null;
    brand: string | null;
    bugs_fixed: number;
  };

  let rows: Row[] = [];
  let loaded = false;

  async function load() {
    if (!wantsTimeline) return;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4_000);
    try {
      const res = await fetch(`/api/timeline?limit=${limit}&brand=${encodeURIComponent(brand)}`, {
        signal: ctl.signal,
      });
      if (res.ok) {
        const body = await res.json() as { rows?: Row[] };
        rows = body.rows ?? [];
      }
    } catch {
      // Network error / timeout → render nothing
      rows = [];
    } finally {
      clearTimeout(t);
      loaded = true;
    }
  }

  // `client:idle` is configured in the host page; this component
  // exports the props the host passes in.
  $: void wantsTimeline;
  $: void brand;
  $: void limit;
  $: if (!loaded) void load();
</script>

{#if wantsTimeline && rows.length > 0}
  <section class="timeline-island" aria-label="Recent activity">
    <ul>
      {#each rows as r}
        <li>
          <span class="day">{r.day}</span>
          {#if r.pr_number}<span class="pr">#{r.pr_number}</span>{/if}
          <span class="title">{r.title}</span>
          {#if r.bugs_fixed > 0}<span class="bugs">+{r.bugs_fixed} fixes</span>{/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .timeline-island { padding: 24px 0; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 8px 0; border-bottom: 1px solid var(--border, #eee); }
  .day { color: var(--fg-soft, #888); font-size: 0.85em; margin-right: 12px; }
  .pr { font-family: var(--mono, monospace); margin-right: 8px; }
  .title { font-weight: 500; }
  .bugs { color: var(--success, #4a8); margin-left: 8px; font-size: 0.85em; }
</style>
