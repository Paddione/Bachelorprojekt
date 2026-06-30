<script lang="ts">
  type TicketStatus = 'triage' | 'backlog' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'archived';
  type Priority = 'hoch' | 'mittel' | 'niedrig';

  const QUICK_STATUSES: { value: TicketStatus; label: string }[] = [
    { value: 'triage',      label: 'Triage' },
    { value: 'backlog',     label: 'Backlog' },
    { value: 'in_progress', label: 'In Arbeit' },
    { value: 'in_review',   label: 'In Review' },
    { value: 'blocked',     label: 'Blockiert' },
  ];

  let {
    editStatus = $bindable(),
    editPriority = $bindable(),
    editComponent = $bindable(),
    editNotes = $bindable(),
    savingField,
    savedField,
    selectedTicket,
    saveStatusFn,
    saveFieldFn,
  }: {
    editStatus: TicketStatus;
    editPriority: Priority;
    editComponent: string;
    editNotes: string;
    savingField: string | null;
    savedField: string | null;
    selectedTicket: { status: TicketStatus };
    saveStatusFn: () => void;
    saveFieldFn: (field: 'priority' | 'component' | 'notes', value: string | Priority) => void;
  } = $props();
</script>

<!-- Status -->
<div style="margin-bottom:12px;">
  <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Status</label>
  <select
    bind:value={editStatus}
    onchange={saveStatusFn}
    style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:rgba(79,70,229,.08); color:var(--fg,#e2e8f0); font-size:13px; cursor:pointer;"
  >
    {#each QUICK_STATUSES as s}
      <option value={s.value}>{s.label}{savingField === 'status' && editStatus === s.value ? ' …' : ''}{savedField === 'status' && selectedTicket.status === s.value ? ' ✓' : ''}</option>
    {/each}
  </select>
</div>

<!-- Priority -->
<div style="margin-bottom:12px;">
  <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Priorität {savedField === 'priority' ? '✓' : ''}</label>
  <div style="display:flex; gap:4px;">
    {#each (['hoch','mittel','niedrig'] as Priority[]) as p}
      <button
        type="button"
        onclick={() => { editPriority = p; saveFieldFn('priority', p); }}
        style="flex:1; padding:5px 0; border-radius:5px; border:1px solid {editPriority === p ? '#4f46e5' : 'var(--line,#2a2a3e)'}; background:{editPriority === p ? 'rgba(79,70,229,.2)' : 'transparent'}; color:{editPriority === p ? '#818cf8' : 'var(--mute,#64748b)'}; font-size:12px; cursor:pointer; transition:all 0.1s ease;"
      >{p.charAt(0).toUpperCase() + p.slice(1)}</button>
    {/each}
  </div>
</div>

<!-- Component -->
<div style="margin-bottom:12px;">
  <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Komponente {savedField === 'component' ? '✓' : ''}</label>
  <input
    type="text"
    bind:value={editComponent}
    onblur={() => saveFieldFn('component', editComponent)}
    maxlength="100"
    placeholder="z.B. Chat, Auth…"
    style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; color:var(--fg,#e2e8f0); font-size:13px; box-sizing:border-box;"
  />
</div>

<!-- Notes -->
<div>
  <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Notizen (intern) {savedField === 'notes' ? '✓' : ''}</label>
  <textarea
    bind:value={editNotes}
    onblur={() => saveFieldFn('notes', editNotes)}
    maxlength="1000"
    rows="4"
    placeholder="Interne Anmerkungen…"
    style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; color:var(--fg,#e2e8f0); font-size:13px; resize:vertical; box-sizing:border-box;"
  ></textarea>
</div>
