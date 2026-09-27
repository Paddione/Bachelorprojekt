// scripts/llm/agent-bench/lib/cases.mjs
// Reines Modul: Fall-Layout unter cases/ laden und mit sprechenden Fehlern validieren.
// Kein Netzwerk- und kein Prozesszugriff — deterministisch, nur Dateisystem-Lesen.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

export const ROLES = Object.freeze([
  'planner',
  'orchestrator',
  'code-worker',
  'vision-worker',
  'reviewer',
]);

export const PERSPECTIVES = Object.freeze([
  'clean',
  'ambiguous',
  'faulty-worker',
  'conflicting',
  'detour-trap',
  'vision',
]);

export const SPLITS = Object.freeze(['eval', 'train']);

export const EXPECTED_DECISIONS = Object.freeze(['execute', 'clarify']);

const IMAGE_EXTENSIONS = Object.freeze(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg']);

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function readTextSafe(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

// Fehlende Datei -> { present: false }; kaputtes JSON -> { present: true, error }.
function loadJson(p) {
  const text = readTextSafe(p);
  if (text === null) return { present: false, value: null, error: null };
  try {
    return { present: true, value: JSON.parse(text), error: null };
  } catch (err) {
    return { present: true, value: null, error: err.message };
  }
}

function subdirs(dir) {
  if (!isDir(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function isImageFile(name) {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function hasImageFile(dir) {
  if (!isDir(dir)) return false;
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .some((e) => isImageFile(e.name));
}

/**
 * Komma-Listen (oder Arrays) von Rollennamen prüfen.
 * Wirft einen Error, der den falschen Namen nennt.
 */
export function parseRoles(csv) {
  const raw = Array.isArray(csv) ? csv : String(csv ?? '').split(',');
  const roles = raw.map((r) => String(r).trim()).filter((r) => r.length > 0);
  if (roles.length === 0) {
    throw new Error(`parseRoles: leere Rollenliste (erlaubt: ${ROLES.join(', ')})`);
  }
  const unknown = roles.filter((r) => !ROLES.includes(r));
  if (unknown.length > 0) {
    throw new Error(
      `unbekannte Rolle ${unknown.map((r) => `"${r}"`).join(', ')} (erlaubt: ${ROLES.join(', ')})`,
    );
  }
  return [...new Set(roles)];
}

function loadVariant(variantDir) {
  const id = basename(variantDir);
  const json = loadJson(join(variantDir, 'variant.json'));
  const v = json.value && typeof json.value === 'object' ? json.value : {};
  return {
    id,
    dir: variantDir,
    perspective: typeof v.perspective === 'string' ? v.perspective : null,
    roles: Array.isArray(v.roles) ? v.roles.map((r) => String(r)) : [],
    budget: v.budget && typeof v.budget === 'object' ? v.budget : null,
    expected_decision: typeof v.expected_decision === 'string' ? v.expected_decision : null,
    briefPath: join(variantDir, 'brief.md'),
    referenceDir: join(variantDir, 'reference'),
    checksDir: join(variantDir, 'checks'),
    json_error: json.error,
  };
}

/**
 * Alle Faelle unter casesDir lesen.
 * @param {string} casesDir
 * @param {{ split?: 'eval'|'train' }} [options]
 */
export function loadCases(casesDir, { split } = {}) {
  if (!isDir(casesDir)) {
    throw new Error(`loadCases: cases-Verzeichnis nicht gefunden: ${casesDir}`);
  }
  const cases = [];
  for (const id of subdirs(casesDir)) {
    const dir = join(casesDir, id);
    const meta = loadJson(join(dir, 'case.json'));
    const metaValue = meta.value && typeof meta.value === 'object' ? meta.value : {};
    const base = join(dir, 'base');
    const variantsDir = join(dir, 'variants');
    const replayJson = loadJson(join(dir, 'replay.json'));
    const record = {
      id,
      dir,
      split: typeof metaValue.split === 'string' ? metaValue.split : null,
      source_ref:
        typeof metaValue.source_ref === 'string' ? metaValue.source_ref : null,
      source: readTextSafe(join(dir, 'source.md')),
      base: isDir(base) ? base : null,
      replay: replayJson.value ?? null,
      variants: subdirs(variantsDir).map((name) => loadVariant(join(variantsDir, name))),
      json_error: meta.error,
      replay_json_error: replayJson.error,
    };
    if (split && record.split !== split) continue;
    cases.push(record);
  }
  return cases;
}

function validateVariant(errors, kase, variant) {
  const at = (msg) => `${kase.id}/${variant.id}: ${msg}`;
  if (variant.json_error) {
    errors.push({
      caseId: kase.id,
      message: at(`variant.json ist kein gueltiges JSON: ${variant.json_error}`),
    });
    return;
  }
  if (!PERSPECTIVES.includes(variant.perspective)) {
    errors.push({
      caseId: kase.id,
      message: at(
        `unbekannte Perspektive ${JSON.stringify(variant.perspective)} ` +
          `(erlaubt: ${PERSPECTIVES.join(', ')})`,
      ),
    });
  }
  if (variant.roles.length === 0) {
    errors.push({ caseId: kase.id, message: at('roles fehlt oder ist leer') });
  } else {
    for (const role of variant.roles) {
      if (!ROLES.includes(role)) {
        errors.push({
          caseId: kase.id,
          message: at(
            `unbekannte Rolle ${JSON.stringify(role)} (erlaubt: ${ROLES.join(', ')})`,
          ),
        });
      }
    }
  }
  const budget = variant.budget;
  if (
    !budget ||
    !(Number(budget.tokens) > 0) ||
    !(Number(budget.turns) > 0)
  ) {
    errors.push({
      caseId: kase.id,
      message: at('budget.tokens und budget.turns muessen positive Zahlen sein'),
    });
  }
  if (!EXPECTED_DECISIONS.includes(variant.expected_decision)) {
    errors.push({
      caseId: kase.id,
      message: at(
        `expected_decision muss "execute" oder "clarify" sein, ` +
          `gefunden: ${JSON.stringify(variant.expected_decision)}`,
      ),
    });
  }
  if (!isFile(variant.briefPath)) {
    errors.push({ caseId: kase.id, message: at('brief.md fehlt') });
  }
  if (!isDir(variant.referenceDir)) {
    errors.push({ caseId: kase.id, message: at('reference/ fehlt') });
  }
  if (!isDir(variant.checksDir)) {
    errors.push({ caseId: kase.id, message: at('checks/ fehlt') });
  } else if (variant.perspective === 'vision' && !hasImageFile(variant.checksDir)) {
    errors.push({
      caseId: kase.id,
      message: at('vision-Variante braucht mindestens eine Bilddatei in checks/'),
    });
  }
}

/**
 * Layout-Pruefung mit sprechenden Fehlern. Sammelt alle Fehler statt beim
 * ersten abzubrechen, damit bench.mjs jede Fall-ID nennen kann.
 */
export function validateCases(casesDir) {
  const errors = [];
  const cases = loadCases(casesDir);

  if (cases.length === 0) {
    errors.push({ caseId: '', message: `keine Faelle unter ${casesDir}` });
  }

  for (const kase of cases) {
    if (kase.json_error) {
      errors.push({
        caseId: kase.id,
        message: `case.json ist kein gueltiges JSON: ${kase.json_error}`,
      });
    }
    if (kase.source === null) {
      errors.push({ caseId: kase.id, message: 'source.md fehlt' });
    } else if (kase.source.trim() === '') {
      errors.push({ caseId: kase.id, message: 'source.md ist leer' });
    }
    if (!SPLITS.includes(kase.split)) {
      errors.push({
        caseId: kase.id,
        message:
          `case.json: split muss "eval" oder "train" sein, ` +
          `gefunden: ${JSON.stringify(kase.split)}`,
      });
    }
    if (!kase.source_ref || String(kase.source_ref).trim() === '') {
      errors.push({
        caseId: kase.id,
        message:
          'case.json: source_ref fehlt (Ticket-ID, Change-Slug oder Commit)',
      });
    }
    if (kase.base && kase.replay) {
      errors.push({
        caseId: kase.id,
        message: 'genau eines von base/ oder replay.json ist erlaubt, gefunden: beide',
      });
    }
    if (!kase.base && !kase.replay) {
      errors.push({
        caseId: kase.id,
        message: 'genau eines von base/ oder replay.json ist erlaubt, gefunden: keines',
      });
    }
    if (kase.replay_json_error) {
      errors.push({
        caseId: kase.id,
        message: `replay.json ist kein gueltiges JSON: ${kase.replay_json_error}`,
      });
    }
    if (kase.replay && typeof kase.replay === 'object') {
      for (const field of ['parent_commit', 'change_path']) {
        if (!kase.replay[field]) {
          errors.push({ caseId: kase.id, message: `replay.json: ${field} fehlt` });
        }
      }
    }
    if (kase.variants.length === 0) {
      errors.push({ caseId: kase.id, message: 'keine Variante unter variants/' });
    }
    for (const variant of kase.variants) {
      validateVariant(errors, kase, variant);
    }
  }

  return { ok: errors.length === 0, errors };
}
