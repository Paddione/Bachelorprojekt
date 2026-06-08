// brett/src/client/ui/lobby.ts — Phase B / B16
//
// The Lobby "Kontrollraum" screen. The view-model builder is PURE (no DOM) so it
// is unit-testable under node/tsx; the DOM renderer composes Phase A primitives
// and reads tokens via CSS vars. No top-level DOM/`window`/`three` access.

import type { Role } from '../../types/state';
import type { LobbyState } from '../lobby-store';
import { Panel, Button, Badge, RosterItem, type BadgeTone } from './primitives';
import { stepsToTextarea, shouldPrefill, DEFAULT_COACHING_STEPS } from '../lobby-template-fill';

export interface LobbyRow {
  userId: string;
  name: string;
  color: string;
  role: Role | undefined;
  ready: boolean;
}

export interface LobbyViewModel {
  sessionCode: string | null;
  rows: LobbyRow[];
  readyCount: number;
  canStart: boolean;
  startLabel: string;
  showReadyToggle: boolean;
  /** Read-only settings display (substance/edit lands in Phase D). */
  settings: {
    templateId?: string;
    coachingTemplateId?: string;
    optikLabel?: string;
    maxParticipants?: number;
  };
}

const ROLE_LABEL: Record<Role, string> = {
  leiter: 'Leiter',
  stellvertreter: 'Stellv.',
  beobachter: 'Beob.',
};

/**
 * Pure: derive the lobby render-model from the lobby state + the viewer's role.
 * `canStart` / `startLabel` are leader-gated; non-leaders see the Bereit toggle.
 */
export function buildLobbyViewModel(state: LobbyState, opts: { isLeader: boolean }): LobbyViewModel {
  const rows: LobbyRow[] = Object.values(state.roster).map((p) => ({
    userId: p.userId,
    name: p.name,
    color: p.color,
    role: p.role,
    ready: !!p.ready,
  }));
  const readyCount = rows.filter((r) => r.ready).length;
  return {
    sessionCode: state.sessionCode,
    rows,
    readyCount,
    canStart: opts.isLeader,
    startLabel: 'Runde starten',
    showReadyToggle: !opts.isLeader,
    settings: {
      templateId: state.settings.templateId,
      coachingTemplateId: state.settings.coachingTemplateId,
      optikLabel: optikLabel(state),
      maxParticipants: state.settings.maxParticipants,
    },
  };
}

function optikLabel(state: LobbyState): string | undefined {
  const o = state.settings.optik;
  if (!o) return undefined;
  const parts = [o.sky, o.lightMood].filter(Boolean);
  return parts.length ? parts.join(' / ') : undefined;
}

function roleTone(role: Role | undefined): BadgeTone {
  return role ?? 'neutral';
}

export interface LobbyHandlers {
  onStart: () => void;
  onToggleReady: (ready: boolean) => void;
  onCopyCode: (code: string) => void;
  /** Leader-only: emit the built coaching steps (D10). Absent ⇒ editor hidden. */
  onCoachingSteps?: (raw: string) => void;
}

/**
 * Render the lobby into `container`. No Three.js scene is mounted. DOM access is
 * confined to this function body (keeps the module node-importable).
 */
