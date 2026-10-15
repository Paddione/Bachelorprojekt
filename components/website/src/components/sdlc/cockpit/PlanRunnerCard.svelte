<script lang="ts">
  import ControlCard from './ControlCard.svelte';
  import { Stepper, ToggleSwitch } from '../../ui';
  import { MAX_DIRECT_SLOTS, MAX_CLOUD_SLOTS } from '../../../lib/sdlc/plan-slots';

  interface Suggestion {
    width: number;
    slotsDirect: number;
    slotsCloud: number;
    partials: number;
  }

  let slug = $state('');
  let auto = $state(true);
  let slotsDirect = $state(MAX_DIRECT_SLOTS);
  let slotsCloud = $state(1);
  let suggestion = $state<Suggestion | null>(null);
  let loading = $state(false);
  let error = $state('');
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const effectiveDirect = $derived(auto && suggestion ? suggestion.slotsDirect : slotsDirect);
  const effectiveCloud = $derived(auto && suggestion ? suggestion.slotsCloud : slotsCloud);
  const command = $derived(
    `node scripts/llm/plan-runner.mjs .agents/plans/${slug.trim() || '<slug>'}` +
      (auto ? ' --auto-slots' : ` --direct-slots ${effectiveDirect} --cloud-slots ${effectiveCloud}`),
  );

  async function fetchSuggestion(value: string) {
    const s = value.trim();
    if (!s) {
      suggestion = null;
      error = '';
      return;
    }
    loading = true;
    error = '';
    try {
      const res = await fetch(`/sdlc/api/plan-runner?slug=${encodeURIComponent(s)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      suggestion = (await res.json()) as Suggestion;
    } catch (e) {
      suggestion = null;
      error = e instanceof Error ? e.message : 'Unbekannter Fehler';
    } finally {
      loading = false;
    }
  }

  function onSlugInput(value: string) {
    slug = value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void fetchSuggestion(value), 400);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = command;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 1500);
  }
</script>

<ControlCard title="Plan-Runner">
  <div data-testid="plan-runner-card" class="flex flex-col gap-2">
    <label class="text-muted text-xs" for="plan-runner-slug">Plan-Slug (.agents/plans/…)</label>
    <input
      id="plan-runner-slug"
      class="rounded bg-white/5 px-2 py-1 text-sm text-light outline-none placeholder:text-muted"
      value={slug}
      oninput={(e) => onSlugInput(e.currentTarget.value)}
      placeholder="mein-plan"
      autocomplete="off"
      spellcheck="false"
    />
    <div class="flex items-center gap-2">
      <ToggleSwitch value={auto} onchange={(v) => (auto = v)} />
      <span class="text-muted text-xs">Auto-Slots aus Planform</span>
    </div>
    {#if loading}
      <p class="text-muted text-xs">Berechne Slots…</p>
    {:else if error}
      <p class="text-amber-400/90 text-xs">{error}</p>
    {:else if auto && suggestion}
      <p class="text-muted text-xs">
        {suggestion.partials} Partials, Frontbreite {suggestion.width} → Direkt {suggestion.slotsDirect} · Cloud {suggestion.slotsCloud}
      </p>
    {/if}
    <div class="flex items-center gap-2">
      <span class="text-muted text-xs w-10">Direkt</span>
      <Stepper value={slotsDirect} min={0} max={MAX_DIRECT_SLOTS} onchange={(v) => (slotsDirect = v)} />
    </div>
    <div class="flex items-center gap-2">
      <span class="text-muted text-xs w-10">Cloud</span>
      <Stepper value={slotsCloud} min={0} max={MAX_CLOUD_SLOTS} onchange={(v) => (slotsCloud = v)} />
    </div>
    <code class="rounded bg-black/30 px-2 py-1 text-xs break-all">{command}</code>
    <button
      type="button"
      class="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 transition-colors"
      onclick={copy}
    >
      {copied ? 'Kopiert' : 'Befehl kopieren'}
    </button>
    <p class="text-muted text-xs">Läuft auf der Box (GPUs/opencode), nicht im Container — Befehl dort ausführen.</p>
  </div>
</ControlCard>
