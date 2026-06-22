<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { logEntries, clearLog, filterEntries, type LogFilters } from '../../lib/logging/log-store';
  import { levelClass, levelLabel } from '../../lib/logging/log-format';
  import { openServerLogStream, openPodLogStream, type StreamHandle } from '../../lib/logging/log-streams';
  import type { LogLevel, LogSource } from '../../lib/logging/log-types';

  const ALL_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const ALL_SOURCES: LogSource[] = ['server', 'browser', 'pod'];
  const SOURCE_LABEL: Record<LogSource, string> = { server: 'Server', browser: 'Browser', pod: 'Pod' };

  let levels = $state(new Set<LogLevel>(ALL_LEVELS));
  let sources = $state(new Set<LogSource>(ALL_SOURCES));
  let text = $state('');
  let autoScroll = $state(true);

  let serverHandle: StreamHandle | null = null;
  let podHandle: StreamHandle | null = null;
  let serverDown = $state(false);

  // Compact pod-source selector (opt-in via <details>).
  const NAMESPACES = [
    { id: 'workspace', label: 'mentolder' },
    { id: 'workspace-korczewski', label: 'korczewski' },
    { id: 'website', label: 'website (mentolder)' },
    { id: 'website-korczewski', label: 'website (korczewski)' },
  ];
  let ns = $state('workspace');
  let pods = $state<{ name: string; containers: string[] }[]>([]);
  let selectedPod = $state('');
  let podError = $state<string | null>(null);

  let logEl = $state<HTMLElement | null>(null);

  const filters = $derived<LogFilters>({ levels, sources, text });
  const filtered = $derived(filterEntries($logEntries, filters));

  $effect(() => {
    // Re-run on every filtered change; scroll to bottom when enabled.
    void filtered.length;
    if (autoScroll && logEl) {
      void tick().then(() => { if (logEl) logEl.scrollTop = logEl.scrollHeight; });
    }
  });

  function toggleLevel(l: LogLevel) {
    const next = new Set(levels);
    if (next.has(l)) next.delete(l); else next.add(l);
    levels = next;
  }
  function toggleSource(s: LogSource) {
    const next = new Set(sources);
    if (next.has(s)) next.delete(s); else next.add(s);
    sources = next;
  }

  async function loadPods() {
    podError = null;
    try {
      const res = await fetch(`/api/admin/cluster/pods-list?ns=${encodeURIComponent(ns)}`, { credentials: 'same-origin' });
      const j = await res.json();
      if (!res.ok) { podError = j.error ?? `Fehler ${res.status}`; return; }
      pods = j.pods ?? [];
      selectedPod = pods[0]?.name ?? '';
    } catch (e) {
      podError = (e as Error).message;
    }
  }

  function startPod() {
    podHandle?.close();
    if (!selectedPod) return;
    const container = pods.find((p) => p.name === selectedPod)?.containers?.[0];
    podHandle = openPodLogStream({ ns, pod: selectedPod, container }, () => {});
  }
  function stopPod() { podHandle?.close(); podHandle = null; }

  function reconnectServer() {
    serverHandle?.close();
    serverDown = false;
    serverHandle = openServerLogStream(() => { serverDown = true; });
  }

  onMount(() => {
    serverHandle = openServerLogStream(() => { serverDown = true; });
  });
  onDestroy(() => { serverHandle?.close(); podHandle?.close(); });
</script>

