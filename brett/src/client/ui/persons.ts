import { PLACEMENT_SPEC } from '../state';
import { addFigure, closeFigPanel } from './fig-panel';
import { recolorFigure } from '../mannequin';
import { applyAppearanceToFig } from './appearance';
import { sendUpdate } from '../ws-client';

export const NAMED_PERSONS = [
  { key: 'portrait-patrick',   label: 'Patrick',   color: '#6f8db8', brand: 'korczewski' },
  { key: 'portrait-christina', label: 'Christina', color: '#c06be0', brand: 'korczewski' },
  { key: 'portrait-papa',      label: 'Papa',      color: '#808080', brand: 'korczewski' },
  { key: 'portrait-martina',   label: 'Martina',   color: '#6be0a0', brand: 'korczewski' },
  { key: 'portrait-oskar',     label: 'Oskar',     color: '#c8a96e', brand: 'korczewski' },
];

export function buildPersonsPanel(persons: Array<{ key: string; label: string; color: string; brand?: string }>): void {
  const grid = document.getElementById('fig-panel-persons');
  if (!grid) return;
  grid.innerHTML = '';
  for (const p of persons) {
    const btn = document.createElement('button');
    btn.className = 'fig-size-btn';
    btn.style.cssText = `border-left:3px solid ${p.color};text-align:left;padding:4px 7px;` +
      `font-size:11px;display:flex;align-items:center;gap:6px;`;
    const img = document.createElement('img');
    img.src = `/assets/figure-pack/faces/${p.key}.png`;
    img.style.cssText = 'width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;';
    img.alt = p.label;
    const span = document.createElement('span');
    span.textContent = p.label;
    btn.appendChild(img);
    btn.appendChild(span);
    btn.addEventListener('click', () => {
      const x = (Math.random() - 0.5) * 4;
      const z = (Math.random() - 0.5) * 4;
      const fig = addFigure({ x, z });
      fig.label = p.label;
      recolorFigure(fig, p.color);
      function tryApply() {
        if (PLACEMENT_SPEC.faces?.[p.key]) {
          applyAppearanceToFig(fig, { face: p.key });
          sendUpdate(fig, { appearance: fig.appearance });
        } else {
          setTimeout(tryApply, 100);
        }
      }
      tryApply();
      closeFigPanel();
    });
    grid.appendChild(btn);
  }
}

export async function initPersons(): Promise<void> {
  try {
    const cfg = await (await fetch('/api/config')).json();
    const { filterPersonsForBrand } = await import('/assets/coaching/brand.mjs' as any);
    buildPersonsPanel(filterPersonsForBrand(NAMED_PERSONS, cfg.brand));
  } catch {
    buildPersonsPanel([]); // fail safe: hide brand-tagged persons
  }
}
