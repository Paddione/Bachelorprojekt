// brett/src/client/ui/late-join-toast.ts
// Top-right toast shown to the leader when someone late-joins. Auto-dismisses
// after 3s; multiple toasts stack. Pure text in lateJoinToastText(); the DOM
// surface is injected (LateJoinToastDeps) so it is testable without jsdom.

/** Pure: the toast body text for a given participant name. */
export function lateJoinToastText(name: string): string {
  return `${name} ist beigetreten`;
}

const TOAST_STYLE_ID = 'brett-late-join-toast';
const TOAST_CONTAINER_ID = 'brett-late-join-toasts';
const DISMISS_MS = 3000;

function injectStyles(doc: Document = document): void {
  if (doc.getElementById(TOAST_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = TOAST_STYLE_ID;
  el.textContent = [
    `#${TOAST_CONTAINER_ID}{position:fixed;top:56px;right:16px;z-index:80;`,
    'display:flex;flex-direction:column;gap:8px;pointer-events:none;}',
    '.brett-late-join-toast{font-family:var(--brett-font-sans,sans-serif);font-size:13px;',
    'background:var(--brett-ink-850,#101824);color:var(--brett-fg,#e7ead0);',
    'border:1px solid var(--brett-brass-dim,rgba(200,169,110,0.3));',
    'border-left:3px solid var(--brett-brass,#c8a96e);',
    'border-radius:var(--brett-radius-sm,8px);padding:10px 14px;',
    'box-shadow:0 4px 16px rgba(0,0,0,0.4);animation:brett-toast-in 0.2s ease-out;}',
    '@keyframes brett-toast-in{from{opacity:0;transform:translateX(20px);}to{opacity:1;transform:none;}}',
  ].join('');
  doc.head.appendChild(el);
}

function ensureContainer(doc: Document = document): HTMLElement {
  let c = doc.getElementById(TOAST_CONTAINER_ID);
  if (!c) {
    c = doc.createElement('div');
    c.id = TOAST_CONTAINER_ID;
    doc.body.appendChild(c);
  }
  return c;
}

/** Injectable DOM surface — defaults to the real document in the browser. */
export interface LateJoinToastDeps {
  createEl: () => any;
  container: any;
  setTimeout: (fn: () => void, ms: number) => any;
}

function realDeps(): LateJoinToastDeps {
  injectStyles();
  return {
    createEl: () => document.createElement('div'),
    container: ensureContainer(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  };
}

/**
 * Show a late-join toast for `name`. Stacks in a fixed top-right container and
 * auto-dismisses after 3s. `deps` is injected only in tests.
 */
export function showLateJoinToast(name: string, deps: LateJoinToastDeps = realDeps()): void {
  const toast = deps.createEl();
  toast.className = 'brett-late-join-toast';
  toast.textContent = lateJoinToastText(name);
  deps.container.appendChild(toast);
  deps.setTimeout(() => { toast.remove(); }, DISMISS_MS);
}
