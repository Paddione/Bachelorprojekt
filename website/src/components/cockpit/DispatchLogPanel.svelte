<!--
  DispatchLogPanel.svelte — Live-Liste der Dispatch-Mitschnitte im SDLC Cockpit (T003277).

  WICHTIG (wie PipelinePanel, E22): Dieser Rahmen traegt BEWUSST KEIN
  `data-panel-type`-Attribut. .lavish/kit/panel.js adoptiert beim DOMContentLoaded alle
  [data-panel-type]-Elemente und raeumt bei refresh() den Body leer — eine Svelte-Insel
  darin wuerde ausgeraeumt. Genutzt wird nur die geteilte CSS-Schicht (panel.css).

  Die Daten kommen ueber den Adapter (`window.data`), nicht ueber eigene fetch-Aufrufe:
  openspec/specs/sdlc-cockpit.md, "Daten-Adapter — Kein direkter fetch() aus Panels".
  Die Liste traegt keine Bodies; die holt erst das Aufklappen einer Zeile.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface DispatchHead {
    id: number; ts: string; backend: string;
    requested_model: string | null; served_model: string | null;
    http_status: number | null; duration_ms: number | null;
    streamed: boolean; stream_incomplete: boolean;
    truncated: boolean; original_bytes: number | null;
    slot_id: number | null; dispatch_ticket: string | null; dispatch_partial: string | null;
    prompt_tokens: number | null; completion_tokens: number | null;
  }
  interface DispatchDetail extends DispatchHead {
    request_body: string | null; response_body: string | null;
  }
  /** Der Adapter haengt als `window.data`; adapter.js wird von cockpit.astro geladen. */
  interface CockpitAdapter {
    dispatches: (o?: { limit?: number }) => Promise<{ items?: DispatchHead[]; error?: string }>;
    dispatchDetail: (id: number) => Promise<DispatchDetail & { error?: string }>;
    dispatchStream: (cb: (e: { type: string; data: unknown }) => void) => () => void;
  }

  export let initial: DispatchHead[] = [];

  let items: DispatchHead[] = initial;
  let error: string | null = null;
  let openId: number | null = null;
  let detail: DispatchDetail | null = null;
  let detailError: string | null = null;
  let stopStream: (() => void) | null = null;

  const adapter = (): CockpitAdapter | null =>
    (typeof window !== 'undefined' ? (window as unknown as { data?: CockpitAdapter }).data ?? null : null);

  async function reload() {
    const a = adapter();
    if (!a) return;
    const res = await a.dispatches({ limit: 50 });
    // D13 — kein stiller Ersatzwert: ein Fehler wird benannt, nicht als leere
    // Liste dargestellt, die wie "nichts passiert" aussaehe.
    if (res.error) { error = res.error; return; }
    error = null;
    items = res.items ?? [];
  }

  async function toggle(id: number) {
    if (openId === id) { openId = null; detail = null; return; }
    openId = id; detail = null; detailError = null;
    const a = adapter();
    if (!a) return;
    const res = await a.dispatchDetail(id);
    if (res?.error) { detailError = res.error; return; }
    detail = res;
  }

  onMount(() => {
    const a = adapter();
    if (!a) return;
    if (items.length === 0) void reload();
    // Push statt Polling (sdlc-cockpit.md, "Realtime-Push — LISTEN/NOTIFY-SSE").
    stopStream = a.dispatchStream((ev) => {
      const domain = (ev.data as { domain?: string } | null)?.domain;
      if (ev.type === 'dispatch' || domain === 'dispatch') void reload();
    });
  });
  onDestroy(() => stopStream?.());

  const time = (iso: string) => new Date(iso).toLocaleTimeString('de-DE');
  const ms = (v: number | null) => (v == null ? '—' : `${(v / 1000).toFixed(1)}s`);
  const kb = (v: number | null) => (v == null ? '' : `${Math.round(v / 1024)} KiB`);
  /** Leere Korrelationsfelder als ausdrueckliche Abwesenheit — eine leere Zelle
   *  liest sich wie ein Wert. */
  const or = (v: string | number | null) => (v == null || v === '' ? '—' : String(v));
