#!/usr/bin/env node
// scripts/secrets-check.mjs
//
// Fail-closed Guard über die Secrets-Seal-Kette
// (docs/agent-guide/registry/secrets.yaml, SSOT — Plan registry-ssot-gates P1).
//
//   node scripts/secrets-check.mjs                    # prüfen (task secrets:check)
//   node scripts/secrets-check.mjs --emit-map         # Karte schreiben (task secrets:map)
//   node scripts/secrets-check.mjs --registry <pfad> --schema <pfad> --sealed-dir <dir>
//
// Es werden nur Schlüssel-NAMEN gelesen — niemals Werte. environments/.secrets/*.yaml
// (git-crypt) wird bewusst NICHT angerührt; sealed-secrets/*.yaml enthalten nur
// Ciphertext, deren encryptedData-Keys stehen ohnehin im Klartext im Repo.
//
// Geprüft wird:
//   1. jede Registry-Key ist in schema.yaml (env_vars/secrets/setup_vars) bekannt
//      ODER als scope:external mit schema:false + note kuratiert,
//   2. jeder versiegelte Key (encryptedData-Name in sealed-secrets/*.yaml) hat
//      einen Registry-Eintrag (unbekannter/fehlender Key → Exit ≠ 0),
//   3. jedes in `sealed_in` genannte Manifest enthält den Key wirklich
//      (stale Referenz → Exit ≠ 0),
//   4. jeder Key ist eindeutig.
//
// Gegenbeleg (eingebunden statt dupliziert): task env:validate
// (taskfiles/Taskfile.platform.yml:253) prüft Env-Konfig gegen schema.yaml;
// dieser Guard prüft die Kette schema.yaml <-> sealed-secrets <-> Registry.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, parseAllDocuments } from 'yaml';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REGISTRY = join(REPO, 'docs/agent-guide/registry/secrets.yaml');
const DEFAULT_SCHEMA = join(REPO, 'environments/schema.yaml');
const DEFAULT_SEALED_DIR = join(REPO, 'environments/sealed-secrets');
const DEFAULT_MAP = join(REPO, 'docs/agent-guide/maps/secrets-map.md');

// ── Quellen laden (Namen only) ──────────────────────────────────────────────

function loadSchemaNames(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Schema nicht lesbar: ${path}`);
  }
  const doc = parseYaml(text);
  const names = new Set();
  for (const section of ['env_vars', 'secrets', 'setup_vars']) {
    const list = doc?.[section];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (entry?.name) names.add(entry.name);
    }
  }
  return names;
}

function loadRegistry(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Registry nicht lesbar: ${path}`);
  }
  const doc = parseYaml(text);
  const list = doc?.secrets;
  if (!Array.isArray(list)) {
    throw new Error(`Registry hat keinen Listen-Schlüssel 'secrets': ${path}`);
  }
  return list;
}

/** Map: key -> [dateiname, ...] (nur Namen, keine Werte). */
function loadSealedKeys(dir) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.yaml'));
  } catch {
    throw new Error(`Sealed-Verzeichnis nicht lesbar: ${dir}`);
  }
  const byKey = new Map();
  for (const file of files) {
    const docs = parseAllDocuments(readFileSync(join(dir, file), 'utf8'))
      .map((d) => d.toJS())
      .filter(Boolean);
    for (const doc of docs) {
      for (const key of Object.keys(doc?.spec?.encryptedData ?? {})) {
        if (!byKey.has(key)) byKey.set(key, []);
        if (!byKey.get(key).includes(file)) byKey.get(key).push(file);
      }
    }
  }
  return byKey;
}

// ── Prüfung ─────────────────────────────────────────────────────────────────

