// Brett — floating "edit appearance" badge that hovers over the selected figure.
// The pure helper functions (ndcToScreen, badgeVisible) have NO Three.js or DOM
// dependencies so they are importable under node:test.

export interface ScreenPoint { x: number; y: number; }

/** Map normalized device coords (x,y in [-1,1]) to pixel coords (y flipped). */
export function ndcToScreen(ndcX: number, ndcY: number, width: number, height: number): ScreenPoint {
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (1 - (ndcY * 0.5 + 0.5)) * height,
  };
}

/** Badge shows only for a current selection that projects in front of the camera. */
export function badgeVisible(selectedId: string | null, ndcZ: number): boolean {
  if (!selectedId) return false;
  return ndcZ < 1; // z>=1 means at/behind the far plane / behind camera
}

// ── DOM-dependent section (lazy access — not evaluated at import time) ────────

let badgeEl: HTMLDivElement | null = null;

function ensureBadge(): HTMLDivElement {
  if (badgeEl) return badgeEl;
  const el = document.createElement('div');
  el.id = 'appearance-badge';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', 'Aussehen bearbeiten');
  el.textContent = '🙂 ✏️';
  Object.assign(el.style, {
    position: 'fixed',
    transform: 'translate(-50%, -130%)',
    padding: '4px 8px',
    borderRadius: '999px',
    background: 'rgba(20,22,18,0.85)',
    color: '#e7ead0',
    fontSize: '13px',
    cursor: 'pointer',
    zIndex: '40',
    pointerEvents: 'auto',
    userSelect: 'none',
    display: 'none',
  } as CSSStyleDeclaration);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    // Lazy import to avoid circular dependency and eager DOM/THREE load.
    import('./appearance').then(({ openAppearanceDrawer }) => {
      openAppearanceDrawer();
    });
    hideBadge();
  });
  document.body.appendChild(el);
  badgeEl = el;
  return el;
}

export function hideBadge(): void {
  if (badgeEl) badgeEl.style.display = 'none';
}

/**
 * Reposition (or hide) the badge each frame. Call from the render loop.
 * `getAnchor` resolves the selected figure's world anchor (e.g. head position).
 *
 * THREE types are dynamically required at call time to avoid top-level THREE
 * imports (preserves the no-eager-three contract).
 */
export function updateBadge(
  camera: import('three').Camera,
  renderer: { domElement: HTMLCanvasElement },
  getAnchor: (figId: string) => import('three').Vector3 | null,
): void {
  // Lazy import STATE to avoid circular / eager imports at module load.
  const { STATE } = require('../state') as typeof import('../state');
  const el = ensureBadge();
  const id = STATE.selectedId;
  const drawerOpen = document.getElementById('appearance-drawer')?.classList.contains('open');
  if (!id || drawerOpen) { el.style.display = 'none'; return; }
  const anchor = getAnchor(id);
  if (!anchor) { el.style.display = 'none'; return; }
  const v = anchor.clone().project(camera);
  if (!badgeVisible(id, v.z)) { el.style.display = 'none'; return; }
  const rect = renderer.domElement.getBoundingClientRect();
  const p = ndcToScreen(v.x, v.y, rect.width, rect.height);
  el.style.left = `${rect.left + p.x}px`;
  el.style.top = `${rect.top + p.y}px`;
  el.style.display = 'block';
}
