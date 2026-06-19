<script lang="ts">
  import { KI_SERVICES } from '../../lib/ki-services';
  import { interfaceById, type InterfaceDef } from '../../lib/ki-catalog';
  import KiCard from './KiCard.svelte';
  import KiProviderDrawer from './KiProviderDrawer.svelte';
  import KiCoachingDrawer from './KiCoachingDrawer.svelte';

  interface ProviderEntry {
    id: number; source: string; tier: 'sonnet' | 'haiku'; priority: number;
    provider: string; model_id: string; base_url: string | null;
    max_concurrent: number; enabled: boolean;
    api_key_hint: string | null;
  }
  interface Health {
    provider: string; cooldown_until: string | null; active_agents: number;
  }
  interface LocalGpuStatus { reachable: boolean; models?: string[]; }
  interface EnvStatus {
    ANTHROPIC_API_KEY: boolean; VOYAGE_API_KEY: boolean;
    LLM_ENABLED: boolean; LLM_HOST_IP: string | null;
    localGpu?: { lmstudio: LocalGpuStatus; ollama: LocalGpuStatus };
  }

  type CardDef = { key: string; icon: string; label: string; sources: string[]; defaultTier: 'sonnet' | 'haiku' };
  const CARDS: CardDef[] = [
    { key: 'global', icon: '⭐', label: 'Standard (global)', sources: ['*'], defaultTier: 'sonnet' },
    ...KI_SERVICES.filter((s) => s.paramSet === 'routing').map((s) => ({
      key: s.key, icon: s.icon, label: s.label, sources: [s.source],
      defaultTier: (s.tier === 'haiku' ? 'haiku' : 'sonnet') as 'sonnet' | 'haiku',
    })),
    { key: 'embed', icon: '🔢', label: 'Embeddings', sources: [] as string[], defaultTier: 'sonnet' },
  ];
  type CardKey = string;

  let catalog = $state<InterfaceDef[]>([]);
  let entries = $state<ProviderEntry[]>([]);
  let health = $state<Health[]>([]);
  let env = $state<EnvStatus | null>(null);
  let embed = $state<{ primary: string; fallback: string | null; rerankEnabled: boolean }>({ primary: 'bge-m3', fallback: null, rerankEnabled: false });
  let loadError = $state('');
  let toast = $state('');

  let openCard = $state<CardKey | null>(null);
  let coachingOpen = $state(false);
  let editId = $state<number | null>(null);
  let confirmingDelete = $state<number | null>(null);
  let form = $state(blankForm());

  function blankForm(source = '', tier: 'sonnet' | 'haiku' = 'sonnet') {
    return { source, tier, priority: 1, provider: '', model_id: '', base_url: '', max_concurrent: 3, enabled: true, api_key: '' };
  }

  function onProviderChange() {
    const def = interfaceById(form.provider);
    if (def?.defaultBaseUrl && !form.base_url.trim()) {
      form.base_url = def.defaultBaseUrl;
    }
  }

  function cardFor(key: CardKey): CardDef | undefined { return CARDS.find((c) => c.key === key); }
  function showToast(msg: string) { toast = msg; setTimeout(() => { if (toast === msg) toast = ''; }, 5000); }

  function inCooldown(provider: string): boolean {
    const h = health.find((x) => x.provider === provider);
    return !!h?.cooldown_until && new Date(h.cooldown_until) > new Date();
  }

  function entriesFor(card: CardKey): ProviderEntry[] {
    const def = CARDS.find((c) => c.key === card)!;
    return entries.filter((e) => def.sources.includes(e.source)).sort((a, b) => a.priority - b.priority);
  }

  function chainSummary(card: CardKey): string {
    const es = entriesFor(card).filter((e) => e.enabled);
    if (!es.length) return '— keine aktiven Provider —';
    return es.map((e) => `${e.tier} → ${e.provider}`).join(' | ');
  }

  function cardDotRed(card: CardKey): boolean {
    const es = entriesFor(card).filter((e) => e.enabled);
    return es.length > 0 && es.every((e) => inCooldown(e.provider));
  }

  function cardMeta(card: CardDef): string {
    if (card.key === 'embed') {
      const fb = embed.fallback ? ` · Fallback: ${embed.fallback}` : '';
      const rr = ` · Rerank: ${embed.rerankEnabled ? 'aktiv' : 'inaktiv'}`;
      return `Primär: ${embed.primary}${fb}${rr}`;
    }
    return `${entriesFor(card.key).filter((e) => e.enabled).length} aktiv`;
  }

  function cardChain(card: CardDef): string | undefined {
    return card.key === 'embed' ? undefined : chainSummary(card.key);
  }

  function cardDot(card: CardDef): 'green' | 'red' | null {
    if (card.key === 'embed') return null;
    return cardDotRed(card.key) ? 'red' : 'green';
  }

  async function load() {
    loadError = '';
    try {
      const [pRes, eRes, mRes, cRes] = await Promise.all([
        fetch('/api/admin/ki/providers'),
        fetch('/api/admin/ki/env-status'),
        fetch('/api/admin/ki/embeddings'),
        fetch('/api/admin/ki/catalog'),
      ]);
      if (!pRes.ok || !eRes.ok || !mRes.ok || !cRes.ok) throw new Error('Laden fehlgeschlagen');
      const p = await pRes.json();
      entries = p.entries; health = p.health;
      env = await eRes.json();
      embed = await mRes.json();
      catalog = (await cRes.json()).catalog;
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Unbekannter Fehler';
    }
  }

  $effect(() => { load(); });

  function openDrawer(card: CardKey) {
    openCard = card;
    editId = null; confirmingDelete = null;
    const def = cardFor(card);
    form = blankForm(def?.sources[0] ?? '', def?.defaultTier ?? 'sonnet');
  }
  function closeDrawer() { openCard = null; editId = null; confirmingDelete = null; }

  function startEdit(e: ProviderEntry) {
    editId = e.id;
    form = { source: e.source, tier: e.tier, priority: e.priority, provider: e.provider, model_id: e.model_id, base_url: e.base_url ?? '', max_concurrent: e.max_concurrent, enabled: e.enabled, api_key: '' };
  }
  function startNew() {
    editId = -1;
    const def = openCard ? cardFor(openCard) : undefined;
    form = blankForm(def?.sources[0] ?? '', def?.defaultTier ?? 'sonnet');
  }

  async function saveForm() {
    const payload: Record<string, unknown> = { ...form, base_url: form.base_url.trim() || null };
    if (editId !== -1 && !form.api_key.trim()) { delete payload.api_key; }
    else { payload.api_key = form.api_key.trim() || null; }
    const isNew = editId === -1;
    const res = await fetch(isNew ? '/api/admin/ki/providers' : `/api/admin/ki/providers/${editId}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? `Fehler ${res.status}`);
      return;
    }
    editId = null;
    await load();
  }

  async function changePriority(e: ProviderEntry, delta: number) {
    const next = e.priority + delta;
    if (next < 0) return;
    const res = await fetch(`/api/admin/ki/providers/${e.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: next }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? 'Priorität konnte nicht geändert werden');
      return;
    }
    await load();
  }

  async function doDelete(id: number) {
    const res = await fetch(`/api/admin/ki/providers/${id}`, { method: 'DELETE' });
    confirmingDelete = null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? 'Löschen fehlgeschlagen');
      return;
    }
    await load();
  }

  async function saveEmbed(primary: string, fallback: string | null) {
    const res = await fetch('/api/admin/ki/embeddings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primary, fallback }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? 'Speichern fehlgeschlagen');
      return;
    }
    embed = { primary, fallback, rerankEnabled: embed.rerankEnabled };
  }

  let embedChoice = $derived(
    embed.primary === 'voyage' ? 'voyage'
      : embed.fallback === 'voyage' ? 'both'
      : 'bge',
  );
  function applyEmbedChoice(choice: string) {
    if (choice === 'voyage') saveEmbed('voyage', null);
    else if (choice === 'both') saveEmbed('bge-m3', 'voyage');
    else saveEmbed('bge-m3', null);
  }