export function mountLobby(container: HTMLElement, vm: LobbyViewModel, handlers: LobbyHandlers): void {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'brett-lobby__header';
  const title = document.createElement('h2');
  title.className = 'brett-lobby__title';
  title.textContent = 'LOBBY';
  header.appendChild(title);
  if (vm.sessionCode) {
    const code = document.createElement('span');
    code.className = 'brett-lobby__code';
    code.textContent = vm.sessionCode;
    const copy = Button({ label: 'Kopieren', variant: 'ghost', onClick: () => handlers.onCopyCode(vm.sessionCode!) });
    header.append(code, copy);
  }

  // Roster panel.
  const rosterPanel = Panel({ pad: true });
  const rosterTitle = document.createElement('h3');
  rosterTitle.className = 'brett-lobby__section-title';
  rosterTitle.textContent = `Teilnehmer (${vm.rows.length})`;
  rosterPanel.appendChild(rosterTitle);
  for (const row of vm.rows) {
    const badge = Badge({ text: row.role ? ROLE_LABEL[row.role] : '–', tone: roleTone(row.role) });
    const trailing = document.createElement('span');
    trailing.className = 'brett-lobby__ready' + (row.ready ? ' is-ready' : '');
    trailing.append(badge);
    rosterPanel.appendChild(RosterItem({ name: row.name, color: row.color, trailing }));
  }
  const ready = document.createElement('div');
  ready.className = 'brett-lobby__ready-count';
  ready.textContent = `Bereit: ${vm.readyCount} / ${vm.rows.length}`;
  rosterPanel.appendChild(ready);

  // Read-only settings display (Phase D adds edit substance).
  const settingsPanel = Panel({ pad: true });
  const settingsTitle = document.createElement('h3');
  settingsTitle.className = 'brett-lobby__section-title';
  settingsTitle.textContent = 'Vorgelagerte Einstellungen';
  settingsPanel.appendChild(settingsTitle);
  settingsPanel.appendChild(settingRow('Vorlage', vm.settings.templateId ?? '–'));
  settingsPanel.appendChild(settingRow('Optik', vm.settings.optikLabel ?? '–'));
  settingsPanel.appendChild(settingRow('Max. Teiln.', vm.settings.maxParticipants != null ? String(vm.settings.maxParticipants) : '–'));

  // Leader-only Coaching-Ablauf editor (D10). Steps built here become active at
  // round-start (admin_coaching_steps_set, survives lobby→active).
  if (vm.canStart && handlers.onCoachingSteps) {
    const label = document.createElement('label');
    label.className = 'brett-lobby__coaching-label';
    label.textContent = 'Coaching-Ablauf (ein Schritt pro Zeile)';
    const editor = document.createElement('textarea');
    editor.className = 'brett-lobby__coaching';
    editor.rows = 4;
    editor.dataset.role = 'coaching-editor';
    const save = Button({
      label: 'Ablauf übernehmen',
      variant: 'ghost',
      onClick: () => handlers.onCoachingSteps!(editor.value),
    });
    save.dataset.role = 'coaching-save';
    settingsPanel.append(label, editor, save);

    // Prefill the coaching-steps editor. Priority:
    // 1. Selected coaching template (coachingTemplateId) — fetch from API.
    // 2. No template selected — fall back to the built-in default steps.
    // In both cases only prefill when the coach hasn't typed anything yet.
    const coachingTemplateId = vm.settings.coachingTemplateId;
    if (coachingTemplateId && shouldPrefill(editor.value)) {
      fetch(`/api/templates/${encodeURIComponent(coachingTemplateId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((tpl) => {
          if (tpl && Array.isArray(tpl.steps) && shouldPrefill(editor.value)) {
            editor.value = stepsToTextarea(tpl.steps);
          } else if (shouldPrefill(editor.value)) {
            editor.value = stepsToTextarea(DEFAULT_COACHING_STEPS);
          }
        })
        .catch(() => {
          if (shouldPrefill(editor.value)) editor.value = stepsToTextarea(DEFAULT_COACHING_STEPS);
        });
    } else if (shouldPrefill(editor.value)) {
      editor.value = stepsToTextarea(DEFAULT_COACHING_STEPS);
    }
  }

  // Footer actions.
  const footer = document.createElement('div');
  footer.className = 'brett-lobby__footer';
  if (vm.showReadyToggle) {
    let isReady = false;
    const toggle = Button({
      label: 'Bereit',
      variant: 'ghost',
      onClick: () => { isReady = !isReady; handlers.onToggleReady(isReady); },
    });
    toggle.dataset.role = 'ready-toggle';
    footer.appendChild(toggle);
  }
  if (vm.canStart) {
    const start = Button({ label: vm.startLabel, variant: 'primary', onClick: handlers.onStart });
    start.dataset.role = 'start-round';
    footer.appendChild(start);
  }

  const grid = document.createElement('div');
  grid.className = 'brett-lobby__grid';
  grid.append(rosterPanel, settingsPanel);

  container.append(header, grid, footer);
}

function settingRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'brett-lobby__setting';
  const k = document.createElement('span');
  k.className = 'brett-lobby__setting-label';
  k.textContent = label;
  const v = document.createElement('span');
  v.className = 'brett-lobby__setting-value';
  v.textContent = value;
  row.append(k, v);
  return row;
}

// ── Styles (token-driven; no hardcoded brand hex) ──────────────────────
const LOBBY_STYLE_ID = 'brett-lobby';

/** Pure: lobby-screen CSS, all color/typo/radius via var(--brett-*). */
export function lobbyCss(): string {
  return [
    '.brett-lobby{max-width:980px;margin:0 auto;padding:clamp(16px,4vw,40px);',
    'color:var(--brett-fg);font-family:var(--brett-font-sans);}',
    '.brett-lobby__header{display:flex;align-items:center;gap:12px;margin-bottom:20px;}',
    '.brett-lobby__title{font-size:1.4rem;letter-spacing:.18em;margin:0;color:var(--brett-fg);}',
    '.brett-lobby__code{font-family:var(--brett-font-mono);color:var(--brett-brass);',
    'background:var(--brett-brass-dim);padding:4px 10px;border-radius:8px;}',
    '.brett-lobby__grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}',
    '@media(max-width:720px){.brett-lobby__grid{grid-template-columns:1fr;}}',
    '.brett-lobby__section-title{font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;',
    'color:var(--brett-mute);margin:0 0 12px;}',
    '.brett-lobby__ready{display:inline-flex;align-items:center;gap:6px;}',
    '.brett-lobby__ready.is-ready{filter:none;}',
    '.brett-lobby__ready-count{margin-top:12px;color:var(--brett-fg-soft);font-size:.85rem;}',
    '.brett-lobby__setting{display:flex;justify-content:space-between;padding:6px 0;',
    'border-bottom:1px solid var(--brett-line);}',
    '.brett-lobby__setting-label{color:var(--brett-mute);}',
    '.brett-lobby__setting-value{color:var(--brett-fg-soft);}',
    '.brett-lobby__footer{display:flex;justify-content:space-between;gap:12px;margin-top:20px;}',
    '.brett-lobby__coaching-label{display:block;margin:12px 0 6px;color:var(--brett-mute);font-size:.78rem;}',
    '.brett-lobby__coaching{width:100%;box-sizing:border-box;background:var(--brett-ink-850);',
    'color:var(--brett-fg);border:1px solid var(--brett-line-2);border-radius:8px;padding:8px;',
    'font-family:var(--brett-font-sans);resize:vertical;margin-bottom:8px;}',
  ].join('');
}

/** Idempotent id-guarded <style id="brett-lobby"> injection. */
export function injectLobbyStyles(doc: Document = document): void {
  let el = doc.getElementById(LOBBY_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement('style');
    el.id = LOBBY_STYLE_ID;
    doc.head.appendChild(el);
  }
  el.textContent = lobbyCss();
}
