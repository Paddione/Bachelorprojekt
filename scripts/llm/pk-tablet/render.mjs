#!/usr/bin/env node
// scripts/llm/pk-tablet/render.mjs
//
// Render-Stufe fuer PK-Tablet (docs/runbooks/pk-tablet-inference.md): macht
// aus dem Geraete-Loadout die Dateien, die scripts/llm/pk-tablet/apply.sh per
// SSH einspielt. Kein SSH, kein Netz — deshalb ohne Geraet testbar.
//
//   node render.mjs --out <dir> [--loadouts <pfad>] [--models <pfad>]
//
// Ausgabe in <dir>:
//   <slug>.argv   ein llama-server-Argument je Zeile (run-loadout.sh liest sie mit mapfile)
//   enabled.list  aktive Slugs, sortiert
//   ports.list    "<slug> <port>" je aktivem Loadout
//   models.list   "<relpfad> <sha256> <url> <bytes>" je referenziertem Modell
//
// Warum auf dem Dev-Rechner und nicht auf dem Geraet: buildServerArgv() ist
// die eine argv-Konstruktion des Repos (scripts/llm-proxy/runner.mjs). Auf dem
// Tablet laeuft dafuer kein Node — es bekommt nur das Ergebnis.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { isLoadoutEnabled, readLoadouts } from '../../llm-proxy/loadouts.mjs';
import { buildServerArgv } from '../../llm-proxy/runner.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const DEFAULT_LOADOUTS = path.join(REPO_ROOT, 'devmesh/pk-tablet/loadouts.json');
const DEFAULT_MODELS = path.join(REPO_ROOT, 'devmesh/pk-tablet/models.json');

function die(msg) {
  console.error(`render: ${msg}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    loadouts: { type: 'string', default: DEFAULT_LOADOUTS },
    models: { type: 'string', default: DEFAULT_MODELS },
  },
});
if (!values.out) die('--out <dir> fehlt');

let doc;
try {
  ({ doc } = readLoadouts(values.loadouts));
} catch (err) {
  die(err.message);
}
const sources = JSON.parse(readFileSync(values.models, 'utf8'));
const root = doc.modelRoots[0];
const active = doc.loadouts.filter(isLoadoutEnabled).sort((a, b) => a.slug.localeCompare(b.slug));

mkdirSync(values.out, { recursive: true });
const models = new Map();
for (const l of active) {
  const argv = buildServerArgv(l, path.posix.join(root, l.model), doc.defaults);
  // Eine Zeile je Argument: ein Zeilenumbruch IN einem Argument wuerde es auf
  // dem Geraet still in zwei zerlegen.
  const broken = argv.find((a) => a.includes('\n'));
  if (broken !== undefined) die(`${l.slug}: Argument mit Zeilenumbruch: ${JSON.stringify(broken)}`);
  writeFileSync(path.join(values.out, `${l.slug}.argv`), `${argv.join('\n')}\n`);

  const src = sources[l.model];
  if (!src?.url || !/^[0-9a-f]{64}$/.test(src.sha256 ?? '')) {
    die(`${l.slug}: keine Quelle (url + sha256) fuer ${l.model} in ${values.models}`);
  }
  models.set(l.model, src);
}

const lines = (rows) => rows.map((r) => `${r}\n`).join('');
writeFileSync(path.join(values.out, 'enabled.list'), lines(active.map((l) => l.slug)));
writeFileSync(path.join(values.out, 'ports.list'), lines(active.map((l) => `${l.slug} ${l.port}`)));
writeFileSync(path.join(values.out, 'models.list'),
  lines([...models].map(([rel, s]) => `${rel} ${s.sha256} ${s.url} ${s.bytes ?? 0}`)));

console.log(`render: ${active.length} loadouts aktiv: ${active.map((l) => l.slug).join(' ') || '(keine)'}`);
