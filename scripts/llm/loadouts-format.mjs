#!/usr/bin/env node
// scripts/llm/loadouts-format.mjs
//
// T002553 — Haelt scripts/llm/loadouts.json in der kanonischen Form, die
// writeLoadouts() erzeugt. Beide gehen durch serializeLoadouts(); der Guard
// kann daher keine Form verlangen, die das Werkzeug nicht schreibt.
//
//   --check [pfad]   Exit 1 bei Abweichung, nennt die Reparaturanweisung (CI)
//   --write [pfad]   Schreibt die kanonische Form (lokale Reparatur)
//
// Der Pfad ist optional und existiert, damit der Guard gegen manipulierte
// Kopien testbar ist statt nur gegen die ausgelieferte Datei — ein Guard, der
// nur den Gutfall belegen kann, belegt nichts.
//
// Warum ueberhaupt: loadouts.json wird gelegentlich mit fremden JSON-Werkzeugen
// umgeschrieben. Pythons json.dumps escaped Nicht-ASCII (ensure_ascii=True ist
// Default) und schreibt keinen abschliessenden Zeilenumbruch. Beim naechsten
// regulaeren Schreibvorgang normalisiert das die GANZE Datei zurueck — der
// Diff umfasst dann jede Zeile statt der geaenderten. In PR #3640 waren es
// ~360 statt ~15; die inhaltliche Aenderung war darin nicht mehr auffindbar.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseLoadouts, serializeLoadouts, DEFAULT_PATH } from '../llm-proxy/loadouts.mjs';

const REPAIR = 'task llm:loadouts:format';

/**
 * @returns {{ok: boolean, canonical: string, actual: string, findings: string[]}}
 */
export function inspect(path = DEFAULT_PATH) {
  const actual = readFileSync(path, 'utf8');
  const canonical = serializeLoadouts(parseLoadouts(actual));
  const findings = [];

  // Benannte Befunde statt eines blossen "weicht ab". Wer nur liest, dass die
  // Datei nicht kanonisch ist, weiss nicht, welches Werkzeug sie angefasst hat;
  // "escaped Nicht-ASCII" zeigt direkt auf ensure_ascii.
  const escapes = actual.match(/\\u[0-9a-fA-F]{4}/g);
  if (escapes) {
    const uniq = [...new Set(escapes)].sort();
    findings.push(
      `${escapes.length} escapte Nicht-ASCII-Zeichen (${uniq.slice(0, 5).join(' ')}${uniq.length > 5 ? ' …' : ''})` +
      ` — ein JSON-Werkzeug mit ensure_ascii=True hat die Datei geschrieben`,
    );
  }
  if (!actual.endsWith('\n')) {
    findings.push("kein abschliessender Zeilenumbruch — json.dump schreibt keinen, writeLoadouts() schon");
  }
  if (actual !== canonical && findings.length === 0) {
    findings.push('Einrueckung oder Schluesselreihenfolge weicht ab');
  }

  return { ok: actual === canonical, canonical, actual, findings };
}

function main(argv) {
  const write = argv.includes('--write');
  const check = argv.includes('--check');
  if (write === check) {
    console.error('Usage: loadouts-format.mjs (--check | --write) [pfad]');
    return 2;
  }

  const path = argv.find((a) => !a.startsWith('--')) ?? DEFAULT_PATH;
  let r;
  try {
    r = inspect(path);
  } catch (err) {
    // Ein kaputtes Dokument ist kein Formatproblem — die Meldung darf nicht auf
    // `--write` verweisen, das hier gar nichts reparieren koennte.
    console.error(`loadouts-format: ${path} ist nicht lesbar: ${err.message}`);
    return 2;
  }

  if (r.ok) {
    console.log(`loadouts-format: ${path} ist kanonisch`);
    return 0;
  }

  if (write) {
    writeFileSync(path, r.canonical, 'utf8');
    console.log(`loadouts-format: ${path} normalisiert`);
    for (const f of r.findings) console.log(`  - ${f}`);
    return 0;
  }

  console.error(`loadouts-format: ${path} weicht von der kanonischen Form ab`);
  for (const f of r.findings) console.error(`  - ${f}`);
  console.error('');
  console.error(`  Reparatur:  ${REPAIR}   (dann committen)`);
  console.error('  Hintergrund: die Datei gehoert scripts/llm-proxy/loadouts.mjs.');
  console.error('  Sie mit einem anderen JSON-Werkzeug umzuschreiben normalisiert');
  console.error('  beim naechsten regulaeren Schreibvorgang jede Zeile.');
  return 1;
}

if (import.meta.filename === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
