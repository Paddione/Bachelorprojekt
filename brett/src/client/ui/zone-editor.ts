// brett/src/client/ui/zone-editor.ts — E1/E2
// Zonen produktiv machen: Drag-Verschieben + Edit-Popover (Größe/Label/Opacity/
// Variante). Sendet `zone_update`-Messages. Die schwere Popover-Logik lebt hier,
// nicht in ground-objects.ts (S1-Budget-Schutz). Rein client-seitig: die
// Server-Autorität liegt beim leiter-gated ADMIN_TYPES-Pfad.
import * as THREE from 'three';
import type { Zone } from '../../types/state';
import { getWs, isWsReady, getScene } from '../state';
import { zoneMeshes } from '../ground-objects';
import { t } from '../i18n';

interface ZoneEditRefs {
  renderer: { domElement: HTMLElement };
  raycaster: THREE.Raycaster;
  mannequin: { setNdc: (e: MouseEvent) => void; getTickRefs: () => { ndc: any }; pickContact?: (e: MouseEvent) => any };
  floor: THREE.Object3D;
}

function sendZoneUpdate(patch: Partial<Zone> & { zoneId: string }): void {
  const ws = getWs();
  if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'zone_update', ...patch }));
}

// ── Edit-Popover ──────────────────────────────────────────────────────────────

let popover: HTMLElement | null = null;

export function closeZoneEditor(): void {
  popover?.remove();
  popover = null;
}

