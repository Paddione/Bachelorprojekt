// brett/src/client/ui/export-toast.ts
// Top-right toast for export success/error feedback. Auto-dismisses after 2.5s.
// Pattern follows late-join-toast.ts.

const TOAST_STYLE_ID = 'brett-export-toast-styles';
const TOAST_CONTAINER_ID = 'brett-export-toasts';
const DISMISS_MS = 2500;

export function initExportToast(doc: Document = document): void {
  _injectToastStyles(doc);
  _ensureContainer(doc);
}

export function showExportToast(
  message: string,
  variant: 'success' | 'error' = 'success',
  doc: Document = document,
): void {
  _injectToastStyles(doc);
  const container = _ensureContainer(doc);
  const toast = doc.createElement('div');
  toast.className = `brett-export-toast brett-export-toast--${variant}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, DISMISS_MS);
}

function _injectToastStyles(doc: Document): void {
  if (doc.getElementById(TOAST_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = TOAST_STYLE_ID;
  el.textContent = [
    `#${TOAST_CONTAINER_ID}{position:fixed;top:56px;right:16px;z-index:90;`,
    'display:flex;flex-direction:column;gap:8px;pointer-events:none;}',
    '.brett-export-toast{font-family:var(--brett-font-sans,sans-serif);font-size:13px;',
    'background:var(--brett-ink-850,#101824);color:var(--brett-fg,#e7ead0);',
    'border:1px solid var(--brett-brass-dim,rgba(200,169,110,0.3));',
    'border-radius:var(--brett-radius-sm,8px);padding:10px 14px;',
    'box-shadow:0 4px 16px rgba(0,0,0,0.4);transition:opacity 0.3s ease;}',
    '.brett-export-toast--success{border-left:3px solid #4caf7c;}',
    '.brett-export-toast--error{border-left:3px solid #e05555;}',
  ].join('');
  doc.head.appendChild(el);
}

function _ensureContainer(doc: Document): HTMLElement {
  let c = doc.getElementById(TOAST_CONTAINER_ID);
  if (!c) {
    c = doc.createElement('div');
    c.id = TOAST_CONTAINER_ID;
    doc.body.appendChild(c);
  }
  return c;
}
