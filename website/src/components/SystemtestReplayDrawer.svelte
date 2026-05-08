<!-- website/src/components/SystemtestReplayDrawer.svelte -->
<!--
  Side drawer that mounts an rrweb-player on demand for a given evidence id.
  Loaded only by the failure-board page (Task 7) and only after a card click.

  v1 NOTE — drawer wiring is OPTIONAL for the kanban. The board page MAY
  instead "open ticket detail in a new tab" as the primary action, and this
  drawer is then unmounted. We still ship the component so a follow-up PR can
  flip the page-level toggle without re-doing the rrweb-player integration.

  Usage:
    <SystemtestReplayDrawer evidenceId={id} on:close={...} />

  Notes:
    - rrweb-player is loaded dynamically (`import('rrweb-player')`) so the
      ~150 KB bundle is tree-shaken out of pages that never open the drawer.
    - Replay events are streamed as NDJSON from /api/admin/evidence/<id>/replay
      (Task 3). We parse line-by-line so partial recordings still play.
    - All user-controlled strings render via interpolation, never innerHTML.
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  export let evidenceId: string | null = null;

  const dispatch = createEventDispatcher<{ close: void }>();

  let mountEl: HTMLDivElement | undefined;
  let player: { $destroy?: () => void } | null = null;
  let error: string | null = null;
  let loading = true;

  async function loadAndMount() {
    if (!evidenceId || !mountEl) return;
    error = null;
    loading = true;

    try {
      // 1. fetch NDJSON
      const r = await fetch(`/api/admin/evidence/${evidenceId}/replay`, {
        credentials: 'same-origin',
      });
      if (!r.ok) {
        error = `Replay nicht verfügbar (${r.status})`;
        loading = false;
        return;
      }
      const text = await r.text();
      const events: unknown[] = [];
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed));
        } catch {
          // skip malformed line; partial flag will be set on the row
        }
      }
      if (events.length === 0) {
        error = 'Keine Replay-Events gefunden.';
        loading = false;
        return;
      }

      // 2. dynamic import — fail soft if rrweb-player isn't installed in
      //    this build (the package is in website/package.json since 2026-05-08
      //    via PR #c8f79ccd, but a stale dev install may not have it).
      const mod = await import('rrweb-player').catch(() => null);
      if (!mod) {
        error = 'rrweb-player nicht installiert.';
        loading = false;
        return;
      }
      const RrwebPlayer = (mod as { default: new (opts: unknown) => { $destroy?: () => void } }).default;

      // 3. mount
      while (mountEl.firstChild) mountEl.removeChild(mountEl.firstChild);
      player = new RrwebPlayer({
        target: mountEl,
        props: { events, autoPlay: true, showController: true, width: 720, height: 480 },
      });
      loading = false;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      loading = false;
    }
  }

  $: if (evidenceId && mountEl) {
    // Re-mount whenever the bound evidenceId changes.
    if (player?.$destroy) player.$destroy();
    player = null;
    loadAndMount();
  }

  onMount(() => loadAndMount());

  onDestroy(() => {
    if (player?.$destroy) player.$destroy();
    player = null;
  });
</script>

<aside class="drawer" aria-modal="true" role="dialog">
  <header class="drawer-head">
    <h2>System-Test Replay</h2>
    <button type="button" class="close-btn" on:click={() => dispatch('close')} aria-label="Schließen">
      ×
    </button>
  </header>
  <div class="drawer-body">
    {#if !evidenceId}
      <p class="muted">Kein Replay verknüpft.</p>
    {:else if error}
      <p class="error">{error}</p>
    {:else if loading}
      <p class="muted">Lade Replay…</p>
    {/if}
    <div bind:this={mountEl} class="player-mount"></div>
  </div>
</aside>

<style>
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    width: min(840px, 100vw);
    background: #0f1115;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    z-index: 60;
  }
  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .drawer-head h2 {
    margin: 0;
    font-size: 0.95rem;
    color: #f5f5f7;
  }
  .close-btn {
    background: transparent;
    color: #f5f5f7;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.5rem;
    width: 2rem;
    height: 2rem;
    cursor: pointer;
    font-size: 1.125rem;
    line-height: 1;
  }
  .close-btn:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .drawer-body {
    flex: 1;
    overflow: auto;
    padding: 1rem;
  }
  .player-mount {
    width: 100%;
    min-height: 480px;
  }
  .muted {
    color: #888;
  }
  .error {
    color: #f87171;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
  }
</style>
