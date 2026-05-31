<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goals, tools, taxonomy, themes, glossary, tierColor, tierEmoji } from '../../lib/agentGuide';
  import {
    buildEntries, filterEntries, groupBy, sortCommonFirst, normalize, MIN_QUERY,
    type Axis, type GuideEntry,
  } from '../../lib/agentGuideSearch';
  import GuideFindBar from './agent-guide/GuideFindBar.svelte';
  import GuideGroup from './agent-guide/GuideGroup.svelte';
  import GuideCard from './agent-guide/GuideCard.svelte';

  // ── Cross-link lookup: id → human label/kind/danger/domId ──────────────────
  const lookup: Record<string, { label: string; kind: string; danger: string; domId: string }> = {};
  for (const g of goals) lookup[g.id] = { label: g.title_de, kind: 'goal', danger: g.danger, domId: `ag-goal-${g.id}` };
  for (const t of tools) lookup[t.id] = { label: t.name_de, kind: 'tool', danger: t.danger, domId: `ag-tool-${t.id}` };

  // Entries (pure, computed once) — inject the related lookup so goal chips show names.
  const ALL: GuideEntry[] = buildEntries(goals, tools).map(e => ({ ...e, related: lookup }));

  // ── State ──────────────────────────────────────────────────────────────────
  let expanded = $state(new Set<string>());
  // Every group key across all three axes — so groups are OPEN by default on any axis
  // (cards collapsed, group structure visible). Keyed by theme id / tier id / art key.
  let groupsOpen = $state(new Set<string>([
    ...themes.map(t => t.id), ...taxonomy.map(t => t.id), 'ziel', 'skill', 'agent', 'task',
  ]));
  let hydrated = $state(false);
  let query = $state('');
  let axis = $state<Axis>('thema');
  let tierFilter = $state(new Set<string>());           // empty = all
  let domainFilter = $state<string | null>(null);       // null = all (theme-based)
  let copiedId = $state<string | null>(null);
  let glossaryOpen = $state(false);

  const OPEN_KEY = 'ag-open-v1';
  const AXIS_KEY = 'ag-axis-v1';
  const prefersReducedMotion = () =>
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Rehydrate ONCE on mount (read BEFORE the persist effects can write) ───────
  onMount(() => {
    try {
      const rawOpen = localStorage.getItem(OPEN_KEY);
      if (rawOpen) expanded = new Set(JSON.parse(rawOpen) as string[]);
      const rawAxis = localStorage.getItem(AXIS_KEY);
      if (rawAxis === 'thema' || rawAxis === 'gefahr' || rawAxis === 'art') axis = rawAxis as Axis;
    } catch { /* ignore */ }
    hydrated = true;   // gate the persist effects so they never clobber saved state
  });

  // ── Persist (debounced) — only after hydration ───────────────────────────────
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!hydrated) return;
    const snapshot = JSON.stringify([...expanded]);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(OPEN_KEY, snapshot); } catch { /* ignore */ }
    }, 250);
  });
  $effect(() => { if (hydrated) { try { localStorage.setItem(AXIS_KEY, axis); } catch { /* ignore */ } } });

  // ── Derivations ──────────────────────────────────────────────────────────────
  const searching = $derived(query.trim().length >= MIN_QUERY);

  // domain + tier pre-filter (applied before text search for tier counts)
  const preFiltered = $derived(
    ALL.filter(e =>
      (domainFilter === null || e.theme === domainFilter) &&
      (tierFilter.size === 0 || tierFilter.has(e.danger)),
    ),
  );
  const visible = $derived(filterEntries(preFiltered, query));
  const currentGroups = $derived(groupBy(visible, axis, themes, taxonomy));
  const shelfEntries = $derived(sortCommonFirst(preFiltered).filter(e => e.common));
  const resultCount = $derived(visible.length);

  // Glossar: its own disclosure, not folded into ALL. `glossaryShown` = manual state
  // OR a live search hit, so it auto-reveals on a matching query and is closable again
  // once the search clears.
  const glossaryHit = $derived(
    searching && glossary.some(g => normalize(`${g.term} ${g.def_de}`).includes(normalize(query.trim()))),
  );
  const glossaryShown = $derived(glossaryOpen || glossaryHit);

  // Tier counts over the domain + text filtered set (independent of the tier filter).
  const tierCounts = $derived.by(() => {
    const base = filterEntries(ALL.filter(e => domainFilter === null || e.theme === domainFilter), query);
    const counts: Record<string, number> = {};
    for (const t of taxonomy) counts[t.id] = 0;
    for (const e of base) counts[e.danger] = (counts[e.danger] ?? 0) + 1;
    return counts;
  });

  // When a search is active, force-open matched cards + their groups. Writes are
  // `untrack`ed and change-guarded so this effect can never re-trigger itself
  // (reading `expanded` tracked here would otherwise create an infinite loop).
  $effect(() => {
    if (!searching) return;
    const ids = visible.map(e => e.id);
    const keys = currentGroups.map(g => g.key);
    untrack(() => {
      let changed = false;
      const next = new Set(expanded);
      for (const id of ids) if (!next.has(id)) { next.add(id); changed = true; }
      if (changed) expanded = next;
      let gchanged = false;
      const g = new Set(groupsOpen);
      for (const k of keys) if (!g.has(k)) { g.add(k); gchanged = true; }
      if (gchanged) groupsOpen = g;
    });
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function toggleCard(id: string) {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    expanded = next;
  }
  function toggleGroup(key: string) {
    const next = new Set(groupsOpen);
    next.has(key) ? next.delete(key) : next.add(key);
    groupsOpen = next;
  }
  function expandAll() { expanded = new Set(ALL.map(e => e.id)); }
  function collapseAll() { expanded = new Set(); }

  async function copyPrompt(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      setTimeout(() => { if (copiedId === id) copiedId = null; }, 1600);
    } catch { /* clipboard unavailable */ }
  }

  function jumpTo(domId: string) {
    const id = domId.replace(/^ag-(goal|tool)-/, '');
    const next = new Set(expanded);
    next.add(id);
    expanded = next;                       // open, don't land on a collapsed card
    requestAnimationFrame(() => {
      const el = document.getElementById(domId);
      if (!el) return;
      el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      const head = el.querySelector<HTMLElement>('.ag-card-head');
      head?.focus();
      el.classList.add('ag-flash');
      setTimeout(() => el.classList.remove('ag-flash'), 900);
    });
  }
</script>

<div class="ag-body">
  <div class="ag-intro">
    <span class="ag-eyebrow"><span class="ag-eyebrow-bar" aria-hidden="true"></span>Agent-Anleitung</span>
    <h3 class="ag-title">Ich will … — welches Werkzeug nehme ich?</h3>
    <p class="ag-desc">Gruppiert nach Thema. Tippe ≥ 3 Zeichen zum Suchen. Die Farbe zeigt, wie vorsichtig Du sein musst.</p>
  </div>

  <GuideFindBar
    {taxonomy} {themes} {tierCounts} {query} {axis} {tierFilter} {domainFilter}
    {resultCount} {searching}
    onQuery={(v) => (query = v)}
    onAxis={(a) => (axis = a)}
    onToggleTier={(id) => { const n = new Set(tierFilter); n.has(id) ? n.delete(id) : n.add(id); tierFilter = n; }}
    onToggleDomain={(id) => (domainFilter = id)}
  />

  <div class="ag-controls">
    <button type="button" class="ag-control-btn" onclick={expandAll}>Alles ausklappen</button>
    <button type="button" class="ag-control-btn" onclick={collapseAll}>Alles einklappen</button>
  </div>

  {#if !searching && shelfEntries.length}
    <!-- Quick-access band: shortcut chips that jump+open the real in-group card.
         (Rendering full cards here would duplicate their DOM ids — breaking getElementById
         and `#id` selectors — so the shelf is chips, per spec §A "additional quick-access band".) -->
    <section class="ag-shelf" aria-label="Häufig gebraucht">
      <p class="ag-section-label">Häufig</p>
      <div class="ag-shelf-chips">
        {#each shelfEntries as entry (entry.id)}
          <button type="button" class="ag-shelf-chip" style="--tier: {tierColor(entry.danger)}" onclick={() => jumpTo(entry.domId)}>
            <span aria-hidden="true">{tierEmoji(entry.danger)}</span> {entry.title_de}
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if resultCount === 0}
    <p class="ag-empty">Nichts gefunden. Versuch z. B. <button class="ag-related-chip" onclick={() => (query = 'passwort')}>passwort</button>, <button class="ag-related-chip" onclick={() => (query = 'deploy')}>deploy</button> oder <button class="ag-related-chip" onclick={() => (query = 'status')}>status</button>.</p>
  {:else}
    {#each currentGroups as group (group.key)}
      <GuideGroup
        {group}
        groupOpen={groupsOpen.has(group.key)}
        {expanded} {query} {copiedId}
        onToggleGroup={toggleGroup}
        onToggleCard={toggleCard}
        onJump={jumpTo}
        onCopy={copyPrompt}
      />
    {/each}
  {/if}

  <!-- Glossar -->
  {#if glossary.length}
    <section class="ag-glossary">
      <button type="button" class="ag-group-head" aria-expanded={glossaryShown} onclick={() => (glossaryOpen = !glossaryOpen)}>
        <span class="ag-group-emoji" aria-hidden="true">📖</span>
        <span class="ag-group-label">Begriffe kurz erklärt</span>
        <span class="ag-group-count">{glossary.length}</span>
        <span class="ag-chevron" aria-hidden="true">{glossaryShown ? '▾' : '▸'}</span>
      </button>
      {#if glossaryShown}
        <dl class="ag-glossary-list">
          {#each glossary as g (g.term)}
            <div class="ag-glossary-row"><dt>{g.term}</dt><dd>{g.def_de}</dd></div>
          {/each}
        </dl>
      {/if}
    </section>
  {/if}
</div>
