import fs from 'fs';
import path from 'path';

export const PRESETS_FILE = process.env.BRETT_PRESETS_PATH || path.join(__dirname, '..', '..', 'presets.json');
const SPEC_PATH_PUBLIC = path.join(__dirname, '..', '..', 'public', 'assets', 'figure-pack', 'placement_spec.json');
const SPEC_PATH_DIST   = path.join(__dirname, '..', '..', 'dist', 'client', 'assets', 'figure-pack', 'placement_spec.json');
export const SPEC_PATH = fs.existsSync(SPEC_PATH_PUBLIC) ? SPEC_PATH_PUBLIC : SPEC_PATH_DIST;

export let SPEC: { faces: Record<string, any>; accessories: Record<string, any>; bodies: Record<string, any> } =
  { faces: {}, accessories: {}, bodies: {} };
try {
  SPEC = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
  const fc = Object.keys(SPEC.faces || {}).filter(k => !k.startsWith('_')).length;
  const ac = Object.keys(SPEC.accessories || {}).filter(k => !k.startsWith('_')).length;
  const bc = Object.keys(SPEC.bodies || {}).filter(k => !k.startsWith('_')).length;
  console.log(`[figure-pack] loaded spec: ${fc} faces, ${ac} accessories, ${bc} bodies`);
} catch (err) {
  console.warn(`[figure-pack] no spec at ${SPEC_PATH} — appearance validation disabled`);
}

const FACE_NAMES = () => Object.keys(SPEC.faces || {}).filter((k) => !k.startsWith('_'));
const BODY_NAMES = () => Object.keys(SPEC.bodies || {}).filter((k) => !k.startsWith('_'));
const ACC_NAMES = () => Object.keys(SPEC.accessories || {}).filter((k) => !k.startsWith('_'));

export function validateAppearance(a: any): string | null {
  if (!a || typeof a !== 'object') return 'appearance required';
  const faces = FACE_NAMES();
  const bodies = BODY_NAMES();
  const accs   = ACC_NAMES();
  if (a.face !== null && a.face !== undefined) {
    if (typeof a.face !== 'string') return 'face must be string or null';
    if (faces.length && !faces.includes(a.face)) return `unknown face: ${a.face}`;
  }
  if (a.body !== null && a.body !== undefined) {
    if (typeof a.body !== 'string') return 'body must be string or null';
    if (bodies.length && !bodies.includes(a.body)) return `unknown body: ${a.body}`;
  }
  if (a.accessories !== undefined && a.accessories !== null) {
    if (typeof a.accessories !== 'object' || Array.isArray(a.accessories)) return 'accessories must be object';
    const { head, upper, feet } = a.accessories;
    for (const [slot, val] of [['head', head], ['upper', upper], ['feet', feet]]) {
      if (val !== null && val !== undefined) {
        if (typeof val !== 'string') return `accessories.${slot} must be string or null`;
        if (accs.length && !accs.includes(val)) return `unknown accessory: ${val}`;
      }
    }
  }
  return null;
}

export function loadPresets(): any[] {
  try {
    const raw = JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8'));
    if (!Array.isArray(raw)) return [];
    const migrated = raw.filter(p => p && p.appearance && !p.outfit);
    if (migrated.length !== raw.length) {
      console.log(`[presets] dropped ${raw.length - migrated.length} legacy preset(s) with old outfit schema`);
      savePresets(migrated);
    }
    return migrated;
  } catch { return []; }
}

export function savePresets(presets: any[]): void {
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2));
}