export function openZoneEditor(zone: Zone): void {
  closeZoneEditor();
  const box = document.createElement('div');
  box.id = 'zone-editor-popover';
  Object.assign(box.style, {
    position: 'absolute', top: '80px', right: '12px', zIndex: '40',
    display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px',
    padding: '14px', background: 'rgba(10,14,24,0.94)',
    border: '1px solid rgba(78,161,255,0.4)', borderRadius: '10px',
    fontFamily: 'var(--brett-font-mono, monospace)', fontSize: '12px',
    color: 'var(--brett-blue, #4ea1ff)',
  });

  const title = document.createElement('div');
  title.textContent = t('zone.edit');
  title.style.fontWeight = 'bold';
  box.appendChild(title);

  const mkRow = (labelKey: string, input: HTMLElement): HTMLElement => {
    const row = document.createElement('label');
    Object.assign(row.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' });
    const span = document.createElement('span');
    span.textContent = t(labelKey);
    row.appendChild(span);
    row.appendChild(input);
    return row;
  };

  // Label
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.value = zone.label ?? '';
  labelInput.style.width = '120px';
  box.appendChild(mkRow('fig.label', labelInput));

  // Größe (width/height oder radius)
  const sizeInputs: HTMLInputElement[] = [];
  if (zone.shape === 'circle') {
    const r = document.createElement('input');
    r.type = 'number'; r.step = '0.1'; r.min = '0.3'; r.value = String(zone.radius ?? 1.5); r.style.width = '70px';
    r.dataset.field = 'radius';
    sizeInputs.push(r);
    box.appendChild(mkRow('zone.size', r));
  } else {
    const w = document.createElement('input');
    w.type = 'number'; w.step = '0.1'; w.min = '0.3'; w.value = String(zone.width ?? 2.0); w.style.width = '55px'; w.dataset.field = 'width';
    const h = document.createElement('input');
    h.type = 'number'; h.step = '0.1'; h.min = '0.3'; h.value = String(zone.height ?? 2.0); h.style.width = '55px'; h.dataset.field = 'height';
    const wrap = document.createElement('span');
    wrap.append(w, document.createTextNode(' × '), h);
    sizeInputs.push(w, h);
    box.appendChild(mkRow('zone.size', wrap));
  }

  // Opacity
  const op = document.createElement('input');
  op.type = 'range'; op.min = '0.05'; op.max = '1'; op.step = '0.05';
  op.value = String(zone.opacity ?? 0.25);
  box.appendChild(mkRow('fig.opacity', op));

  // Variante
  const variantSel = document.createElement('select');
  for (const [val, key] of [['filled', 'zone.variantFilled'], ['frame', 'zone.variantFrame']] as const) {
    const o = document.createElement('option');
    o.value = val; o.textContent = t(key);
    if ((zone.variant ?? 'filled') === val) o.selected = true;
    variantSel.appendChild(o);
  }
  box.appendChild(mkRow('zone.variantFilled', variantSel));

  const apply = (): void => {
    const patch: Partial<Zone> & { zoneId: string } = { zoneId: zone.id };
    patch.label = labelInput.value;
    patch.opacity = parseFloat(op.value);
    patch.variant = variantSel.value as 'filled' | 'frame';
    for (const inp of sizeInputs) {
      const field = inp.dataset.field as 'width' | 'height' | 'radius';
      const num = parseFloat(inp.value);
      if (!Number.isNaN(num)) (patch as any)[field] = num;
    }
    sendZoneUpdate(patch);
  };
  for (const el of [labelInput, op, variantSel, ...sizeInputs]) {
    el.addEventListener('change', apply);
  }
  op.addEventListener('input', apply);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = t('onboarding.done');
  Object.assign(closeBtn.style, { marginTop: '4px', cursor: 'pointer', padding: '4px 8px' });
  closeBtn.addEventListener('click', closeZoneEditor);
  box.appendChild(closeBtn);

  document.body.appendChild(box);
  popover = box;
}

// ── Interaktion: Drag-Verschieben + Doppelklick-Edit ───────────────────────────

/** Ermittelt die Zone unter dem Cursor (raycast auf die Zone-Groups). */
function pickZone(e: MouseEvent, refs: ZoneEditRefs): Zone | null {
  if (zoneMeshes.size === 0) return null;
  refs.mannequin.setNdc(e);
  const { ndc } = refs.mannequin.getTickRefs();
  if (!ndc) return null;
  const { camera } = getScene();
  refs.raycaster.setFromCamera(ndc, camera);
  const groups = [...zoneMeshes.values()];
  const hits = refs.raycaster.intersectObjects(groups, true);
  if (hits.length === 0) return null;
  // Group-ID über die zoneMeshes-Map rückauflösen.
  for (const [id, g] of zoneMeshes) {
    let o: THREE.Object3D | null = hits[0].object;
    while (o) { if (o === g) return (g.userData?.zone as Zone) ?? ({ id } as Zone); o = o.parent; }
  }
  return null;
}

function floorPoint(e: MouseEvent, refs: ZoneEditRefs): { x: number; z: number } | null {
  refs.mannequin.setNdc(e);
  const { ndc } = refs.mannequin.getTickRefs();
  if (!ndc) return null;
  const { camera } = getScene();
  refs.raycaster.setFromCamera(ndc, camera);
  const hit = refs.raycaster.intersectObject(refs.floor, false)[0];
  if (!hit) return null;
  return { x: Math.round(hit.point.x * 10) / 10, z: Math.round(hit.point.z * 10) / 10 };
}

/**
 * Verdrahtet Zonen-Interaktion: Doppelklick auf eine Zone öffnet den Editor,
 * Drag verschiebt sie (throttled `zone_update`). Nur für Admins/Leiter aktiv.
 */
export function initZoneEditing(refs: ZoneEditRefs): void {
  if (!(window as any).__brettCurrentUserIsAdmin) return;
  const el = refs.renderer.domElement;

  // Doppelklick → Editor (capture, um figure-dblclick zuvorzukommen).
  el.addEventListener('dblclick', (e) => {
    const zone = pickZone(e, refs);
    if (zone) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openZoneEditor(zone);
    }
  }, { capture: true });

  // Drag-Verschieben: nur wenn kein Figuren-Kontakt getroffen wurde.
  let dragId: string | null = null;
  let lastSent = 0;
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.shiftKey) return;
    if (refs.mannequin.pickContact?.(e)) return; // Figur hat Vorrang
    const zone = pickZone(e, refs);
    if (!zone) return;
    dragId = zone.id;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, { capture: true });

  window.addEventListener('mousemove', (e) => {
    if (!dragId) return;
    const pt = floorPoint(e, refs);
    if (!pt) return;
    const now = performance.now();
    if (now - lastSent < 40) return;
    lastSent = now;
    sendZoneUpdate({ zoneId: dragId, x: pt.x, z: pt.z });
  });

  window.addEventListener('mouseup', (e) => {
    if (!dragId) return;
    const pt = floorPoint(e, refs);
    if (pt) sendZoneUpdate({ zoneId: dragId, x: pt.x, z: pt.z });
    dragId = null;
  });
}