</script>

<div class="ki-root">
  {#if loadError}
    <div class="banner err">&#9888; {loadError} <button onclick={load}>Erneut laden</button></div>
  {/if}

  {#if env}
    <div class="banner keys">
      <span>ANTHROPIC_API_KEY {env.ANTHROPIC_API_KEY ? '✓' : '⚠ fehlt'}</span>
      <span>VOYAGE_API_KEY {env.VOYAGE_API_KEY ? '✓' : '⚠ fehlt'}</span>
      <span>LLM {env.LLM_ENABLED ? `✓ (${env.LLM_HOST_IP ?? 'kein Host'})` : 'aus'}</span>
    </div>
    {#if env.localGpu}
      <div class="banner gpu">
        <span class="gpu-pill {env.localGpu.lmstudio.reachable ? 'on' : 'off'}">
          LM Studio {env.localGpu.lmstudio.reachable
            ? `✓ (${env.localGpu.lmstudio.models?.length ?? 0} Modelle)`
            : 'nicht erreichbar'}
        </span>
        <span class="gpu-pill {env.localGpu.ollama.reachable ? 'on' : 'off'}">
          Ollama {env.localGpu.ollama.reachable
            ? `✓ (${env.localGpu.ollama.models?.length ?? 0} Modelle)`
            : 'nicht erreichbar'}
        </span>
      </div>
    {/if}
  {/if}

  <div class="grid">
    {#each CARDS as card (card.key)}
      <KiCard
        icon={card.icon} label={card.label}
        dot={cardDot(card)} meta={cardMeta(card)} chain={cardChain(card)}
        onclick={() => openDrawer(card.key)}
      />
    {/each}

    <KiCard
      icon="🤝" label="Coaching"
      dot={null}
      meta="Provider, Modell & Prompt-Templates"
      chain="→ KI-Coaching konfigurieren"
      onclick={() => (coachingOpen = true)}
    />
  </div>

  {#if openCard && openCard === 'embed'}
    <div class="scrim" onclick={closeDrawer} role="presentation"></div>
    <aside class="drawer">
      <header><h2>Embeddings</h2><button onclick={closeDrawer}>&#x2715;</button></header>
      <div class="embed">
        <label><input type="radio" name="embed" checked={embedChoice === 'bge'} onchange={() => applyEmbedChoice('bge')} /> bge-m3 (lokal)</label>
        <label><input type="radio" name="embed" checked={embedChoice === 'voyage'} onchange={() => applyEmbedChoice('voyage')} /> voyage</label>
        <label><input type="radio" name="embed" checked={embedChoice === 'both'} onchange={() => applyEmbedChoice('both')} /> beide (lokal primär, voyage Fallback)</label>
        <p class="hint">Embedding-Wechsel gilt erst beim nächsten Pod-Restart (ENV-basiert).</p>
      </div>
    </aside>
  {/if}

  {#if openCard && openCard !== 'embed'}
    <KiProviderDrawer
      title={CARDS.find((c) => c.key === openCard)!.label}
      entries={entriesFor(openCard)} {health} {catalog}
      {editId} {form} {confirmingDelete}
      onclose={closeDrawer}
      onsave={saveForm}
      onedit={(e) => startEdit(e)}
      onnew={startNew}
      oncanceledit={() => (editId = null)}
      ondelete={(id) => doDelete(id)}
      onconfirmdelete={(id) => (confirmingDelete = id)}
      onchangepriority={(e, d) => changePriority(e, d)}
      onproviderchange={onProviderChange}
      showtoast={showToast}
    />
  {/if}

  {#if coachingOpen}
    <KiCoachingDrawer
      onclose={() => (coachingOpen = false)}
      showtoast={showToast}
    />
  {/if}

  {#if toast}<div class="toast" role="alert">{toast}</div>{/if}
</div>

<style>
  .ki-root { padding: 8px; }
  .banner { display: flex; gap: 16px; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; background: var(--admin-surface, #f4f4f5); }
  .banner.err { background: #fde8e8; color: #9b1c1c; }
  .banner.gpu { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.4rem; }
  .gpu-pill { font-size: 0.78rem; padding: 0.2rem 0.6rem; border-radius: 99px; border: 1px solid; }
  .gpu-pill.on { color: #4ade80; border-color: #16a34a44; background: #16a34a22; }
  .gpu-pill.off { color: #a1a1aa; border-color: #52525b44; background: #52525b22; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.3); z-index: 10; }
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 400px; background: var(--admin-bg, #fff); border-left: 1px solid var(--admin-border, #e4e4e7); padding: 16px; overflow-y: auto; z-index: 11; }
  .drawer header { display: flex; justify-content: space-between; align-items: center; }
  .embed { display: flex; flex-direction: column; gap: 8px; }
  .embed label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .hint { font-size: 12px; color: var(--admin-text-mute, #71717a); }
  .toast { position: fixed; bottom: 16px; right: 16px; background: #9b1c1c; color: #fff; padding: 10px 14px; border-radius: 8px; z-index: 100; }
</style>
