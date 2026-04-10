<script lang="ts">
  import { onMount } from 'svelte';

  interface SystemInfo {
    status: string;
    version: string;
    post_count: number;
    channel_count: number;
    team_count: number;
    file_count: number;
    daily_active_users: number;
  }

  interface MmUser {
    id: string;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    roles: string;
    create_at: number;
    delete_at: number;
    is_bot: boolean;
    bot_description?: string;
  }

  interface MmTeam {
    id: string;
    display_name: string;
    name: string;
    description: string;
    type: string;
    member_count: number;
  }

  interface MmChannel {
    id: string;
    team_id: string;
    type: string;
    display_name: string;
    name: string;
    header: string;
    purpose: string;
    total_msg_count: number;
    last_post_at: number;
    member_count: number;
  }

  let tab = $state<'overview' | 'users' | 'channels' | 'teams'>('overview');
  let loading = $state(true);
  let error = $state('');

  let system = $state<SystemInfo | null>(null);
  let users = $state<MmUser[]>([]);
  let bots = $state<MmUser[]>([]);
  let teams = $state<MmTeam[]>([]);
  let channels = $state<MmChannel[]>([]);
  let selectedTeam = $state('');
  let channelsLoading = $state(false);

  // Modal state
  let showModal = $state(false);
  let modalTitle = $state('');
  let modalAction = $state<(() => Promise<void>) | null>(null);
  let modalTarget = $state('');

  // Create channel form
  let showCreateChannel = $state(false);
  let newChannel = $state({ name: '', displayName: '', type: 'O' as 'O' | 'P', purpose: '', teamId: '' });

  // Post message form
  let showPostMessage = $state(false);
  let postTarget = $state({ channelId: '', channelName: '', message: '' });

  async function fetchOverview() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/admin/mattermost?resource=overview');
      if (!res.ok) throw new Error('Fehler beim Laden');
      const data = await res.json();
      system = data.system;
      users = data.users;
      bots = data.bots;
      teams = data.teams;
      if (teams.length > 0 && !selectedTeam) {
        selectedTeam = teams[0].id;
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function fetchChannels(teamId: string) {
    channelsLoading = true;
    try {
      const res = await fetch(`/api/admin/mattermost?resource=channels&teamId=${teamId}`);
      if (!res.ok) throw new Error('Fehler beim Laden der Kanäle');
      const data = await res.json();
      channels = data.channels;
    } catch (e: any) {
      error = e.message;
    } finally {
      channelsLoading = false;
    }
  }

  async function apiAction(action: string, payload: Record<string, unknown>) {
    const res = await fetch('/api/admin/mattermost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    return res.json();
  }

  function confirmAction(title: string, target: string, action: () => Promise<void>) {
    modalTitle = title;
    modalTarget = target;
    modalAction = action;
    showModal = true;
  }

  async function deactivateUser(userId: string) {
    await apiAction('deactivate_user', { userId });
    await fetchOverview();
  }

  async function handleDeleteChannel(channelId: string) {
    await apiAction('delete_channel', { channelId });
    if (selectedTeam) await fetchChannels(selectedTeam);
  }

  async function handleCreateChannel() {
    await apiAction('create_channel', {
      teamId: newChannel.teamId || selectedTeam,
      name: newChannel.name,
      displayName: newChannel.displayName,
      type: newChannel.type,
      purpose: newChannel.purpose,
    });
    showCreateChannel = false;
    newChannel = { name: '', displayName: '', type: 'O', purpose: '', teamId: '' };
    if (selectedTeam) await fetchChannels(selectedTeam);
  }

  async function handleDeleteTeam(teamId: string) {
    await apiAction('delete_team', { teamId });
    await fetchOverview();
  }

  async function handlePostMessage() {
    await apiAction('post_message', { channelId: postTarget.channelId, message: postTarget.message });
    showPostMessage = false;
    postTarget = { channelId: '', channelName: '', message: '' };
  }

  function formatDate(ts: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatRelative(ts: number): string {
    if (!ts) return 'nie';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours}h`;
    const days = Math.floor(hours / 24);
    return `vor ${days}d`;
  }

  function channelTypeLabel(type: string): string {
    switch (type) {
      case 'O': return 'Offen';
      case 'P': return 'Privat';
      case 'D': return 'Direktnachricht';
      case 'G': return 'Gruppe';
      default: return type;
    }
  }

  $effect(() => {
    if (selectedTeam && tab === 'channels') {
      fetchChannels(selectedTeam);
    }
  });

  onMount(() => {
    fetchOverview();
  });
</script>

<!-- Tab navigation -->
<nav class="flex gap-1 mb-8 border-b border-dark-lighter overflow-x-auto">
  {#each [
    { id: 'overview', label: 'Übersicht' },
    { id: 'users', label: 'Benutzer' },
    { id: 'channels', label: 'Kanäle' },
    { id: 'teams', label: 'Gruppen' },
  ] as t}
    <button
      onclick={() => tab = t.id as typeof tab}
      class="px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap {tab === t.id ? 'text-gold border-b-2 border-gold' : 'text-muted hover:text-light'}"
    >
      {t.label}
    </button>
  {/each}
</nav>

{#if loading}
  <div class="flex items-center justify-center py-20">
    <div class="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin"></div>
  </div>
{:else if error}
  <div class="bg-red-900/20 border border-red-500/30 rounded-xl p-4 text-red-300">{error}</div>
{:else}

  <!-- Overview Tab -->
  {#if tab === 'overview' && system}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {#each [
        { label: 'Status', value: system.status === 'OK' ? 'Erreichbar' : system.status, accent: system.status === 'OK' },
        { label: 'Aktive Benutzer', value: users.length.toString() },
        { label: 'Dienstkonten', value: bots.length.toString() },
        { label: 'Gruppen', value: system.team_count.toString() },
        { label: 'Kanäle', value: system.channel_count.toString() },
        { label: 'Nachrichten', value: system.post_count.toLocaleString('de-DE') },
        { label: 'Dateien', value: system.file_count.toLocaleString('de-DE') },
        { label: 'Täglich aktiv', value: system.daily_active_users.toString() },
      ] as stat}
        <div class="bg-dark-light rounded-xl border border-dark-lighter p-4">
          <p class="text-xs text-muted uppercase tracking-wider mb-1">{stat.label}</p>
          <p class="text-xl font-bold {stat.accent ? 'text-green-400' : 'text-light'}">{stat.value}</p>
        </div>
      {/each}
    </div>

    <div class="grid md:grid-cols-2 gap-6">
      <!-- Recent users -->
      <div class="bg-dark-light rounded-xl border border-dark-lighter p-5">
        <h3 class="text-light font-semibold mb-4">Benutzer</h3>
        <div class="space-y-3">
          {#each users.slice(0, 5) as user}
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold text-sm font-bold">
                {user.username[0].toUpperCase()}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-light text-sm font-medium truncate">{user.first_name || user.username} {user.last_name || ''}</p>
                <p class="text-muted text-xs truncate">{user.email}</p>
              </div>
              <span class="text-xs px-2 py-0.5 rounded-full {user.roles.includes('system_admin') ? 'bg-gold/20 text-gold' : 'bg-dark-lighter text-muted'}">
                {user.roles.includes('system_admin') ? 'Verwalter' : 'Benutzer'}
              </span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Gruppen-Übersicht -->
      <div class="bg-dark-light rounded-xl border border-dark-lighter p-5">
        <h3 class="text-light font-semibold mb-4">Gruppen</h3>
        <div class="space-y-3">
          {#each teams as team}
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-dark-lighter flex items-center justify-center text-gold text-sm font-bold">
                {team.display_name[0].toUpperCase()}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-light text-sm font-medium">{team.display_name}</p>
                <p class="text-muted text-xs">{team.member_count} Mitglieder</p>
              </div>
              <span class="text-xs px-2 py-0.5 rounded-full bg-dark-lighter text-muted">
                {team.type === 'O' ? 'Offen' : 'Einladung'}
              </span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Users Tab -->
  {#if tab === 'users'}
    <div class="space-y-2 mb-6">
      <div class="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-4 px-4 py-2 text-xs text-muted uppercase tracking-wider">
        <span class="w-8"></span>
        <span>Name</span>
        <span>E-Mail</span>
        <span>Rolle</span>
        <span>Erstellt</span>
      </div>
      {#each users as user}
        <div class="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-4 items-center px-4 py-3 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/30 transition-colors">
          <div class="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold text-sm font-bold">
            {user.username[0].toUpperCase()}
          </div>
          <div class="min-w-0">
            <p class="text-light text-sm font-medium truncate">{user.first_name || user.username} {user.last_name || ''}</p>
            <p class="text-muted text-xs truncate">@{user.username}</p>
          </div>
          <p class="text-muted text-sm truncate">{user.email}</p>
          <span class="text-xs px-2 py-0.5 rounded-full {user.roles.includes('system_admin') ? 'bg-gold/20 text-gold' : 'bg-dark-lighter text-muted'}">
            {user.roles.includes('system_admin') ? 'Verwalter' : 'Benutzer'}
          </span>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-dark">{formatDate(user.create_at)}</span>
            {#if !user.roles.includes('system_admin')}
              <button
                onclick={() => confirmAction('Benutzer deaktivieren', user.username, () => deactivateUser(user.id))}
                class="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
                title="Deaktivieren"
              >
                Deaktivieren
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if bots.length > 0}
      <h3 class="text-light font-semibold mb-3 mt-8">Dienstkonten</h3>
      <div class="space-y-2">
        {#each bots as bot}
          <div class="flex items-center gap-4 px-4 py-3 bg-dark-light rounded-xl border border-dark-lighter">
            <div class="w-8 h-8 rounded-full bg-dark-lighter flex items-center justify-center text-muted text-sm">
              B
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-light text-sm font-medium">{bot.username}</p>
              <p class="text-muted text-xs">{bot.bot_description || bot.email}</p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Channels Tab -->
  {#if tab === 'channels'}
    <div class="flex items-center gap-4 mb-6">
      <select
        bind:value={selectedTeam}
        class="bg-dark-light border border-dark-lighter text-light rounded-lg px-3 py-2 text-sm focus:border-gold outline-none"
      >
        {#each teams as team}
          <option value={team.id}>{team.display_name}</option>
        {/each}
      </select>

      <button
        onclick={() => { showCreateChannel = true; newChannel.teamId = selectedTeam; }}
        class="ml-auto px-4 py-2 bg-gold/20 text-gold rounded-lg text-sm font-medium hover:bg-gold/30 transition-colors"
      >
        + Kanal erstellen
      </button>
    </div>

    {#if channelsLoading}
      <div class="flex items-center justify-center py-12">
        <div class="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin"></div>
      </div>
    {:else}
      <div class="space-y-2">
        <div class="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2 text-xs text-muted uppercase tracking-wider">
          <span>Kanal</span>
          <span>Typ</span>
          <span>Mitglieder</span>
          <span>Nachrichten</span>
          <span>Aktionen</span>
        </div>
        {#each channels.sort((a, b) => b.last_post_at - a.last_post_at) as ch}
          <div class="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-3 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/30 transition-colors">
            <div class="min-w-0">
              <p class="text-light text-sm font-medium truncate">{ch.display_name}</p>
              <p class="text-muted text-xs truncate">{ch.purpose || '—'}</p>
            </div>
            <span class="text-xs px-2 py-0.5 rounded-full {ch.type === 'P' ? 'bg-red-900/30 text-red-300' : 'bg-dark-lighter text-muted'}">
              {channelTypeLabel(ch.type)}
            </span>
            <span class="text-sm text-muted text-center min-w-[3rem]">{ch.member_count}</span>
            <span class="text-sm text-muted text-center min-w-[3rem]">{ch.total_msg_count}</span>
            <div class="flex items-center gap-1">
              <button
                onclick={() => { postTarget = { channelId: ch.id, channelName: ch.display_name, message: '' }; showPostMessage = true; }}
                class="text-xs text-gold hover:text-gold-light px-2 py-1 rounded hover:bg-gold/10 transition-colors"
                title="Nachricht senden"
              >
                Senden
              </button>
              {#if ch.name !== 'town-square' && ch.name !== 'off-topic'}
                <button
                  onclick={() => confirmAction('Kanal löschen', ch.display_name, () => handleDeleteChannel(ch.id))}
                  class="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
                  title="Löschen"
                >
                  Löschen
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Teams Tab -->
  {#if tab === 'teams'}
    <div class="space-y-2">
      <div class="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 text-xs text-muted uppercase tracking-wider">
        <span>Team</span>
        <span>Typ</span>
        <span>Mitglieder</span>
        <span>Aktionen</span>
      </div>
      {#each teams as team}
        <div class="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/30 transition-colors">
          <div class="min-w-0">
            <p class="text-light text-sm font-medium">{team.display_name}</p>
            <p class="text-muted text-xs">{team.name} {team.description ? `— ${team.description}` : ''}</p>
          </div>
          <span class="text-xs px-2 py-0.5 rounded-full bg-dark-lighter text-muted">
            {team.type === 'O' ? 'Offen' : 'Einladung'}
          </span>
          <span class="text-sm text-muted text-center min-w-[3rem]">{team.member_count}</span>
          <div class="flex items-center gap-1">
            <button
              onclick={() => { selectedTeam = team.id; tab = 'channels'; }}
              class="text-xs text-gold hover:text-gold-light px-2 py-1 rounded hover:bg-gold/10 transition-colors"
            >
              Kanäle
            </button>
            <button
              onclick={() => confirmAction('Team löschen', team.display_name, () => handleDeleteTeam(team.id))}
              class="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
            >
              Löschen
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<!-- Confirmation Modal -->
{#if showModal}
  <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick={() => showModal = false}>
    <div class="bg-dark-light border border-dark-lighter rounded-2xl p-6 max-w-md w-full" onclick={(e) => e.stopPropagation()}>
      <h3 class="text-light font-semibold text-lg mb-2">{modalTitle}</h3>
      <p class="text-muted mb-6">
        Bist du sicher, dass du <span class="text-light font-medium">{modalTarget}</span> wirklich {modalTitle.toLowerCase()} möchtest? Diese Aktion kann nicht rückgängig gemacht werden.
      </p>
      <div class="flex gap-3 justify-end">
        <button
          onclick={() => showModal = false}
          class="px-4 py-2 text-sm text-muted hover:text-light transition-colors"
        >
          Abbrechen
        </button>
        <button
          onclick={async () => { if (modalAction) await modalAction(); showModal = false; }}
          class="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
        >
          Bestätigen
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Create Channel Modal -->
{#if showCreateChannel}
  <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick={() => showCreateChannel = false}>
    <div class="bg-dark-light border border-dark-lighter rounded-2xl p-6 max-w-md w-full" onclick={(e) => e.stopPropagation()}>
      <h3 class="text-light font-semibold text-lg mb-4">Neuen Kanal erstellen</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-muted mb-1">Anzeigename</label>
          <input
            type="text"
            bind:value={newChannel.displayName}
            oninput={() => newChannel.name = newChannel.displayName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')}
            class="w-full bg-dark border border-dark-lighter text-light rounded-lg px-3 py-2 text-sm focus:border-gold outline-none"
            placeholder="z.B. Projekt Alpha"
          />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">URL-Name</label>
          <input
            type="text"
            bind:value={newChannel.name}
            class="w-full bg-dark border border-dark-lighter text-light rounded-lg px-3 py-2 text-sm focus:border-gold outline-none"
            placeholder="z.B. projekt-alpha"
          />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">Typ</label>
          <select
            bind:value={newChannel.type}
            class="w-full bg-dark border border-dark-lighter text-light rounded-lg px-3 py-2 text-sm focus:border-gold outline-none"
          >
            <option value="O">Öffentlich</option>
            <option value="P">Privat</option>
          </select>
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">Beschreibung</label>
          <input
            type="text"
            bind:value={newChannel.purpose}
            class="w-full bg-dark border border-dark-lighter text-light rounded-lg px-3 py-2 text-sm focus:border-gold outline-none"
            placeholder="Optional"
          />
        </div>
      </div>
      <div class="flex gap-3 justify-end mt-6">
        <button
          onclick={() => showCreateChannel = false}
          class="px-4 py-2 text-sm text-muted hover:text-light transition-colors"
        >
          Abbrechen
        </button>
        <button
          onclick={handleCreateChannel}
          disabled={!newChannel.name || !newChannel.displayName}
          class="px-4 py-2 text-sm bg-gold text-dark rounded-lg font-medium hover:bg-gold-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Erstellen
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Post Message Modal -->
{#if showPostMessage}
  <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick={() => showPostMessage = false}>
    <div class="bg-dark-light border border-dark-lighter rounded-2xl p-6 max-w-md w-full" onclick={(e) => e.stopPropagation()}>
      <h3 class="text-light font-semibold text-lg mb-2">Nachricht senden</h3>
      <p class="text-muted text-sm mb-4">An: <span class="text-light">{postTarget.channelName}</span></p>
      <textarea
        bind:value={postTarget.message}
        rows="4"
        class="w-full bg-dark border border-dark-lighter text-light rounded-lg px-3 py-2 text-sm focus:border-gold outline-none resize-none"
        placeholder="Nachricht eingeben..."
      ></textarea>
      <div class="flex gap-3 justify-end mt-4">
        <button
          onclick={() => showPostMessage = false}
          class="px-4 py-2 text-sm text-muted hover:text-light transition-colors"
        >
          Abbrechen
        </button>
        <button
          onclick={handlePostMessage}
          disabled={!postTarget.message.trim()}
          class="px-4 py-2 text-sm bg-gold text-dark rounded-lg font-medium hover:bg-gold-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Senden
        </button>
      </div>
    </div>
  </div>
{/if}
