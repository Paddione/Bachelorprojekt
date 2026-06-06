// brett/src/client/ui/menu.ts — Phase A / A4
//
// Hauptmenü (main menu) — the first screen (mentolder look). Two layers:
//   1. Pure model: menuModel(user) → admin-gated action list + identity line;
//      isValidJoinCode(code) → session-code shape guard. Fully node-testable.
//   2. mountMenu(container, opts) → DOM render composed of A3 primitives + A1
//      tokens. DOM access only inside the function body.
//
// "Neue Session" is Leiter/Admin-only (spec §6b). In Phase A it drives the
// existing warmup board flow (no lobby seed yet — that's Phase B); the button is
// already shown and wired in A5.

import { Panel, Button, Field } from './primitives';

export interface MenuUser {
  userId: string;
  name: string;
  isAdmin: boolean;
}

export interface MenuItem {
  id: 'new-session' | 'join' | 'saved' | 'settings';
  label: string;
  hint?: string;
}

export interface MenuModel {
  items: MenuItem[];
  identityLine: string;
}

/** Session-code shape: Crockford-base32 XXX-XXX (matches generateSessionCode). */
const JOIN_CODE_RE = /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/i;

export function isValidJoinCode(code: string): boolean {
  return JOIN_CODE_RE.test(code.trim());
}

/** Pure: admin-gated item list + identity line. */
export function menuModel(user: MenuUser): MenuModel {
  const items: MenuItem[] = [];
  if (user.isAdmin) {
    items.push({ id: 'new-session', label: 'Neue Session starten', hint: 'Eine Aufstellung leiten' });
  }
  items.push({ id: 'join', label: 'Session beitreten', hint: 'Mit Code teilnehmen' });
  items.push({ id: 'saved', label: 'Gespeicherte Aufstellungen', hint: 'Frühere Sessions laden' });
  items.push({ id: 'settings', label: 'Einstellungen', hint: 'Konto & Optik' });
  return { items, identityLine: `angemeldet als: ${user.name}` };
}

export interface MenuHandlers {
  user: MenuUser;
  onNewSession: () => void;
  onJoin: (code: string) => void;
  onSavedList: () => void;
  onSettings: () => void;
}

/** Render the Hauptmenü into `container` using A3 primitives. */
export function mountMenu(container: HTMLElement, opts: MenuHandlers): void {
  const model = menuModel(opts.user);
  container.replaceChildren();

  const shell = document.createElement('div');
  shell.className = 'brett-menu';

  // Title block
  const title = document.createElement('div');
  title.className = 'brett-menu__title';
  const h = document.createElement('h1');
  h.className = 'brett-menu__brand';
  h.textContent = 'SYSTEMBRETT';
  const sub = document.createElement('p');
  sub.className = 'brett-menu__subtitle';
  sub.textContent = 'Systemische Aufstellung';
  title.append(h, sub);

  // Action cards
  const card = Panel({ pad: true });
  card.classList.add('brett-menu__card');

  for (const item of model.items) {
    if (item.id === 'join') {
      card.appendChild(buildJoinRow(opts));
      continue;
    }
    const onClick =
      item.id === 'new-session' ? opts.onNewSession
      : item.id === 'saved' ? opts.onSavedList
      : opts.onSettings;
    const btn = Button({ label: item.label, variant: item.id === 'new-session' ? 'primary' : 'ghost', onClick });
    btn.classList.add('brett-menu__action');
    btn.dataset.itemId = item.id;
    card.appendChild(btn);
  }

  // Footer: identity + logout
  const footer = document.createElement('div');
  footer.className = 'brett-menu__footer';
  const who = document.createElement('span');
  who.textContent = model.identityLine;
  const logout = document.createElement('a');
  logout.className = 'brett-menu__logout';
  logout.href = '/auth/logout';
  logout.textContent = 'Logout';
  footer.append(who, logout);

  shell.append(title, card, footer);
  container.appendChild(shell);
}

function buildJoinRow(opts: MenuHandlers): HTMLElement {
  const row = document.createElement('div');
  row.className = 'brett-menu__join';

  const field = Field({ placeholder: 'Session-Code (z. B. KRB-9A2)' });
  field.classList.add('brett-menu__join-input');

  const go = Button({
    label: 'Beitreten',
    variant: 'ghost',
    onClick: () => {
      const code = field.value.trim();
      if (isValidJoinCode(code)) {
        field.classList.remove('brett-field--invalid');
        opts.onJoin(code);
      } else {
        field.classList.add('brett-field--invalid');
      }
    },
  });
  go.classList.add('brett-menu__join-go');

  row.append(field, go);
  return row;
}

export function menuCss(): string {
  return [
    '.brett-menu{',
    '  min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;',
    '  gap:28px;padding:48px 20px;font-family:var(--brett-font-sans);color:var(--brett-fg);',
    '}',
    '.brett-menu__title{text-align:center;}',
    '.brett-menu__brand{',
    '  margin:0;font-family:var(--brett-font-serif);font-weight:500;',
    '  font-size:clamp(28px,6vw,46px);letter-spacing:0.18em;color:var(--brett-fg);',
    '}',
    '.brett-menu__subtitle{margin:6px 0 0;color:var(--brett-mute);font-size:15px;letter-spacing:0.04em;}',
    '.brett-menu__card{width:min(440px,92vw);display:flex;flex-direction:column;gap:12px;}',
    '.brett-menu__action{width:100%;justify-content:flex-start;}',
    '.brett-menu__join{display:flex;gap:8px;}',
    '.brett-menu__join-input{flex:1 1 auto;}',
    '.brett-menu__join-go{flex:0 0 auto;}',
    '.brett-menu__footer{',
    '  display:flex;align-items:center;gap:14px;',
    '  color:var(--brett-mute);font-size:13px;',
    '}',
    '.brett-menu__logout{color:var(--brett-brass);text-decoration:none;}',
    '.brett-menu__logout:hover{text-decoration:underline;}',
  ].join('\n');
}

const MENU_STYLE_ID = 'brett-menu-styles';

export function injectMenuStyles(doc: Document = document): void {
  let style = doc.getElementById(MENU_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = MENU_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = menuCss();
}
