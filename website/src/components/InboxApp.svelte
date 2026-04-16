<script lang="ts">
  import type { InboxItem, InboxType, InboxStatus } from '../lib/messaging-db';

  // Server passes initial data via props to avoid a flash of empty content
  const { initialItems, initialCounts }: {
    initialItems: InboxItem[];
    initialCounts: Record<string, number>;
  } = $props();

  let items = $state<InboxItem[]>(initialItems);
  let counts = $state<Record<string, number>>(initialCounts);
  let activeType = $state<InboxType | ''>('');
  let activeStatus = $state<InboxStatus>('pending');
  let loadingAction = $state<number | null>(null);
  let errors = $state<Record<number, string>>({});
  let noteInputId = $state<number | null>(null);
  let noteText = $state('');

  const TYPE_LABELS: Record<string, string> = {
    registration: 'Registrierung',
    booking: 'Buchung',
    contact: 'Kontakt',
    bug: 'Bug',
    meeting_finalize: 'Meeting',
    user_message: 'Nachricht',
  };
  const TYPE_COLORS: Record<string, string> = {
    registration: '#4ade80',
    booking: '#60a5fa',
    contact: '#f59e0b',
    bug: '#f87171',
    meeting_finalize: '#a78bfa',
    user_message: '#34d399',
  };

  const totalPending = $derived(Object.values(counts).reduce((a, b) => a + b, 0));

  const statusTabs: [string, string][] = [
    ['pending', 'Offen'],
    ['actioned', 'Erledigt'],
    ['archived', 'Archiv'],
  ];

  const filterTabs = $derived<[string, string, number][]>([
    ['', 'Alle', totalPending],
    ['registration', 'Registrierung', counts.registration ?? 0],
    ['booking', 'Buchung', counts.booking ?? 0],
    ['contact', 'Kontakt', counts.contact ?? 0],
    ['bug', 'Bug', counts.bug ?? 0],
    ['meeting_finalize', 'Meeting', counts.meeting_finalize ?? 0],
    ['user_message', 'Nachricht', counts.user_message ?? 0],
  ]);

  async function reload() {
    try {
      const p = new URLSearchParams({ status: activeStatus });
      if (activeType) p.set('type', activeType);
      const res = await fetch(`/api/admin/inbox?${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { items: InboxItem[]; counts: Record<string, number> };
      items = data.items;
      counts = data.counts;
    } catch (err) {
      console.error('[InboxApp] reload failed:', err);
    }
  }

  function setType(t: InboxType | '') {
    activeType = t;
    reload();
  }

  function setStatus(s: InboxStatus) {
    activeStatus = s;
    reload();
  }

  async function executeAction(item: InboxItem, action: string, note?: string) {
    loadingAction = item.id;
    errors = { ...errors, [item.id]: '' };
    try {
      const res = await fetch(`/api/admin/inbox/${item.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        errors = { ...errors, [item.id]: data.error ?? 'Fehler' };
      } else {
        items = items.filter(i => i.id !== item.id);
        if (activeStatus === 'pending') {
          counts = { ...counts, [item.type]: Math.max(0, (counts[item.type] ?? 1) - 1) };
        } else {
          await reload();
        }
        noteInputId = null;
        noteText = '';
      }
    } catch {
      errors = { ...errors, [item.id]: 'Netzwerkfehler' };
    } finally {
      loadingAction = null;
    }
  }

  function relativeTime(date: Date | string): string {
    const d = new Date(date);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return 'gerade eben';
    const min = Math.floor(sec / 60);
    if (min < 60) return `vor ${min} Min.`;
    const h = Math.floor(min / 60);
    if (h < 24) return `vor ${h} Std.`;
    return `vor ${Math.floor(h / 24)} Tagen`;
  }

  function summary(item: InboxItem): { title: string; sub: string } {
    const p = item.payload as Record<string, string>;
    switch (item.type) {
      case 'registration': return { title: `${p.firstName} ${p.lastName}`, sub: `${p.email}${p.company ? ` · ${p.company}` : ''}` };
      case 'booking':      return { title: p.name, sub: `${p.typeLabel} · ${p.slotDisplay}` };
      case 'contact':      return { title: p.name, sub: (p.message ?? '').slice(0, 80) };
      case 'bug':          return { title: p.ticketId, sub: (p.description ?? '').slice(0, 80) };
      case 'meeting_finalize': return { title: p.customerName, sub: `${p.meetingType} · ${p.meetingDate}` };
      case 'user_message': return { title: p.senderName ?? 'Nutzer', sub: (p.message ?? '').slice(0, 80) };
      default:             return { title: item.type, sub: '' };
    }
  }
</script>

<div class="inbox-layout">
  <!-- Sidebar -->
  <aside class="sidebar">
    <h2>Inbox</h2>
    <div class="filter-group">
      {#each filterTabs as [t, label, count]}
        <button
          class="filter-btn {activeType === t ? 'active' : ''}"
          onclick={() => setType(t as InboxType | '')}
        >
          {label}
          {#if count > 0}<span class="badge">{count}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="status-group">
      {#each statusTabs as [s, label]}
        <button
          class="status-btn {activeStatus === s ? 'active' : ''}"
          onclick={() => setStatus(s as InboxStatus)}
        >{label}</button>
      {/each}
    </div>
  </aside>

  <!-- Feed -->
  <main class="feed">
    {#if items.length === 0}
      <p class="empty">Keine Einträge.</p>
    {:else}
      {#each items as item (item.id)}
        {@const { title, sub } = summary(item)}
        {@const color = TYPE_COLORS[item.type] ?? '#888'}
        <div class="card" style="border-left: 3px solid {color}">
          <div class="card-header">
            <span class="type-badge" style="background:{color}22;color:{color}">{TYPE_LABELS[item.type] ?? item.type}</span>
            <span class="ts">{relativeTime(item.created_at)}</span>
          </div>
          <div class="card-body">
            <strong>{title}</strong>
            {#if sub}<span class="sub">{sub}</span>{/if}
          </div>
          {#if errors[item.id]}
            <p class="err">{errors[item.id]}</p>
          {/if}
          {#if noteInputId === item.id}
            <div class="note-wrap">
              <textarea bind:value={noteText} placeholder="Was wurde gemacht? (max. 500 Zeichen)" maxlength="500" rows="2"></textarea>
              <div class="note-actions">
                <button onclick={() => { noteInputId = null; noteText = ''; }}>Abbrechen</button>
                <button class="btn-primary" disabled={!noteText.trim() || loadingAction === item.id}
                  onclick={() => executeAction(item, 'resolve_bug', noteText)}>
                  {loadingAction === item.id ? '…' : 'Speichern'}
                </button>
              </div>
            </div>
          {:else}
            <div class="actions">
              {#if item.type === 'registration'}
                <button class="btn-approve" disabled={loadingAction === item.id} onclick={() => executeAction(item, 'approve_registration')}>
                  {loadingAction === item.id ? '…' : '✓ Freischalten'}
                </button>
                <button class="btn-decline" disabled={loadingAction === item.id} onclick={() => executeAction(item, 'decline_registration')}>
                  {loadingAction === item.id ? '…' : '✗ Ablehnen'}
                </button>
              {:else if item.type === 'booking'}
                <button class="btn-approve" disabled={loadingAction === item.id} onclick={() => executeAction(item, 'approve_booking')}>
                  {loadingAction === item.id ? '…' : '✓ Bestätigen'}
                </button>
                <button class="btn-decline" disabled={loadingAction === item.id} onclick={() => executeAction(item, 'decline_booking')}>
                  {loadingAction === item.id ? '…' : '✗ Ablehnen'}
                </button>
              {:else if item.type === 'contact'}
                <button class="btn-secondary" disabled={loadingAction === item.id} onclick={() => executeAction(item, 'archive_contact')}>
                  {loadingAction === item.id ? '…' : 'Archivieren'}
                </button>
              {:else if item.type === 'bug'}
                <button class="btn-approve" onclick={() => { noteInputId = item.id; }}>Erledigt</button>
              {:else if item.type === 'meeting_finalize'}
                <button class="btn-approve" disabled={loadingAction === item.id} onclick={() => executeAction(item, 'finalize_meeting')}>
                  {loadingAction === item.id ? '…' : '▶ Finalisieren'}
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </main>
</div>

<style>
  .inbox-layout { display: flex; gap: 24px; height: 100%; }
  .sidebar { width: 200px; flex-shrink: 0; }
  .sidebar h2 { font-size: 18px; margin: 0 0 16px; }
  .filter-group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; }
  .filter-btn { background: transparent; border: none; text-align: left; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: #ccc; font-size: 13px; display: flex; justify-content: space-between; }
  .filter-btn.active { background: #2a2a3e; color: #fff; }
  .filter-btn:hover:not(.active) { background: #1e1e2e; }
  .badge { background: #7c6ff7; color: #fff; border-radius: 10px; padding: 0 6px; font-size: 11px; }
  .status-group { display: flex; gap: 4px; }
  .status-btn { flex: 1; background: #1e1e2e; border: none; padding: 5px; border-radius: 4px; cursor: pointer; color: #999; font-size: 12px; }
  .status-btn.active { background: #2a2a3e; color: #fff; }
  .feed { flex: 1; overflow-y: auto; }
  .empty { color: #666; text-align: center; margin-top: 48px; }
  .card { background: #1e1e2e; border-radius: 8px; padding: 14px 16px; margin-bottom: 8px; }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .type-badge { font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; letter-spacing: .05em; }
  .ts { font-size: 11px; color: #555; }
  .card-body strong { display: block; font-size: 14px; color: #e8e8f0; }
  .sub { font-size: 12px; color: #888; display: block; margin-top: 2px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  button { padding: 5px 12px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: 600; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .btn-approve { background: #4ade80; color: #000; }
  .btn-decline { background: #f87171; color: #fff; }
  .btn-secondary { background: #374151; color: #ccc; }
  .btn-primary { background: #7c6ff7; color: #fff; }
  .err { font-size: 12px; color: #f87171; margin: 6px 0 0; }
  .note-wrap { margin-top: 10px; }
  .note-wrap textarea { width: 100%; background: #111827; color: #e8e8f0; border: 1px solid #374151; border-radius: 4px; padding: 8px; font-size: 13px; resize: vertical; box-sizing: border-box; }
  .note-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
</style>