</script>

<section class="panel panel--card" id="panel-dispatch-log" data-cockpit-panel="dispatch-log">
  <div class="panel__head">
    <span class="panel__title">Dispatch-Mitschnitt</span>
    <span class="panel__staleness">live</span>
  </div>
  <div class="panel__body">
    {#if error}
      <p class="dispatch__error">Quelle nicht erreichbar: {error}</p>
    {:else if items.length === 0}
      <p class="dispatch__empty">Noch keine Dispatches aufgezeichnet.</p>
    {:else}
      <table class="dispatch__table">
        <thead>
          <tr><th>Zeit</th><th>Backend</th><th>Modell</th><th>Ticket</th><th>Partial</th><th>Dauer</th><th>Status</th></tr>
        </thead>
        <tbody>
          {#each items as it (it.id)}
            <tr class="dispatch__row" class:dispatch__row--open={openId === it.id}
                on:click={() => toggle(it.id)}>
              <td>{time(it.ts)}</td>
              <td>{it.backend}</td>
              <td>{or(it.served_model ?? it.requested_model)}</td>
              <td>{or(it.dispatch_ticket)}</td>
              <td>{or(it.dispatch_partial)}</td>
              <td>{ms(it.duration_ms)}</td>
              <td>
                {or(it.http_status)}
                {#if it.stream_incomplete}<span class="dispatch__flag" title="Der Strom endete vor dem Abschlusssignal des Backends">abgebrochen</span>{/if}
                {#if it.truncated}<span class="dispatch__flag" title="Gespeicherter Text gekuerzt; Originalgroesse {kb(it.original_bytes)}">gekürzt</span>{/if}
              </td>
            </tr>
            {#if openId === it.id}
              <tr class="dispatch__detail-row">
                <td colspan="7">
                  {#if detailError}
                    <p class="dispatch__error">Detail nicht ladbar: {detailError}</p>
                  {:else if !detail}
                    <p class="dispatch__empty">Lade …</p>
                  {:else}
                    {#if detail.truncated}
                      <p class="dispatch__note">
                        Der gespeicherte Text ist gekürzt. Ursprüngliche Größe: {kb(detail.original_bytes)}.
                      </p>
                    {/if}
                    {#if detail.stream_incomplete}
                      <p class="dispatch__note">
                        Der Strom endete vor dem Abschlusssignal des Backends — die Antwort ist unvollständig.
                      </p>
                    {/if}
                    <p class="dispatch__meta">
                      Slot {or(detail.slot_id)} · Tokens {or(detail.prompt_tokens)}/{or(detail.completion_tokens)}
                    </p>
                    <h4>Anfrage</h4>
                    <pre class="dispatch__body">{detail.request_body ?? '—'}</pre>
                    <h4>Antwort</h4>
                    <pre class="dispatch__body">{detail.response_body ?? '—'}</pre>
                  {/if}
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</section>

<style>
  .dispatch__table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .dispatch__table th { text-align: left; opacity: 0.7; font-weight: 500; padding: 0.25rem 0.5rem; }
  .dispatch__row { cursor: pointer; }
  .dispatch__row:hover { background: rgba(127, 127, 127, 0.08); }
  .dispatch__row td { padding: 0.25rem 0.5rem; white-space: nowrap; }
  .dispatch__row--open { font-weight: 600; }
  .dispatch__flag { font-size: 0.7rem; padding: 0 0.3rem; border-radius: 3px; background: rgba(200, 120, 0, 0.25); margin-left: 0.3rem; }
  .dispatch__detail-row td { padding: 0.5rem; }
  .dispatch__body { max-height: 22rem; overflow: auto; white-space: pre-wrap; word-break: break-word;
    font-size: 0.75rem; padding: 0.5rem; border-radius: 4px; background: rgba(127, 127, 127, 0.1); }
  .dispatch__note { font-size: 0.8rem; opacity: 0.85; }
  .dispatch__meta { font-size: 0.78rem; opacity: 0.7; }
  .dispatch__error { color: #c0392b; font-size: 0.85rem; }
  .dispatch__empty { opacity: 0.6; font-size: 0.85rem; }
</style>
