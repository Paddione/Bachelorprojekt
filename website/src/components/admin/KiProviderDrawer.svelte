<script lang="ts">
  import { modelsFor, type InterfaceDef } from '../../lib/ki-catalog';
  import AdminDrawer from './ui/AdminDrawer.svelte';

  interface ProviderEntry {
    id: number; source: string; tier: 'sonnet' | 'haiku'; priority: number;
    provider: string; model_id: string; base_url: string | null;
    max_concurrent: number; enabled: boolean;
    api_key_hint: string | null;
  }
  interface Health {
    provider: string; cooldown_until: string | null; active_agents: number;
  }
  interface FormValues {
    source: string; tier: 'sonnet' | 'haiku'; priority: number;
    provider: string; model_id: string; base_url: string;
    max_concurrent: number; enabled: boolean; api_key: string;
  }

  interface Props {
    title: string;
    entries: ProviderEntry[];
    health: Health[];
    catalog: InterfaceDef[];
    editId: number | null;
    form: FormValues;
    confirmingDelete: number | null;
    onclose: () => void;
    onsave: () => void;
    onedit: (e: ProviderEntry) => void;
    onnew: () => void;
    oncanceledit: () => void;
    ondelete: (id: number) => void;
    onconfirmdelete: (id: number | null) => void;
    onchangepriority: (e: ProviderEntry, delta: number) => void;
    onproviderchange: () => void;
    showtoast: (msg: string) => void;
  }

  let {
    title, entries, health, catalog, editId, form, confirmingDelete,
    onclose: oncloseExternal, onsave, onedit, onnew, oncanceledit, ondelete, onconfirmdelete,
    onchangepriority, onproviderchange, showtoast: _showtoast,
  }: Props = $props();

  let open = $state(true);

  // Guard against double-invocation: AdminDrawer calls `onclose` for every
  // native dismissal path (Escape, backdrop, dialog.close()) in addition to
  // the explicit header × button calling this function directly.
  function onclose() {
    if (!open) return;
    open = false;
    oncloseExternal();
  }

  function inCooldown(provider: string): boolean {
    const h = health.find((x) => x.provider === provider);
    return !!h?.cooldown_until && new Date(h.cooldown_until) > new Date();
  }
</script>

{#snippet drawerBody()}
  <ul class="chain-list">
    {#each entries as e (e.id)}
      <li class:disabled={!e.enabled}>
        <div class="row">
          <span class="prio">
            <button onclick={() => onchangepriority(e, -1)} aria-label="höher">↑</button>
            {e.priority}
            <button onclick={() => onchangepriority(e, 1)} aria-label="niedriger">↓</button>
          </span>
          <span class="who">{e.provider} · {e.model_id} · {e.tier}{e.api_key_hint ? ' 🔑' : ''}</span>
          <span class="badge {inCooldown(e.provider) ? 'cooldown' : e.enabled ? 'live' : 'off'}">
            &#9679; {inCooldown(e.provider) ? 'cooldown' : e.enabled ? 'live' : 'off'}
          </span>
          <button onclick={() => onedit(e)} aria-label="bearbeiten">&#x270F;&#xFE0F;</button>
          {#if confirmingDelete === e.id}
            <button class="danger" onclick={() => ondelete(e.id)}>Wirklich löschen?</button>
          {:else}
            <button onclick={() => onconfirmdelete(e.id)} aria-label="löschen">&#x1F5D1;&#xFE0F;</button>
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
    <button class="add" onclick={onnew}>+ Provider hinzufügen</button>
  {/if}
{/snippet}

<AdminDrawer bind:open {title} {onclose} body={drawerBody} />

{#snippet formFields()}
  <form class="fields" onsubmit={(ev) => { ev.preventDefault(); onsave(); }}>
    <select bind:value={form.provider} onchange={onproviderchange}>
      <option value="" disabled>— Schnittstelle wählen —</option>
      {#each catalog as ic (ic.id)}<option value={ic.id}>{ic.label}</option>{/each}
    </select>
    {#if modelsFor(form.provider).length}
      <select bind:value={form.model_id}>
        <option value="" disabled>— Modell wählen —</option>
        {#each modelsFor(form.provider) as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
      </select>
    {:else}
      <input placeholder="model_id" bind:value={form.model_id} />
    {/if}
    <input placeholder="base_url (optional)" bind:value={form.base_url} />
    {#if editId !== -1}
      {@const hint = entries.find((e) => e.id === editId)?.api_key_hint}
      <input type="password" autocomplete="new-password"
        placeholder={hint ? `Key gesetzt (${hint}) — leer lassen = unverändert` : 'API-Key setzen (optional)'}
        bind:value={form.api_key} />
    {:else}
      <input type="password" autocomplete="new-password" placeholder="API-Key (optional)" bind:value={form.api_key} />
    {/if}
    <select bind:value={form.tier}><option value="sonnet">sonnet</option><option value="haiku">haiku</option></select>
    <input placeholder="source" bind:value={form.source} />
    <input type="number" min="1" placeholder="max_concurrent" bind:value={form.max_concurrent} />
    <input type="number" min="0" placeholder="priority" bind:value={form.priority} />
    <label><input type="checkbox" bind:checked={form.enabled} /> aktiv</label>
    <div class="actions"><button type="submit">Speichern</button><button type="button" onclick={oncanceledit}>Abbrechen</button></div>
  </form>
{/snippet}
