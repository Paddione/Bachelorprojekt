<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { logEntries, clearLog, filterEntries, type LogFilters } from '../../lib/logging/log-store';
  import { levelClass, levelLabel } from '../../lib/logging/log-format';
  import { openServerLogStream, openPodLogStream, type StreamHandle } from '../../lib/logging/log-streams';
  import { postError, podLineToError, fetchErrorHistory } from '../../lib/logging/error-report.js';
  import { browserLogger } from '../../lib/browser-logger.js';
  import type { LogLevel, LogSource, LogEntry } from '../../lib/logging/log-types';

  const ALL_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const ALL_SOURCES: LogSource[] = ['server', 'browser', 'pod'];
  const SOURCE_LABEL: Record<LogSource, string> = { server: 'Server', browser: 'Browser', pod: 'Pod' };

  let levels = $state(new Set<LogLevel>(ALL_LEVELS));
  let sources = $state(new Set<LogSource>(ALL_SOURCES));
  let text = $state('');
  let autoScroll = $state(true);

  // Error history mode (separate from live logs)
  let errorMode = $state<'live' | 'history'>('live');
  let historyEntries: LogEntry[] = $state([]);

  let serverHandle: StreamHandle | null = null;
  let podHandle: StreamHandle | null = null;
  let serverDown = $state(false);

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
    serverHandle = openServerLogStream(async (line) => {
      const errorReport = podLineToError(line);
      if (errorReport && levels.has('error')) {
        postError(errorReport);
      }
    });
  }

  async function loadErrorHistory() {
    try {
      historyEntries = await fetchErrorHistory();
    } catch (e) {
      browserLogger.error({ err: e }, '[LogsSidekickView] Failed to load error history');
    }
  }

  function toggleMode() {
    if (errorMode === 'live') {
      errorMode = 'history';
      void loadErrorHistory();
    } else {
      errorMode = 'live';
      historyEntries = [];
    }
  }

  onMount(() => {
    serverHandle = openServerLogStream(async (line) => {
      const errorReport = podLineToError(line);
      if (errorReport && levels.has('error')) {
        postError(errorReport);
      }
    });
  });
  onDestroy(() => { serverHandle?.close(); podHandle?.close(); });
</script>

