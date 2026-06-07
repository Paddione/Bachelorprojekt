import * as THREE from 'three';
import { STATE, PLACEMENT_SPEC } from '../state';
import { sendUpdate } from '../ws-client';
import { placeholderSvg, type VarGetter } from './skin';

const textureCache = new Map<string, THREE.Texture>();

export function loadTex(path: string): THREE.Texture {
  if (!textureCache.has(path))
    textureCache.set(path, new THREE.TextureLoader().load(path, undefined, undefined, () => {}));
  return textureCache.get(path)!;
}

export const ACC_GROUPS: Record<string, string[]> = {
  head:  ['cap','blindfold','crown','veil','hair-short','hair-bun','hair-long','hair-braid','hair-curls'],
  upper: ['satchel','cane','shawl','swaddle','tunic','coat','apron','robe','vest'],
  feet:  ['boots-work','shoes-dress','sandals','barefoot'],
};

export function applyFaceToFig(fig: any, faceName: string | null): void {
  if (!fig.headMesh) return;
  if (faceName && PLACEMENT_SPEC.faces?.[faceName]) {
    const tex = loadTex(`/assets/figure-pack/faces/${faceName}.png`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = true;
    tex.anisotropy = 4;
    fig.headMesh.material.map = tex;
    fig.headMesh.material.transparent = true;
    fig.headMesh.material.alphaTest = 0.05;
    fig.headMesh.material.needsUpdate = true;
  } else {
    fig.headMesh.material.map = null;
    fig.headMesh.material.needsUpdate = true;
  }
}

const ACC_PLANE_SIZE = 0.30;
export function applyAccessorySlot(fig: any, slot: string, accName: string | null): void {
  // Remove old mesh for this slot
  const old = fig.appearanceMeshes[slot];
  if (old) { old.parent?.remove(old); delete fig.appearanceMeshes[slot]; }
  if (!accName) return;
  const spec = PLACEMENT_SPEC.accessories?.[accName];
  if (!spec) return;
  const boneName = spec.bone === 'neck' ? 'head' : spec.bone;
  const boneGroup = fig.bones?.[boneName];
  if (!boneGroup) return;
  const [ax, ay] = spec.anchorPx || [128, 128];
  const ox = -((ax - 128) / 256) * ACC_PLANE_SIZE;
  const oy =  ((128 - ay) / 256) * ACC_PLANE_SIZE;
  const tex = loadTex(`/assets/figure-pack/accessories/${accName}.png`);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const geo = new THREE.PlaneGeometry(ACC_PLANE_SIZE, ACC_PLANE_SIZE);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(ox, oy, 0.01);
  mesh.userData.isAppearanceMesh = true;
  boneGroup.add(mesh);
  fig.appearanceMeshes[slot] = mesh;
}

export function applyAppearanceToFig(fig: any, appearance: any): void {
  if (!appearance) return;
  fig.appearance = {
    ...fig.appearance,
    ...appearance,
    accessories: { ...fig.appearance?.accessories, ...appearance.accessories }
  };
  applyFaceToFig(fig, fig.appearance.face);
  // Accessories
  for (const slot of ['head','upper','feet']) {
    applyAccessorySlot(fig, slot, fig.appearance.accessories?.[slot]);
  }
}

// ── Appearance Drawer logic ─────────────────────────────────────────────────
// CSS-variable resolver for token-driven canvas/SVG colors.
const cssVar: VarGetter = (n: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(n);

const appearanceDrawer = document.getElementById('appearance-drawer')!;
const appearanceBtn    = document.getElementById('appearance-btn') as HTMLButtonElement | null;
const drawerClose      = document.getElementById('appearance-drawer-close');
const cancelBtn        = document.getElementById('appearance-cancel');
const applyBtn         = document.getElementById('appearance-apply');

let _preOpenAppearance: any = null; // snapshot before drawer opens

export function openAppearanceDrawer(): void {
  const fig = STATE.figures.find(f => f.id === STATE.selectedId);
  if (!fig) return;
  _preOpenAppearance = JSON.parse(JSON.stringify(fig.appearance || {}));
  syncDrawerToFig(fig);
  appearanceDrawer.classList.add('open');
  appearanceBtn?.classList.add('open');
}

export function closeAppearanceDrawer(): void {
  appearanceDrawer.classList.remove('open');
  appearanceBtn?.classList.remove('open');
  _preOpenAppearance = null;
}

function buildDrawerContent(): void {
  buildFaceGrid();
  buildBodyGrid();
  buildAccGrid('head', ACC_GROUPS.head);
  buildAccGrid('upper', ACC_GROUPS.upper);
  buildAccGrid('feet', ACC_GROUPS.feet);
}

function makeThumbItem(imgSrc: string, label: string, clickHandler: () => void, isNullItem = false): HTMLElement {
  const el = document.createElement('div');
  el.className = 'thumb-item' + (isNullItem ? ' null-item' : '');
  const img = document.createElement('img');
  img.src = imgSrc;
  img.alt = label;
  img.loading = 'lazy';
  const span = document.createElement('span');
  span.textContent = label;
  el.appendChild(img);
  el.appendChild(span);
  el.addEventListener('click', clickHandler);
  return el;
}

function buildFaceGrid(): void {
  const grid = document.getElementById('drawer-face-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const faces = Object.keys(PLACEMENT_SPEC.faces || {}).filter(k => !k.startsWith('_'));
  // "No face" option
  const nullEl = makeThumbItem(placeholderSvg('Keine', 'empty', cssVar), 'Keine', () => {
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (fig) applyAppearanceToFig(fig, { face: null });
    syncDrawerToFig(STATE.figures.find(f => f.id === STATE.selectedId));
  }, true);
  grid.appendChild(nullEl);
  for (const face of faces) {
    const el = makeThumbItem(`/assets/figure-pack/faces/${face}.png`, face, () => {
      const fig = STATE.figures.find(f => f.id === STATE.selectedId);
      if (fig) applyAppearanceToFig(fig, { face });
      syncDrawerToFig(STATE.figures.find(f => f.id === STATE.selectedId));
    });
    grid.appendChild(el);
  }
}

function buildBodyGrid(): void {
  const grid = document.getElementById('drawer-body-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const bodies = Object.keys(PLACEMENT_SPEC.bodies || {}).filter(k => !k.startsWith('_'));
  for (const body of bodies) {
    const el = makeThumbItem(
      placeholderSvg(body, 'body', cssVar),
      body,
      () => {
        const fig = STATE.figures.find(f => f.id === STATE.selectedId);
        if (fig) applyAppearanceToFig(fig, { body });
        syncDrawerToFig(STATE.figures.find(f => f.id === STATE.selectedId));
      }
    );
    grid.appendChild(el);
  }
}

function buildAccGrid(slot: string, names: string[]): void {
  const grid = document.getElementById(`drawer-acc-${slot}-grid`);
  if (!grid) return;
  grid.innerHTML = '';
  // "No accessory" option
  const nullEl = makeThumbItem(placeholderSvg('Keine', 'empty', cssVar), 'Keine', () => {
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (fig) applyAppearanceToFig(fig, { accessories: { [slot]: null } });
    syncDrawerToFig(STATE.figures.find(f => f.id === STATE.selectedId));
  }, true);
  grid.appendChild(nullEl);
  for (const name of names) {
    const el = makeThumbItem(`/assets/figure-pack/accessories/${name}.png`, name, () => {
      const fig = STATE.figures.find(f => f.id === STATE.selectedId);
      if (fig) applyAppearanceToFig(fig, { accessories: { [slot]: name } });
      syncDrawerToFig(STATE.figures.find(f => f.id === STATE.selectedId));
    });
    grid.appendChild(el);
  }
}

export function syncDrawerToFig(fig: any): void {
  if (!fig) return;
  const app = fig.appearance || {};
  // Face
  const faceGrid = document.getElementById('drawer-face-grid');
  faceGrid?.querySelectorAll('.thumb-item').forEach((el, i) => {
    const faces = Object.keys(PLACEMENT_SPEC.faces || {}).filter(k => !k.startsWith('_'));
    const faceName = i === 0 ? null : faces[i - 1];
    el.classList.toggle('active', app.face === faceName);
  });
  // Body
  const bodyGrid = document.getElementById('drawer-body-grid');
  bodyGrid?.querySelectorAll('.thumb-item').forEach((el, i) => {
    const bodies = Object.keys(PLACEMENT_SPEC.bodies || {}).filter(k => !k.startsWith('_'));
    el.classList.toggle('active', app.body === bodies[i]);
  });
  // Accessories
  for (const slot of ['head','upper','feet']) {
    const grid = document.getElementById(`drawer-acc-${slot}-grid`);
    const names = ACC_GROUPS[slot];
    grid?.querySelectorAll('.thumb-item').forEach((el, i) => {
      const accName = i === 0 ? null : names[i - 1];
      el.classList.toggle('active', app.accessories?.[slot] === accName);
    });
  }
}

export async function initAppearance(): Promise<void> {
  try {
    const res = await fetch('/assets/figure-pack/placement_spec.json');
    const spec = await res.json();
    Object.assign(PLACEMENT_SPEC, spec);
    buildDrawerContent();
  } catch { /* keep defaults */ }

  // Drawer button listeners
  appearanceBtn?.addEventListener('click', () => {
    if (appearanceDrawer.classList.contains('open')) {
      closeAppearanceDrawer();
      return;
    }
    openAppearanceDrawer();
  });

  drawerClose?.addEventListener('click', () => {
    // Cancel: revert to pre-open state
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (fig && _preOpenAppearance) applyAppearanceToFig(fig, _preOpenAppearance);
    closeAppearanceDrawer();
  });

  cancelBtn?.addEventListener('click', () => {
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (fig && _preOpenAppearance) applyAppearanceToFig(fig, _preOpenAppearance);
    closeAppearanceDrawer();
  });

  applyBtn?.addEventListener('click', () => {
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (!fig) { closeAppearanceDrawer(); return; }
    sendUpdate(fig, { appearance: { ...fig.appearance } });
    closeAppearanceDrawer();
  });
}
