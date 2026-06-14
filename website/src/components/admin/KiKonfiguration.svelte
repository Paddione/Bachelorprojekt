<script lang="ts">
  interface ProviderEntry {
    id: number; source: string; tier: 'sonnet' | 'haiku'; priority: number;
    provider: string; model_id: string; base_url: string | null;
    max_concurrent: number; enabled: boolean;
  }
  interface Health {
    provider: string; cooldown_until: string | null; active_agents: number;
  }
  interface EnvStatus {
    ANTHROPIC_API_KEY: boolean; VOYAGE_API_KEY: boolean;
    LLM_ENABLED: boolean; LLM_HOST_IP: string | null;
  }

  // Each card maps an action label to the source-patterns that belong to it.
  const CARDS = [
    { key: 'chat',     icon: '💬', label: 'Chat',     sources: ['chat/*', '*'] },
    { key: 'tickets',  icon: '🎫', label: 'Tickets',  sources: ['tickets/classify'] },
    { key: 'meetings', icon: '📅', label: 'Meetings', sources: ['meetings/*'] },
    { key: 'embed',    icon: '🔢', label: 'Embeddings', sources: [] },
  ] as const;
  type CardKey = (typeof CARDS)[number]['key'];

  let entries = $state<ProviderEntry[]>([]);
  let health = $state<Health[]>([]);
  let env = $state<EnvStatus | null>(null);
  let embed = $state<{ primary: string; fallback: string | null }>({ primary: 'bge-m3', fallback: null });
  let loadError = $state('');
  let toast = $state('');

  // Drawer state.
  let openCard = $state<CardKey | null>(null);
  let editId = $state<number | null>(null); // null = no inline form; -1 = "new"
  let form = $state(blankForm());

  function blankForm(source = '') {
    return { source, tier: 'sonnet' as 'sonnet' | 'haiku', priority: 1, provider: '', model_id: '', base_url: '', max_concurrent: 3, enabled: true };
  }

  function showToast(msg: string) { toast = msg; setTimeout(() => { if (toast === msg) toast = ''; }, 5000); }

  function inCooldown(provider: string): boolean {
    const h = health.find((x) => x.provider === provider);
    return !!h?.cooldown_until && new Date(h.cooldown_until) > new Date();
  }

  // Providers belonging to a card, ordered for the fallback chain.
  function entriesFor(card: CardKey): ProviderEntry[] {
    const def = CARDS.find((c) => c.key === card)!;
    return entries
      .filter((e) => def.sources.includes(e.source))
      .sort((a, b) => a.priority - b.priority);
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

  async function load() {
    loadError = '';
    try {
      const [pRes, eRes, mRes] = await Promise.all([
        fetch('/api/admin/ki/providers'),
        fetch('/api/admin/ki/env-status'),
        fetch('/api/admin/ki/embeddings'),
      ]);
      if (!pRes.ok || !eRes.ok || !mRes.ok) throw new Error('Laden fehlgeschlagen');
      const p = await pRes.json();
      entries = p.entries; health = p.health;
      env = await eRes.json();
      embed = await mRes.json();
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Unbekannter Fehler';
    }
  }

  $effect(() => { load(); });

  function openDrawer(card: CardKey) {
    openCard = card;
    editId = null;
    form = blankForm(CARDS.find((c) => c.key === card)!.sources[0] ?? '');
  }
  function closeDrawer() { openCard = null; editId = null; }

  function startEdit(e: ProviderEntry) {
    editId = e.id;
    form = { source: e.source, tier: e.tier, priority: e.priority, provider: e.provider, model_id: e.model_id, base_url: e.base_url ?? '', max_concurrent: e.max_concurrent, enabled: e.enabled };
  }
  function startNew() {
    editId = -1;
    form = blankForm(openCard ? CARDS.find((c) => c.key === openCard)!.sources[0] ?? '' : '');
  }

  async function saveForm() {
    const payload = { ...form, base_url: form.base_url.trim() || null };
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

  let confirmingDelete = $state<number | null>(null);
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
    embed = { primary, fallback };
  }

  // Current embedding radio value derived from primary+fallback.
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
  {/if}

  <div class="grid">
    {#each CARDS as card (card.key)}
      <button class="card" onclick={() => openDrawer(card.key)}>
        <div class="card-head">
          <span class="icon">{card.icon}</span>
          <span class="title">{card.label}</span>
          {#if card.key !== 'embed'}
            <span class="dot {cardDotRed(card.key) ? 'red' : 'green'}"></span>
          {/if}
        </div>
        {#if card.key === 'embed'}
          <p class="meta">Primär: {embed.primary}{embed.fallback ? ` · Fallback: ${embed.fallback}` : ''}</p>
        {:else}
          <p class="meta">{entriesFor(card.key).filter((e) => e.enabled).length} aktiv</p>
          <p class="chain">{chainSummary(card.key)}</p>
        {/if}
      </button>
    {/each}
  </div>

  {#if openCard}
    <div class="scrim" onclick={closeDrawer} role="presentation"></div>
    <aside class="drawer">
      <header><h2>{CARDS.find((c) => c.key === openCard)!.label}</h2><button onclick={closeDrawer}>&#x2715;</button></header>

      {#if openCard === 'embed'}
        <div class="embed">
          <label><input type="radio" name="embed" checked={embedChoice === 'bge'} onchange={() => applyEmbedChoice('bge')} /> bge-m3 (lokal)</label>
          <label><input type="radio" name="embed" checked={embedChoice === 'voyage'} onchange={() => applyEmbedChoice('voyage')} /> voyage</label>
          <label><input type="radio" name="embed" checked={embedChoice === 'both'} onchange={() => applyEmbedChoice('both')} /> beide (lokal primär, voyage Fallback)</label>
          <p class="hint">Embedding-Wechsel gilt erst beim nächsten Pod-Restart (ENV-basiert).</p>
        </div>
      {:else}
        <ul class="chain-list">
          {#each entriesFor(openCard) as e (e.id)}
            <li class:disabled={!e.enabled}>
              <div class="row">
                <span class="prio">
                  <button onclick={() => changePriority(e, -1)} aria-label="höher">↑</button>
                  {e.priority}
                  <button onclick={() => changePriority(e, 1)} aria-label="niedriger">↓</button>
                </span>
                <span class="who">{e.provider} · {e.model_id} · {e.tier}</span>
                <span class="badge {inCooldown(e.provider) ? 'cooldown' : e.enabled ? 'live' : 'off'}">
                  &#9679; {inCooldown(e.provider) ? 'cooldown' : e.enabled ? 'live' : 'off'}
                </span>
                <button onclick={() => startEdit(e)} aria-label="bearbeiten">&#x270F;&#xFE0F;</button>
                {#if confirmingDelete === e.id}
                  <button class="danger" onclick={() => doDelete(e.id)}>Wirklich löschen?</button>
                {:else}
                  <button onclick={() => (confirmingDelete = e.id)} aria-label="löschen">&#x1F5D1;&#xFE0F;</button>
                {/if}
              </div>

              {#if editId === e.id}
                {@render formFields()}
              {/if}
            </li>
          {/each}
        </ul>

        {#if editId === -1}
          <div class="new-form">{@render formFields()}</div>
        {:else}
          <button class="add" onclick={startNew}>+ Provider hinzufügen</button>
        {/if}
      {/if}
    </aside>
  {/if}

  {#if toast}<div class="toast" role="alert">{toast}</div>{/if}
</div>

{#snippet formFields()}
  <form class="fields" onsubmit={(ev) => { ev.preventDefault(); saveForm(); }}>
    <input placeholder="provider" bind:value={form.provider} />
    <input placeholder="model_id" bind:value={form.model_id} />
    <input placeholder="base_url (optional)" bind:value={form.base_url} />
    <select bind:value={form.tier}><option value="sonnet">sonnet</option><option value="haiku">haiku</option></select>
    <input placeholder="source" bind:value={form.source} />
    <input type="number" min="1" placeholder="max_concurrent" bind:value={form.max_concurrent} />
    <input type="number" min="0" placeholder="priority" bind:value={form.priority} />
    <label><input type="checkbox" bind:checked={form.enabled} /> aktiv</label>
    <div class="actions"><button type="submit">Speichern</button><button type="button" onclick={() => (editId = null)}>Abbrechen</button></div>
  </form>
{/snippet}

<style>
  .ki-root { padding: 8px; }
  .banner { display: flex; gap: 16px; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; background: var(--admin-surface, #f4f4f5); }
  .banner.err { background: #fde8e8; color: #9b1c1c; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .card { text-align: left; padding: 16px; border: 1px solid var(--admin-border, #e4e4e7); border-radius: 12px; background: var(--admin-bg, #fff); cursor: pointer; }
  .card-head { display: flex; align-items: center; gap: 8px; }
  .card .icon { font-size: 20px; }
  .card .title { font-weight: 700; flex: 1; }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .dot.green { background: #16a34a; } .dot.red { background: #dc2626; }
  .meta { color: var(--admin-text-mute, #71717a); font-size: 13px; margin: 6px 0 0; }
  .chain { font-size: 12px; margin: 4px 0 0; }
  .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.3); }
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 400px; background: var(--admin-bg, #fff); border-left: 1px solid var(--admin-border, #e4e4e7); padding: 16px; overflow-y: auto; }
  .drawer header { display: flex; justify-content: space-between; align-items: center; }
  .chain-list { list-style: none; padding: 0; }
  .chain-list li { border-bottom: 1px solid var(--admin-border, #eee); padding: 8px 0; }
  .chain-list li.disabled { opacity: .5; }
  .row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .prio button { padding: 0 4px; }
  .who { flex: 1; }
  .badge.live { color: #16a34a; } .badge.cooldown { color: #d97706; } .badge.off { color: #71717a; }
  .fields { display: grid; gap: 6px; margin-top: 8px; }
  .fields input, .fields select { padding: 4px 6px; }
  .actions { display: flex; gap: 8px; }
  .add { margin-top: 12px; }
  .danger { color: #dc2626; }
  .hint { font-size: 12px; color: var(--admin-text-mute, #71717a); }
  .toast { position: fixed; bottom: 16px; right: 16px; background: #9b1c1c; color: #fff; padding: 10px 14px; border-radius: 8px; }
</style>
