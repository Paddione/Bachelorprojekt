export function shareButtonVisible(role: string | undefined | null, isAdmin: boolean): boolean {
  return isAdmin === true || role === 'leiter';
}

const SHARE_STYLE_ID = 'brett-topbar-share';

function injectStyles(doc: Document = document): void {
  if (doc.getElementById(SHARE_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = SHARE_STYLE_ID;
  el.textContent =
    '.brett-share-btn{font-family:var(--brett-font-sans,sans-serif);font-size:12px;' +
    'background:transparent;color:var(--brett-fg,#e7ead0);border:1px solid var(--brett-line,rgba(255,255,255,0.18));' +
    'border-radius:var(--brett-radius-sm,8px);padding:6px 12px;cursor:pointer;}' +
    '.brett-share-btn:hover{background:rgba(255,255,255,0.06);}';
  doc.head.appendChild(el);
}

export interface ShareMountOptions {
  roomToken: string;
  role: string | undefined | null;
  isAdmin: boolean;
  doFetch?: typeof fetch;
  writeClipboard?: (text: string) => Promise<void> | void;
  showToast?: (msg: string) => void;
}

export function mountShareButton(slot: HTMLElement | null, opts: ShareMountOptions): void {
  if (!slot) return;
  if (!shareButtonVisible(opts.role, opts.isAdmin)) return;
  injectStyles();
  const btn = document.createElement('button');
  btn.id = 'share-btn';
  btn.className = 'brett-share-btn';
  btn.title = 'Board teilen';
  btn.setAttribute('aria-label', 'Board-Link teilen');
  btn.textContent = '\u{1F517} Teilen';
  const fetcher = opts.doFetch ?? fetch;
  const clip = opts.writeClipboard ?? ((t: string) => navigator.clipboard?.writeText(t));
  const toast = opts.showToast ?? defaultToast;
  btn.addEventListener('click', async () => {
    try {
      const resp = await fetcher(`/api/rooms/${encodeURIComponent(opts.roomToken)}/share`, { method: 'POST' });
      if (!resp.ok) { toast('Teilen fehlgeschlagen.'); return; }
      const { url } = await resp.json();
      await clip(url);
      toast('Link in Zwischenablage kopiert!');
    } catch {
      toast('Teilen fehlgeschlagen.');
    }
  });
  slot.appendChild(btn);
}

function defaultToast(msg: string): void {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
    'background:#c8a96e;color:#0b111c;padding:8px 16px;border-radius:8px;z-index:200;font-size:13px;';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