<div class="logs">
  <div class="mode-toggle" role="tablist">
    <button type="button" class="mode-btn {errorMode === 'live' ? 'active' : ''}" onclick={() => toggleMode()} aria-selected={errorMode === 'live'}>Live</button>
    <span aria-hidden="true">|</span>
    <button type="button" class="mode-btn {errorMode === 'history' ? 'active' : ''}" onclick={() => toggleMode()} aria-selected={errorMode === 'history'}>Letzte 24h</button>
  </div>

  {#if errorMode === 'history'}
    <button type="button" class="ctl refresh-btn" onclick={() => loadErrorHistory()}>Aktualisieren</button>
  {/if}

  <div class="chips" role="group" aria-label="Quellen">
    {#each ALL_SOURCES as s}<button type="button" class="chip src-{s}" class:off={!sources.has(s)} onclick={() => toggleSource(s)}>{SOURCE_LABEL[s]}</button>{/each}
  </div>

  <div class="chips" role="group" aria-label="Level">
    {#each ALL_LEVELS as l}<button type="button" class="chip {levelClass(l)}" class:off={!levels.has(l)} onclick={() => toggleLevel(l)}>{levelLabel(l)}</button>{/each}
  </div>

  <div class="row">
    <input class="filter-input" bind:value={text} placeholder="Text filtern…" />
    <label class="auto"><input type="checkbox" bind:checked={autoScroll} /> Auto</label>
    <button type="button" class="ctl" onclick={clearLog}>Leeren</button>
  </div>

  {#if errorMode === 'live'}
    <div class="log-list" bind:this={logEl}>
      {#if !filtered.length}<p class="empty">Keine Logs</p>{/if}
      {#each filtered as e}<div class="line {levelClass(e.level)}"><span class="ts">{new Date(e.ts).toLocaleTimeString('de-DE')}</span><span class="src-tag src-{e.source}">{SOURCE_LABEL[e.source]}</span><span class="msg">{e.message}</span></div>{/each}
    </div>
  {:else if errorMode === 'history'}
    <div class="log-list" bind:this={logEl}>
      {#if !historyEntries.length}<p class="empty">Keine Fehler in den letzten 24h</p>{/if}
      {#each historyEntries as e}<div class="line {levelClass(e.level)}"><span class="ts">{new Date(e.ts).toLocaleTimeString('de-DE')}</span><span class="src-tag src-error">Fehler</span><span class="msg">{e.message}</span></div>{/each}
    </div>
  {/if}

  <div class="count">{#if errorMode === 'live'}{filtered.length} / {$logEntries.length} Zeilen{:else}{historyEntries.length} Fehler (Letzte 24h){/if}</div>

  <details class="pod">
    <summary>Pod-Quelle hinzufügen</summary>
    <div class="pod-controls">
      <select bind:value={ns} onchange={loadPods}>{#each NAMESPACES as n}<option value={n.id}>{n.label}</option>{/each}</select>
      <select bind:value={selectedPod}>{#each pods as p}<option value={p.name}>{p.name}</option>{/each}</select>
      {#if !pods.length}<button type="button" class="ctl" onclick={loadPods}>Pods laden</button>{:else if podHandle}<button type="button" class="ctl ctl-stop" onclick={stopPod}>Stop</button>{:else}<button type="button" class="ctl" onclick={startPod} disabled={!selectedPod}>Start</button>{/if}
    </div>
    {#if podError}<p class="src-down">{podError}</p>{/if}
  </details>

  {#if serverDown}<p class="src-down">Server-Stream getrennt — <button type="button" class="link" onclick={reconnectServer}>neu verbinden</button></p>{/if}
</div>

<style>
.logs{display:flex;flex-direction:column;gap:.6rem;padding:.75rem;font-size:.82rem}
.mode-toggle{display:flex;align-items:center;gap:.4rem;margin-bottom:.3rem}
.mode-btn{font-family:var(--mono,monospace);font-size:.68rem;padding:.15rem .5rem;border-radius:999px;border:1px solid currentColor;background:transparent;cursor:pointer}.mode-btn.active{background:rgba(255,255,255,.1)}
.chips{display:flex;flex-wrap:wrap;gap:.35rem}
.chip{font-family:var(--mono,monospace);font-size:.68rem;padding:.18rem .5rem;border-radius:999px;border:1px solid currentColor;background:transparent;cursor:pointer}.chip.off{opacity:.32;color:#888}
.log-debug{color:#8a93a5}.log-info{color:#3ba55d}.log-warn{color:#d9a300}.log-error{color:#d83c3c}
.src-server{color:#5b8def}.src-browser{color:#b06fd8}.src-pod,.src-error{color:#46b5a8}
.row{display:flex;align-items:center;gap:.5rem}
.filter-input{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:.3rem .55rem;color:#e8e8e8}
.auto{display:flex;gap:.25rem;font-size:.72rem;color:#9aa3b2}
.ctl{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:.3rem .6rem;color:#e8e8e8;cursor:pointer}.ctl:disabled{opacity:.4}
.refresh-btn{background:rgba(255,255,255,.1);color:#3ba55d;margin-left:.3rem}
.pod summary{font-size:.74rem;color:#9aa3b2}
.pod-controls{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.4rem}
.pod-controls select{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:.25rem .4rem;color:#e8e8e8;font-size:.74rem}
.err{color:#d83c3c}.src-down{font-size:.72rem;color:#d9a300}
.link{background:none;border:none;color:#5b8def;cursor:pointer;text-decoration:underline}
.log-list{flex:1;min-height:12rem;max-height:45vh;overflow-y:auto;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:.5rem;font-family:var(--mono,monospace);font-size:.72rem;line-height:1.45}
.empty{color:#6b7280;white-space:nowrap}.line{display:grid;grid-template-columns:auto auto 1fr;gap:.5rem;padding:.1rem;color:inherit}
.ts{color:#6b7280}.src-tag{font-size:.62rem;text-transform:uppercase}.msg{min-width:0}
.count{font-size:.68rem;color:#6b7280;text-align:right;white-space:nowrap;margin-top:.3rem}
</style>