<div class="logs">
  <!-- Source chips -->
  <div class="chips" role="group" aria-label="Quellen">
    {#each ALL_SOURCES as s}
      <button type="button" class="chip src-{s}" class:off={!sources.has(s)} onclick={() => toggleSource(s)}>
        {SOURCE_LABEL[s]}
      </button>
    {/each}
  </div>

  <!-- Level chips -->
  <div class="chips" role="group" aria-label="Level">
    {#each ALL_LEVELS as l}
      <button type="button" class="chip {levelClass(l)}" class:off={!levels.has(l)} onclick={() => toggleLevel(l)}>
        {levelLabel(l)}
      </button>
    {/each}
  </div>

  <!-- Text filter + controls -->
  <div class="row">
    <input class="filter-input" bind:value={text} placeholder="Text filtern…" aria-label="Textfilter" />
    <label class="auto"><input type="checkbox" bind:checked={autoScroll} /> Auto</label>
    <button type="button" class="ctl" onclick={clearLog}>Leeren</button>
  </div>

  <!-- Optional pod source -->
  <details class="pod">
    <summary>Pod-Quelle hinzufügen</summary>
    <div class="pod-controls">
      <select bind:value={ns} onchange={loadPods} aria-label="Namespace">
        {#each NAMESPACES as n}<option value={n.id}>{n.label}</option>{/each}
      </select>
      <select bind:value={selectedPod} aria-label="Pod">
        {#each pods as p}<option value={p.name}>{p.name}</option>{/each}
      </select>
      {#if !pods.length}
        <button type="button" class="ctl" onclick={loadPods}>Pods laden</button>
      {:else if podHandle}
        <button type="button" class="ctl ctl-stop" onclick={stopPod}>Stop</button>
      {:else}
        <button type="button" class="ctl" onclick={startPod} disabled={!selectedPod}>Start</button>
      {/if}
    </div>
    {#if podError}<p class="err">{podError}</p>{/if}
  </details>

  {#if serverDown}
    <p class="src-down">Server-Stream getrennt — <button type="button" class="link" onclick={reconnectServer}>neu verbinden</button></p>
  {/if}

  <!-- Log list -->
  <div class="log-list" bind:this={logEl}>
    {#if !filtered.length}
      <p class="empty">Keine Logs — Filter aktiv oder noch keine Einträge.</p>
    {/if}
    {#each filtered as e}
      <div class="line {levelClass(e.level)}">
        <span class="ts">{new Date(e.ts).toLocaleTimeString('de-DE')}</span>
        <span class="src-tag src-{e.source}">{SOURCE_LABEL[e.source]}</span>
        <span class="msg">{e.message}</span>
      </div>
    {/each}
  </div>

  <div class="count">{filtered.length} / {$logEntries.length} Zeilen</div>
</div>

<style>
  .logs { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.75rem; font-size: 0.82rem; min-height: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chip {
    font-family: var(--mono, monospace);
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    padding: 0.18rem 0.5rem;
    border-radius: 999px;
    border: 1px solid currentColor;
    background: transparent;
    cursor: pointer;
    text-transform: uppercase;
  }
  .chip.off { opacity: 0.32; border-color: #555; color: #888; }
  /* Level colours — single source of truth is levelClass() */
  .log-debug { color: #8a93a5; }
  .log-info  { color: #3ba55d; }
  .log-warn  { color: #d9a300; }
  .log-error { color: #d83c3c; }
  /* Source accents */
  .src-server  { color: #5b8def; }
  .src-browser { color: #b06fd8; }
  .src-pod     { color: #46b5a8; }

  .row { display: flex; align-items: center; gap: 0.5rem; }
  .filter-input {
    flex: 1; min-width: 0;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    padding: 0.3rem 0.55rem;
    color: var(--fg, #e8e8e8);
    font-size: 0.8rem;
  }
  .auto { display: flex; align-items: center; gap: 0.25rem; font-size: 0.72rem; color: #9aa3b2; white-space: nowrap; }
  .ctl {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    color: var(--fg, #e8e8e8);
    cursor: pointer;
    font-size: 0.74rem;
  }
  .ctl:disabled { opacity: 0.4; cursor: not-allowed; }
  .ctl-stop { color: #d83c3c; }

  .pod summary { cursor: pointer; font-size: 0.74rem; color: #9aa3b2; }
  .pod-controls { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.4rem; }
  .pod-controls select {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    padding: 0.25rem 0.4rem;
    color: var(--fg, #e8e8e8);
    font-size: 0.74rem;
    max-width: 9rem;
  }
  .err { color: #d83c3c; font-size: 0.72rem; margin: 0.3rem 0 0; }
  .src-down { font-size: 0.72rem; color: #d9a300; margin: 0; }
  .link { background: none; border: none; color: #5b8def; cursor: pointer; padding: 0; font: inherit; text-decoration: underline; }

  .log-list {
    flex: 1;
    min-height: 12rem;
    max-height: 50vh;
    overflow-y: auto;
    background: rgba(0,0,0,0.28);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 0.5rem;
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 0.72rem;
    line-height: 1.45;
  }
  .empty { color: #6b7280; font-style: italic; }
  .line { display: grid; grid-template-columns: auto auto 1fr; gap: 0.5rem; padding: 0.1rem 0; word-break: break-word; }
  .ts { color: #6b7280; font-variant-numeric: tabular-nums; }
  .src-tag { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.04em; align-self: center; }
  .msg { color: inherit; min-width: 0; }
  .count { font-size: 0.68rem; color: #6b7280; text-align: right; font-variant-numeric: tabular-nums; }
</style>