function check(entries, schemaNames, sealedKeys) {
  const problems = [];
  const seen = new Set();
  const registryKeys = new Set();

  for (const [index, entry] of entries.entries()) {
    const label = entry?.key ?? `Eintrag #${index + 1}`;
    if (!entry?.key) {
      problems.push(`Eintrag #${index + 1}: Pflichtfeld 'key' fehlt`);
      continue;
    }
    if (seen.has(entry.key)) {
      problems.push(`${label}: doppelte Registry-Key '${entry.key}'`);
      continue;
    }
    seen.add(entry.key);
    registryKeys.add(entry.key);

    for (const field of ['scope', 'consumer']) {
      if (entry?.[field] === undefined || entry[field] === null || entry[field] === '') {
        problems.push(`${label}: Pflichtfeld '${field}' fehlt`);
      }
    }
    if (!Array.isArray(entry?.sealed_in)) {
      problems.push(`${label}: Pflichtfeld 'sealed_in' fehlt (leere Liste [] wenn nicht versiegelt)`);
      continue;
    }

    const inSchema = schemaNames.has(entry.key);
    if (entry.schema === false || entry.scope === 'external') {
      if (entry.schema !== false) {
        problems.push(`${label}: scope 'external' braucht schema:false`);
      }
      if (!entry.note) {
        problems.push(`${label}: externer Key ohne schema.yaml braucht 'note' (Drift-Begründung)`);
      }
    } else if (!inSchema) {
      problems.push(`${label}: weder in schema.yaml noch als external kuratiert`);
    }

    for (const file of entry.sealed_in) {
      const holders = sealedKeys.get(entry.key) ?? [];
      if (!holders.includes(file)) {
        problems.push(`${label}: sealed_in nennt '${file}', das den Key nicht enthält`);
      }
    }
  }

  for (const [key, files] of sealedKeys) {
    if (!registryKeys.has(key)) {
      problems.push(
        `unbekannter versiegelter Key '${key}' (in ${files.join(', ')}) ohne Registry-Eintrag`,
      );
    }
  }

  return problems;
}

// ── Karte ───────────────────────────────────────────────────────────────────

function cell(text) {
  return String(text ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() || '—';
}

function renderMap(entries, registryPath) {
  const rel = (registryPath.startsWith(REPO)
    ? registryPath.slice(REPO.length + 1)
    : registryPath
  ).split(sep).join('/');
  const sorted = [...entries].sort((a, b) => String(a.key).localeCompare(String(b.key)));
  const lines = [
    '# Secrets-Seal-Kette',
    '',
    `<!-- GENERIERT aus ${rel} — nicht von Hand editieren.`,
    '     Neu erzeugen: task secrets:map · Prüfen: task secrets:check -->',
    '',
    'Jeder Schlüssel-Name mit Sealed-Quelle und Consumer. Nur Namen — Werte liegen',
    'nie im Repo (git-crypt `environments/.secrets/`, versiegelt `sealed-secrets/`).',
    'Bestehender Env-Check: `task env:validate` (Taskfile.platform.yml:253).',
    '',
    '| Key | Scope | Schema | Versiegelt in | Consumer |',
    '|---|---|---|---|---|',
  ];
  for (const entry of sorted) {
    lines.push(
      `| \`${cell(entry.key)}\` | ${cell(entry.scope)} | ` +
        `${entry.schema === false ? 'extern' : 'ja'} | ` +
        `${(entry.sealed_in ?? []).map((f) => `\`${cell(f)}\``).join(', ') || '—'} | ` +
        `${cell(entry.consumer)} |`,
    );
  }
  const externals = sorted.filter((e) => e.schema === false);
  if (externals.length > 0) {
    lines.push('', '## Externe Keys (nicht in schema.yaml)', '');
    for (const entry of externals) {
      lines.push(`- \`${cell(entry.key)}\` — ${cell(entry.note)}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// ── Einstieg ────────────────────────────────────────────────────────────────

function flagValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const value = argv[i + 1];
  if (!value) {
    console.error(`secrets-check: ${flag} braucht einen Pfad`);
    process.exit(2);
  }
  return value;
}

function main(argv) {
  const emitMap = argv.includes('--emit-map');
  const registryPath = flagValue(argv, '--registry') ?? DEFAULT_REGISTRY;
  const schemaPath = flagValue(argv, '--schema') ?? DEFAULT_SCHEMA;
  const sealedDir = flagValue(argv, '--sealed-dir') ?? DEFAULT_SEALED_DIR;

  let entries;
  let schemaNames;
  let sealedKeys;
  try {
    entries = loadRegistry(registryPath);
    schemaNames = loadSchemaNames(schemaPath);
    sealedKeys = loadSealedKeys(sealedDir);
  } catch (error) {
    console.error(`secrets-check: ${error.message}`);
    return 2;
  }

  const problems = check(entries, schemaNames, sealedKeys);
  if (problems.length > 0) {
    console.error(`secrets-check: ${problems.length} Verstoß/Verstöße`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    return 1;
  }

  if (emitMap) {
    writeFileSync(DEFAULT_MAP, renderMap(entries, registryPath), 'utf8');
    console.log(`secrets-check: Karte geschrieben — ${DEFAULT_MAP}`);
    return 0;
  }

  console.log(
    `secrets-check: OK — ${entries.length} Keys, ${sealedKeys.size} versiegelte Namen abgedeckt`,
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
