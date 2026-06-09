// brett/src/client/ui/topbar-invite.ts
// "Einladen" button in the board topbar. Visible only while a session code
// exists. Click copies the invite link immediately and opens a popup showing
// the full link with a "Kopiert ✓" confirmation. Pure helpers (buildInviteUrl,
// inviteButtonVisible) are node-testable; DOM lives in mountInviteButton.

/** Pure: build the shareable join URL. `origin` is passed explicitly so this is
 * testable without `window`. */
export function buildInviteUrl(origin: string, code: string): string {
  return `${origin}/api/join?code=${encodeURIComponent(code)}`;
}

/** Pure: the button is only meaningful when a non-empty session code exists. */
export function inviteButtonVisible(code: string | null | undefined): boolean {
  return typeof code === 'string' && code.length > 0;
}

const INVITE_STYLE_ID = 'brett-topbar-invite';

function injectStyles(doc: Document = document): void {
  if (doc.getElementById(INVITE_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = INVITE_STYLE_ID;
  el.textContent = [
    '.brett-invite-btn{font-family:var(--brett-font-sans,sans-serif);font-size:12px;',
    'background:var(--brett-brass,#c8a96e);color:var(--brett-ink-900,#0b111c);border:none;',
    'border-radius:var(--brett-radius-sm,8px);padding:6px 12px;cursor:pointer;font-weight:600;}',
    '.brett-invite-wrap{position:relative;display:inline-block;}',
    '.brett-invite-popup{position:absolute;top:calc(100% + 6px);right:0;z-index:60;',
    'background:var(--brett-ink-850,#101824);border:1px solid var(--brett-line,rgba(255,255,255,0.12));',
    'border-radius:var(--brett-radius-sm,8px);padding:10px 12px;min-width:240px;',
    'font-family:var(--brett-font-mono,monospace);font-size:11px;color:var(--brett-fg,#e7ead0);}',
    '.brett-invite-popup__link{user-select:all;word-break:break-all;color:var(--brett-brass,#c8a96e);}',
    '.brett-invite-popup__status{margin-top:6px;color:var(--brett-fg-soft,#aab);}',
  ].join('');
  doc.head.appendChild(el);
}

export interface InviteMountOptions {
  /** Injected for tests; defaults to the real clipboard. */
  writeClipboard?: (text: string) => Promise<void> | void;
  /** Injected for tests; defaults to window.location.origin. */
  getOrigin?: () => string;
}

/**
 * Mount the "Einladen" button into `anchorEl`. The button auto-shows/hides based
 * on `getSessionCode()` — call the returned `refresh()` whenever the session code
 * may have changed (board-boot wires this to lobbyChange). Returns a cleanup fn.
 */
export function mountInviteButton(
  anchorEl: HTMLElement,
  getSessionCode: () => string | null,
  opts: InviteMountOptions = {},
): { refresh: () => void; destroy: () => void } {
  injectStyles();
  const writeClipboard = opts.writeClipboard
    ?? ((t: string) => navigator.clipboard?.writeText(t));
  const getOrigin = opts.getOrigin ?? (() => window.location.origin);

  const wrap = document.createElement('div');
  wrap.className = 'brett-invite-wrap';
  const btn = document.createElement('button');
  btn.className = 'brett-invite-btn';
  btn.type = 'button';
  btn.textContent = '🔗 Einladen';
  btn.setAttribute('aria-haspopup', 'true');
  wrap.appendChild(btn);
  anchorEl.appendChild(wrap);

  let popup: HTMLDivElement | null = null;
  let statusTimer: ReturnType<typeof setTimeout> | null = null;

  function closePopup(): void {
    if (popup) { popup.remove(); popup = null; }
    document.removeEventListener('click', onOutside, true);
  }

  function onOutside(e: MouseEvent): void {
    if (popup && !wrap.contains(e.target as Node)) closePopup();
  }

  function openPopup(url: string): void {
    closePopup();
    popup = document.createElement('div');
    popup.className = 'brett-invite-popup';
    const link = document.createElement('div');
    link.className = 'brett-invite-popup__link';
    link.textContent = url;
    const status = document.createElement('div');
    status.className = 'brett-invite-popup__status';
    status.textContent = 'Kopiert ✓';
    popup.append(link, status);
    wrap.appendChild(popup);
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = 'Link zum Teilen'; }, 2000);
    setTimeout(() => document.addEventListener('click', onOutside, true), 0);
  }

  btn.addEventListener('click', () => {
    const code = getSessionCode();
    if (!inviteButtonVisible(code)) return;
    const url = buildInviteUrl(getOrigin(), code!);
    try { void writeClipboard(url); } catch { /* clipboard blocked — popup still shows the link */ }
    openPopup(url);
  });

  function refresh(): void {
    wrap.style.display = inviteButtonVisible(getSessionCode()) ? 'inline-block' : 'none';
    if (!inviteButtonVisible(getSessionCode())) closePopup();
  }

  refresh();

  return {
    refresh,
    destroy() {
      if (statusTimer) clearTimeout(statusTimer);
      closePopup();
      wrap.remove();
    },
  };
}
