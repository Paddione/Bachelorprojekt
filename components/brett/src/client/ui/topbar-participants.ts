// brett/src/client/ui/topbar-participants.ts
// 👥 button in the board topbar opening a toggle panel with the participant
// roster. Leiter can reassign roles (beobachter ⇄ stellvertreter) via a dropdown
// that sends admin_assign_role. Pure helpers (buildParticipantRows,
// buildAssignRoleMessage, ROLE_OPTIONS) are node-testable; DOM in mount*.

import type { Role } from '../../types/state';
import type { ClientMessage } from '../../types/messages';
import type { LobbyState } from '../lobby-store';
import { styleSelect } from './primitives';

export interface ParticipantRow {
  userId: string;
  name: string;
  color: string;
  role: Role | undefined;
}

/** Pure: derive roster rows from lobby state (insertion order of the roster map). */
export function buildParticipantRows(state: LobbyState): ParticipantRow[] {
  return Object.values(state.roster).map((p) => ({
    userId: p.userId,
    name: p.name,
    color: p.color,
    role: p.role,
  }));
}

/** Roles a leader may assign from the panel (leiter itself is not assignable here). */
export const ROLE_OPTIONS: ReadonlyArray<{ value: Role; label: string }> = [
  { value: 'beobachter', label: 'Beobachter' },
  { value: 'stellvertreter', label: 'Stellvertreter' },
];

const ROLE_LABEL: Record<Role, string> = {
  leiter: 'Leiter',
  stellvertreter: 'Stellvertreter',
  beobachter: 'Beobachter',
  gast: 'Gast',
  zuschauer: '👁 Zuschauer',
};

/** Pure: build the admin_assign_role message a dropdown change emits. */
export function buildAssignRoleMessage(targetPlayerId: string, role: Role): ClientMessage {
  return { type: 'admin_assign_role', targetPlayerId, role };
}

export interface ParticipantsDeps {
  getLobbyState: () => LobbyState;
  sendClient: (msg: ClientMessage) => void;
  isLeiter: () => boolean;
}

const PARTS_STYLE_ID = 'brett-topbar-participants';

function injectStyles(doc: Document = document): void {
  if (doc.getElementById(PARTS_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = PARTS_STYLE_ID;
  el.textContent = [
    '.brett-parts-btn{font-family:var(--brett-font-sans,sans-serif);font-size:13px;',
    'background:transparent;color:var(--brett-fg,#e7ead0);',
    'border:1px solid var(--brett-line,rgba(255,255,255,0.12));',
    'border-radius:var(--brett-radius-sm,8px);padding:6px 10px;cursor:pointer;}',
    '.brett-parts-wrap{position:relative;display:inline-block;}',
    '.brett-parts-panel{position:absolute;top:calc(100% + 6px);right:0;z-index:60;',
    'background:var(--brett-ink-850,#101824);border:1px solid var(--brett-line,rgba(255,255,255,0.12));',
    'border-radius:var(--brett-radius-sm,8px);padding:10px 12px;min-width:240px;',
    'font-family:var(--brett-font-sans,sans-serif);font-size:13px;color:var(--brett-fg,#e7ead0);}',
    '.brett-parts-row{display:flex;align-items:center;gap:8px;padding:5px 0;}',
    '.brett-parts-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;}',
    '.brett-parts-name{flex:1 1 auto;}',
    '.brett-parts-role{color:var(--brett-mute,#8a93a3);font-size:11px;}',
    '.brett-parts-select{background:var(--brett-ink-850,#101824);color:var(--brett-fg,#e7ead0);',
    'border:1px solid var(--brett-line-2,rgba(255,255,255,0.18));border-radius:6px;',
    'padding:2px 6px;font-size:11px;}',
  ].join('');
  doc.head.appendChild(el);
}

/**
 * Mount the 👥 button + toggle panel into `anchorEl`. Returns `{ update }` which
 * re-renders the panel body from the current lobby state — board-boot calls it on
 * every lobbyChange and on late-join.
 */
export function mountParticipantsButton(
  anchorEl: HTMLElement,
  deps: ParticipantsDeps,
): { update: () => void } {
  injectStyles();

  const wrap = document.createElement('div');
  wrap.className = 'brett-parts-wrap';
  const btn = document.createElement('button');
  btn.className = 'brett-parts-btn';
  btn.type = 'button';
  btn.textContent = '👥';
  btn.title = 'Teilnehmer';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  wrap.appendChild(btn);
  anchorEl.appendChild(wrap);

  let panel: HTMLDivElement | null = null;

  function renderBody(): void {
    if (!panel) return;
    panel.innerHTML = '';
    const rows = buildParticipantRows(deps.getLobbyState());
    const isLeiter = deps.isLeiter();
    const title = document.createElement('div');
    title.className = 'brett-parts-role';
    title.textContent = `Teilnehmer (${rows.length})`;
    panel.appendChild(title);
    for (const row of rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'brett-parts-row';
      const dot = document.createElement('span');
      dot.className = 'brett-parts-dot';
      dot.style.background = row.color;
      const name = document.createElement('span');
      name.className = 'brett-parts-name';
      name.textContent = row.name;
      rowEl.append(dot, name);
      if (isLeiter && row.role !== 'leiter' && row.role !== 'zuschauer') {
        const sel = document.createElement('select');
        sel.className = 'brett-parts-select';
        for (const opt of ROLE_OPTIONS) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          if (opt.value === row.role) o.selected = true;
          sel.appendChild(o);
        }
        styleSelect(sel);
        sel.addEventListener('change', () => {
          deps.sendClient(buildAssignRoleMessage(row.userId, sel.value as Role));
        });
        rowEl.appendChild(sel);
      } else {
        const roleEl = document.createElement('span');
        roleEl.className = 'brett-parts-role';
        roleEl.textContent = row.role ? ROLE_LABEL[row.role] : '–';
        rowEl.appendChild(roleEl);
      }
      panel.appendChild(rowEl);
    }
  }

  function closePanel(): void {
    if (panel) { panel.remove(); panel = null; }
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutside, true);
  }

  function onOutside(e: MouseEvent): void {
    if (panel && !wrap.contains(e.target as Node)) closePanel();
  }

  function openPanel(): void {
    panel = document.createElement('div');
    panel.className = 'brett-parts-panel';
    wrap.appendChild(panel);
    renderBody();
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', onOutside, true), 0);
  }

  btn.addEventListener('click', () => {
    if (panel) closePanel(); else openPanel();
  });

  return {
    update() { if (panel) renderBody(); },
  };
}
