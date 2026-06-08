// Feature 3 — one-time onboarding toast sequence for the board leader (coach).
// Plain DOM/CSS, no external tour library. Dependency-injected storage + doc so
// it is unit-testable under node:test (no real DOM at test time).

export const ONBOARDING_KEY = 'brett_onboarding_v1';

export interface ToastSpec {
  title: string;
  text: string;
  highlightId?: string; // element to outline (best-effort), optional
  button: string;
}

export const TOASTS: ToastSpec[] = [
  {
    title: 'Figur hinzufügen',
    text: 'Klicke auf das + Icon, um eine Figur ins Brett zu setzen.',
    highlightId: 'fig-panel-btn',
    button: 'Weiter →',
  },
  {
    title: 'Emotion wählen',
    text: 'Doppelklicke eine Figur, um ihr ein Gesicht und Accessory zuzuweisen.',
    button: 'Weiter →',
  },
  {
    title: 'Verbindung ziehen',
    text: 'Halte eine Figur gedrückt und ziehe zu einer anderen, um eine Verbindung zu erstellen.',
    button: 'Verstanden ✓',
  },
];

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; }
interface DocLike {
  createElement(tag: string): any;
  body: { appendChild(el: any): void };
  getElementById(id: string): any;
}

export interface OnboardingDeps {
  role: string | null | undefined;
  storage?: StorageLike;
  doc?: DocLike;
  delayMs?: number;
}

export function maybeStartOnboarding(deps: OnboardingDeps): void {
  const storage = deps.storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  const doc = deps.doc ?? (typeof document !== 'undefined' ? (document as unknown as DocLike) : null);
  if (!storage || !doc) return;
  if (deps.role !== 'leiter') return;
  if (storage.getItem(ONBOARDING_KEY)) return;

  const delay = deps.delayMs ?? 1000;
  const start = () => mountToast(0, storage, doc);
  if (delay > 0 && typeof setTimeout !== 'undefined') setTimeout(start, delay);
  else start();
}

function mountToast(index: number, storage: StorageLike, doc: DocLike): void {
  if (index >= TOASTS.length) return;
  const spec = TOASTS[index];

  const card = doc.createElement('div');
  card.className = 'brett-onboarding-toast';
  card.dataset.role = 'onboarding-toast';
  Object.assign(card.style, {
    position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
    maxWidth: '320px', padding: '14px 16px', borderRadius: '12px',
    background: 'rgba(20,22,18,0.88)', color: '#fff', zIndex: '60',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)', fontSize: '14px', lineHeight: '1.4',
  });

  const h = doc.createElement('div');
  h.style.fontWeight = '600';
  h.style.marginBottom = '6px';
  h.textContent = `${spec.title}  (${index + 1}/${TOASTS.length})`;
  card.appendChild(h);

  const p = doc.createElement('div');
  p.textContent = spec.text;
  p.style.marginBottom = '10px';
  card.appendChild(p);

  const btn = doc.createElement('button');
  btn.dataset.role = 'onboarding-next';
  btn.textContent = spec.button;
  Object.assign(btn.style, {
    background: '#e7ead0', color: '#141612', border: 'none',
    padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
  });
  btn.addEventListener('click', () => {
    card.remove();
    if (index + 1 < TOASTS.length) {
      mountToast(index + 1, storage, doc);
    } else {
      storage.setItem(ONBOARDING_KEY, '1');
    }
  });
  card.appendChild(btn);

  doc.body.appendChild(card);
}
