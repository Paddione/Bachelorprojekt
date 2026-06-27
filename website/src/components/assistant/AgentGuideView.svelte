<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goals, tools, taxonomy, themes, glossary, guideMap, tierColor, tierEmoji } from '../../lib/agentGuide';
  import {
    buildEntries, filterEntries, groupBy, sortCommonFirst, normalize, mapFilterIds, MIN_QUERY,
    type Axis, type GuideEntry, type MapFilter,
  } from '../../lib/agentGuideSearch';
  import GuideFindBar from './agent-guide/GuideFindBar.svelte';
  import GuideGroup from './agent-guide/GuideGroup.svelte';
  import GuideCard from './agent-guide/GuideCard.svelte';
  import GuideMap from './agent-guide/GuideMap.svelte';

  let { jumpTo: jumpToProp = null }: { jumpTo?: string | null } = $props();

  // ── Cross-link lookup: id → human label/kind/danger/domId ──────────────────
  const lookup: Record<string, { label: string; kind: string; danger: string; domId: string }> = {};
  for (const g of goals) lookup[g.id] = { label: g.title_de, kind: 'goal', danger: g.danger, domId: `ag-goal-${g.id}` };
  for (const t of tools) lookup[t.id] = { label: t.name_de, kind: 'tool', danger: t.danger, domId: `ag-tool-${t.id}` };

  // Entries (pure, computed once) — inject the related lookup so goal chips show names.
  const ALL: GuideEntry[] = buildEntries(goals, tools).map(e => ({ ...e, related: lookup }));

  // Schnellstart shelf: starter prompts pulled from the registry (no hardcoded strings).
  const QUICKSTART_IDS = ['superpowers', 'brainstorming', 'dev-flow-plan'];
  const quickstart = QUICKSTART_IDS
    .map(id => tools.find(t => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t && !!t.init_prompt_de);

  // ── Learning summary state ────────────────────────────────────────────────
  interface SummaryItem {
    item_id: string;
    item_type: string;
    status: 'todo' | 'in_progress' | 'done';
    note: string | null;
    started_at: string | null;
    completed_at: string | null;
  }
  interface LearningSummary {
    done: number;
    inProgress: number;
    total: number;
    pct: number;
    lastActivity: string | null;
    items: SummaryItem[];
  }

  let learningSummary = $state<LearningSummary | null>(null);
  let consumedJump = $state<string | null>(null);
  const learnedItems = $derived<Map<string, { status: 'todo' | 'in_progress' | 'done'; note: string }>>(
    (() => {
      const m = new Map<string, { status: 'todo' | 'in_progress' | 'done'; note: string }>();
      if (learningSummary) {
        for (const item of learningSummary.items) {
          m.set(item.item_id, { status: item.status, note: item.note ?? '' });
        }
      }
      return m;
    })()
  );

  async function refreshSummary() {
    try {
      const res = await fetch('/api/portal/learning/summary');
      if (res.ok) learningSummary = await res.json() as LearningSummary;
    } catch { /* ignore */ }
  }

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
  let mapFilter = $state<MapFilter>(null);
  let mapOpen = $state(true);
  const MAP_KEY = 'ag-map-v1';
  const glossTerms = glossary.map(g => g.term);

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
      const rawMap = localStorage.getItem(MAP_KEY);
      if (rawMap === 'open' || rawMap === 'closed') mapOpen = rawMap === 'open';
      else mapOpen = true; // first run: map open to onboard newcomers
    } catch { /* ignore */ }
    hydrated = true;   // gate the persist effects so they never clobber saved state

    // Fetch learning summary
    refreshSummary();
    window.addEventListener('learning:updated', refreshSummary);
    return () => { window.removeEventListener('learning:updated', refreshSummary); };
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
  $effect(() => { if (hydrated) { try { localStorage.setItem(MAP_KEY, mapOpen ? 'open' : 'closed'); } catch { /* ignore */ } } });

  // ── Derivations ──────────────────────────────────────────────────────────────
  const searching = $derived(query.trim().length >= MIN_QUERY);

  // domain + tier + map pre-filter (applied before text search for tier counts)
  const allowedByMap = $derived(mapFilterIds(mapFilter, guideMap)); // Set<string> | null
  const preFiltered = $derived(
    ALL.filter(e =>
      (allowedByMap === null || allowedByMap.has(e.id)) &&
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

  // Cross-component deep-link: when PortalSidekick forwards a `jumpTo` prop, open +
  // scroll the matching card ONCE — only after hydration AND after the summary load
  // (so the card's learned-state is rendered before we scroll). The consumedJump guard
  // + untrack writes mirror the search-force-open effect so this can never re-trigger.
  $effect(() => {
    if (!hydrated) return;
    if (!jumpToProp) return;
    if (learningSummary === null) return;           // wait for summary so the card is fully rendered
    if (jumpToProp === untrack(() => consumedJump)) return;
    const target = jumpToProp;
    untrack(() => { consumedJump = target; });
    jumpTo(target);
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function toggleCard(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    expanded = next;
  }
  function toggleGroup(key: string) {
    const next = new Set(groupsOpen);
    if (next.has(key)) next.delete(key); else next.add(key);
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

  function selectMap(sel: MapFilter) {
    mapFilter = sel;
    if (!sel) return;
    requestAnimationFrame(() => {
      document.querySelector('.ag-findbar')?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start',
      });
    });
  }
</script>

<div class="ag-body">
  <div class="ag-intro">
    <span class="ag-eyebrow"><span class="ag-eyebrow-bar" aria-hidden="true"></span>Agent-Anleitung</span>
    <h3 class="ag-title">Ich will … — welches Werkzeug nehme ich?</h3>
    <p class="ag-desc">Gruppiert nach Thema. Tippe ≥ 3 Zeichen zum Suchen. Die Farbe zeigt, wie vorsichtig Du sein musst.</p>

    {#if learningSummary}
      <div class="ag-progress-wrap">
        <div class="ag-progress-bar" role="progressbar" aria-valuenow={learningSummary.pct} aria-valuemin={0} aria-valuemax={100}>
          <div class="ag-progress-fill" style="width: {learningSummary.pct}%"></div>
        </div>
        {#if learningSummary.total > 0 && learningSummary.done >= learningSummary.total}
          <span class="ag-progress-value ag-progress-done">🎉 Alle {learningSummary.total} gelernt</span>
        {:else}
          <span class="ag-progress-value">{learningSummary.pct}% — {learningSummary.done}/{learningSummary.total} erledigt</span>
        {/if}
      </div>
    {/if}
  </div>

  {#if guideMap.flow.length}
    <section class="ag-map-section">
      <button type="button" class="ag-map-toggle" aria-expanded={mapOpen} onclick={() => (mapOpen = !mapOpen)}>
        <span class="ag-map-toggle-icon" aria-hidden="true">🧭</span>
        <span class="ag-map-toggle-label">So funktioniert die Plattform</span>
        <span class="ag-chevron" aria-hidden="true">{mapOpen ? '▾' : '▸'}</span>
      </button>
      {#if mapOpen}
        <p class="ag-map-hint">Neu hier? Folge dem Band von links — klick eine Station oder einen Baustein, um die passenden Karten zu sehen.</p>
        <GuideMap map={guideMap} active={mapFilter} glossaryTerms={glossTerms} onSelect={selectMap} />
      {/if}
      {#if mapFilter}
        <button type="button" class="ag-mapfilter-chip" onclick={() => (mapFilter = null)}>
          Gefiltert: {mapFilter.kind === 'flow' ? 'Station' : 'Baustein'} ✕
        </button>
      {/if}
    </section>
  {/if}

  <GuideFindBar
    {taxonomy} {themes} {tierCounts} {query} {axis} {tierFilter} {domainFilter}
    {resultCount} {searching}
    onQuery={(v) => (query = v)}
    onAxis={(a) => (axis = a)}
    onToggleTier={(id) => { const n = new Set(tierFilter); if (n.has(id)) n.delete(id); else n.add(id); tierFilter = n; }}
    onToggleDomain={(id) => (domainFilter = id)}
  />

  <div class="ag-controls">
    <button type="button" class="ag-control-btn" onclick={expandAll}>Alles ausklappen</button>
    <button type="button" class="ag-control-btn" onclick={collapseAll}>Alles einklappen</button>
  </div>

  {#if !searching && quickstart.length}
    <section class="ag-quickstart" aria-label="Schnellstart für Claude Code">
      <p class="ag-section-label">⚡ Schnellstart / Für Claude</p>
      <div class="ag-quickstart-chips">
        {#each quickstart as t (t.id)}
          <button
            type="button"
            class="ag-quickstart-chip"
            onclick={() => copyPrompt(`${t.id}::quick`, t.init_prompt_de!)}
          >
            <span class="ag-quickstart-name">{t.name_de}</span>
            <span class="ag-quickstart-action">
              {copiedId === `${t.id}::quick` ? 'Kopiert ✓' : 'Prompt kopieren'}
            </span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

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
        {learnedItems}
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

<style>
  .ag-progress-done { color: var(--brass, #b8860b); font-weight: 600; }
</style>
