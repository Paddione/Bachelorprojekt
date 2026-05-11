<script lang="ts">
  import { onMount } from 'svelte';
  import { banner, dismissBanner, startArenaStream, type BannerState } from './arenaStore';

  let now = Date.now();
  let timer: any;

  async function fetchToken(): Promise<string> {
    const res = await fetch('/api/arena/token', { method: 'POST' });
    if (!res.ok) throw new Error('token-mint-failed');
    return (await res.json()).token;
  }

  onMount(() => {
    startArenaStream(fetchToken);
    timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  function fmt(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  $: state = $banner as BannerState;
</script>

{#if state.phase !== 'idle'}
  <aside class="arena-banner" class:closing={state.phase === 'closing'}>
    <span class="eye">[ ARENA · {state.phase === 'open' ? 'LOBBY OPEN' : 'IN PROGRESS'} ]</span>
    {#if state.phase === 'open'}
      <span class="host"><em>{state.hostName}</em> is opening an arena</span>
      <span class="count">· {state.humans} / 4 in</span>
      <span class="cd">join in {fmt(state.expiresAt - now)}</span>
      <a class="join" href="/portal/arena?lobby={state.code}">Join</a>
      <button class="dismiss" aria-label="Dismiss" on:click={() => dismissBanner(state.code)}>×</button>
    {:else if state.phase === 'in-progress'}
      <span class="count">{state.alive} / {state.total} alive</span>
      <a class="join" href="/portal/arena?lobby={state.code}&spec=1">Spectate</a>
      <button class="dismiss" aria-label="Dismiss" on:click={() => dismissBanner(state.code)}>×</button>
    {/if}
  </aside>
{/if}

<style>
  .arena-banner {
    position: sticky; top: 0; z-index: 1000;
    height: 44px;
    display: flex; align-items: center; gap: 14px;
    padding: 0 16px;
    background: #1a0e22;
    color: #f5f1e8;
    border-bottom: 1px solid #c8ff3f;
    font-family: 'Geist', system-ui, sans-serif;
    font-size: 13px;
  }
  .arena-banner.closing { opacity: 0; transition: opacity 600ms; }
  .eye {
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    letter-spacing: 0.18em; color: #c8ff3f;
  }
  .host em {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic; font-weight: 500; color: #f5f1e8;
  }
  .cd { font-family: 'JetBrains Mono', monospace; color: #c8ff3f; }
  .join {
    margin-left: auto;
    padding: 6px 14px;
    background: #c8ff3f; color: #1a0e22;
    text-decoration: none; font-weight: 600;
    border-radius: 3px;
  }
  .dismiss {
    background: transparent; border: none; color: #f5f1e8;
    font-size: 18px; cursor: pointer; padding: 0 4px;
  }
</style>