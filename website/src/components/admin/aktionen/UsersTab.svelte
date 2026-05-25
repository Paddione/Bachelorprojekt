<script lang="ts">
  import { onMount } from 'svelte';
  import { apiCall, toast } from '../../../lib/admin-api';

  type KcUser = { id: string; username: string; email: string; firstName: string; lastName: string; groups?: string[] };
  type Group = { id: string; name: string };

  let users: KcUser[] = [];
  let groups: Group[] = [];
  let loading = true;
  let helpOpen = false;
  let search = '';
  let modal: { firstName: string; lastName: string; email: string; selectedGroupIds: string[]; sendInvite: boolean } | null = null;
  let pending = false;

  async function load() {
    const [u, g] = await Promise.all([
      apiCall<{ users: KcUser[] }>('/api/admin/ops/users/list'),
      apiCall<{ groups: Group[] }>('/api/admin/ops/users/groups'),
    ]);
    users = u.ok ? u.data.users : [];
    groups = g.ok ? g.data.groups : [];
    loading = false;
  }

  function openModal() {
    modal = { firstName: '', lastName: '', email: '', selectedGroupIds: [], sendInvite: true };
  }

  function toggleGroup(id: string) {
    if (!modal) return;
    modal.selectedGroupIds = modal.selectedGroupIds.includes(id)
      ? modal.selectedGroupIds.filter(g => g !== id)
      : [...modal.selectedGroupIds, id];
  }

  async function submitCreate() {
    if (!modal) return;
    pending = true;
    const r = await apiCall<{ partial: boolean; inviteError?: string }>('/api/admin/ops/users/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: modal.firstName, lastName: modal.lastName, email: modal.email, groupIds: modal.selectedGroupIds, sendInvite: modal.sendInvite }),
    });
    if (r.ok) {
      if (r.data.partial) toast('warning', `Anwender angelegt, Einladung fehlgeschlagen: ${r.data.inviteError ?? '?'}`);
      else toast('success', 'Anwender erfolgreich angelegt');
      modal = null;
      load();
    }
    pending = false;
  }

  $: filteredUsers = users.filter(u =>
    !search || u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  onMount(load);
</script>

<div class="space-y-4">
  <div class="flex flex-wrap gap-2 items-center">
    <button on:click={openModal} class="px-4 py-2 rounded-lg bg-admin-primary text-admin-bg font-bold" style="min-height: 44px;" data-testid="user-new">+ Neuer Anwender</button>
    <input bind:value={search} placeholder="Suchen…" class="px-3 py-2 rounded-lg bg-admin-surface border border-admin-border text-white flex-1 min-w-[180px]" style="min-height: 44px;" />
    <button on:click={() => helpOpen = !helpOpen} class="text-admin-text-mute hover:text-white p-2" aria-label="Hilfe">ℹ️</button>
  </div>
  {#if helpOpen}
    <div class="p-3 bg-admin-sidebar-bg rounded-lg border border-admin-border text-xs text-admin-text-mute">
      Erstellt einen neuen Account in Keycloak. Bei aktivierter Einladung erhält der Anwender eine Email mit einem Passwort-Reset-Link.
    </div>
  {/if}
  {#if loading}
    <p class="text-admin-text-mute">Lade…</p>
  {:else}
    <table class="w-full text-sm">
      <thead class="text-admin-text-mute text-xs uppercase">
        <tr><th class="text-left p-2">Username</th><th class="text-left p-2">Name</th><th class="text-left p-2">Email</th><th class="text-left p-2">Gruppen</th></tr>
      </thead>
      <tbody>
        {#each filteredUsers as u}
          <tr class="border-t border-admin-border"><td class="p-2">{u.username}</td><td class="p-2">{u.firstName} {u.lastName}</td><td class="p-2">{u.email}</td><td class="p-2 text-xs">{(u.groups ?? []).join(', ')}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if modal}
  <div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
    <div class="bg-admin-surface p-6 rounded-2xl border border-admin-border max-w-md w-full">
      <h3 class="text-lg font-bold text-white mb-4">Neuer Anwender</h3>
      <div class="space-y-3">
        <input bind:value={modal.firstName} placeholder="Vorname" class="w-full px-3 py-2 rounded-lg bg-admin-bg border border-admin-border text-white" data-testid="user-firstname" />
        <input bind:value={modal.lastName} placeholder="Nachname" class="w-full px-3 py-2 rounded-lg bg-admin-bg border border-admin-border text-white" data-testid="user-lastname" />
        <input bind:value={modal.email} type="email" placeholder="Email" class="w-full px-3 py-2 rounded-lg bg-admin-bg border border-admin-border text-white" data-testid="user-email" />
        <div>
          <label class="text-xs text-admin-text-mute uppercase mb-2 block">Gruppen</label>
          <div class="flex flex-wrap gap-2">
            {#each groups as g}
              <label class="flex items-center gap-2 px-3 py-2 rounded-lg bg-admin-bg border border-admin-border cursor-pointer">
                <input type="checkbox" checked={modal.selectedGroupIds.includes(g.id)} on:change={() => toggleGroup(g.id)} />
                <span class="text-sm text-white">{g.name}</span>
              </label>
            {/each}
          </div>
        </div>
        <label class="flex items-center gap-2 text-sm text-admin-text-mute">
          <input type="checkbox" bind:checked={modal.sendInvite} /> Email-Einladung senden
        </label>
      </div>
      <div class="flex gap-2 justify-end mt-6">
        <button on:click={() => modal = null} class="px-4 py-2 rounded-lg bg-admin-surface border border-admin-border text-admin-text-mute">Abbrechen</button>
        <button on:click={submitCreate} disabled={pending} class="px-4 py-2 rounded-lg bg-admin-primary text-admin-bg font-bold disabled:opacity-50" data-testid="user-submit">
          {pending ? 'Lädt…' : 'Anlegen'}
        </button>
      </div>
    </div>
  </div>
{/if}
