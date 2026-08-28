#!/usr/bin/env node
// scripts/networks-check.mjs
//
// Fail-closed Guard über den Netzwerk-Adressplan
// (docs/agent-guide/registry/networks.yaml, SSOT — Ticket T012645).
//
//   node scripts/networks-check.mjs                    # prüfen (task networks:check)
//   node scripts/networks-check.mjs --emit-map         # Karte schreiben (task networks:map)
//   node scripts/networks-check.mjs --registry <pfad>  # gegen eine Fixture laufen
//
// Geprüft wird:
//   1. jeder cidr ist gültige Notation UND normalisiert (Hostbits = 0),
//   2. jede id ist eindeutig,
//   3. jedes überschneidende Paar ist von BEIDEN Seiten unter overlaps erklärt,
//   4. jeder overlaps-Eintrag zeigt auf eine bekannte id UND überschneidet
//      tatsächlich.
//
// Punkt 4 ist der Grund, warum overlaps keine Blanko-Ausnahme ist: ohne die
// Gegenprobe könnte jemand vorsorglich alles mit allem verknüpfen und damit eine
// spätere, echte Kollision unsichtbar machen.
//
// Verglichen werden Netz-Unter- und -Obergrenze als Ganzzahlen, nicht als Text.
// 10.0.0.0/8 und 10.42.5.0/24 haben kein gemeinsames Textpräfix, überschneiden
// sich aber vollständig — ein grep fände das nicht.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REGISTRY = join(REPO, 'docs/agent-guide/registry/networks.yaml');
const DEFAULT_MAP = join(REPO, 'docs/agent-guide/maps/networks-map.md');

// ── CIDR-Arithmetik ─────────────────────────────────────────────────────────

/** Dotted quad -> unsigned 32-bit, oder null wenn keine gültige IPv4. */
function ipToInt(text) {
  const parts = String(text).split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/**
 * "10.42.0.0/16" -> { first, last, prefix } als Ganzzahlen.
 * Wirft mit sprechender Meldung, wenn die Notation ungültig ist oder Hostbits
 * gesetzt sind (10.42.5.7/24 ist keine Netzadresse).
 */
function parseCidr(text) {
  const raw = String(text ?? '');
  const [address, prefixText, ...rest] = raw.split('/');
  if (rest.length > 0 || prefixText === undefined) {
    throw new Error(`ungültige CIDR-Notation: ${raw}`);
  }
  if (!/^\d{1,2}$/.test(prefixText)) {
    throw new Error(`ungültige Präfixlänge: ${raw}`);
  }
  const prefix = Number(prefixText);
  if (prefix > 32) throw new Error(`Präfixlänge über 32: ${raw}`);
  const base = ipToInt(address);
  if (base === null) throw new Error(`ungültige IPv4-Adresse: ${raw}`);

  const size = 2 ** (32 - prefix);
  const first = Math.floor(base / size) * size;
  if (first !== base) {
    throw new Error(
      `nicht normalisiert: ${raw} — Hostbits sind gesetzt, gemeint ist vermutlich ` +
        `${intToIp(first)}/${prefix}`,
    );
  }
  return { first, last: first + size - 1, prefix };
}

function intToIp(value) {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}

function rangesOverlap(a, b) {
  return a.first <= b.last && b.first <= a.last;
}

// ── Registry laden und prüfen ───────────────────────────────────────────────

function loadRegistry(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Registry nicht lesbar: ${path}`);
  }
  const doc = parseYaml(text);
  const list = doc?.networks;
  if (!Array.isArray(list)) {
    throw new Error(`Registry hat keinen Listen-Schlüssel 'networks': ${path}`);
  }
  return list;
}

const REQUIRED_FIELDS = ['id', 'cidr', 'owner', 'purpose', 'status', 'source'];
const ALLOWED_STATUS = new Set(['active', 'retired']);

function check(entries) {
  const problems = [];
  const parsed = new Map();
  const seen = new Map();

  for (const [index, entry] of entries.entries()) {
    const label = entry?.id ?? `Eintrag #${index + 1}`;

    for (const field of REQUIRED_FIELDS) {
      if (entry?.[field] === undefined || entry[field] === null || entry[field] === '') {
        problems.push(`${label}: Pflichtfeld '${field}' fehlt`);
      }
    }
    if (entry?.status !== undefined && !ALLOWED_STATUS.has(entry.status)) {
      problems.push(
        `${label}: status '${entry.status}' ist weder 'active' noch 'retired'`,
      );
    }
    if (entry?.id !== undefined) {
      if (seen.has(entry.id)) {
        problems.push(
          `${label}: doppelte id '${entry.id}' (bereits als Eintrag #${seen.get(entry.id) + 1})`,
        );
      } else {
        seen.set(entry.id, index);
      }
    }
    if (entry?.cidr !== undefined) {
      try {
        parsed.set(index, parseCidr(entry.cidr));
      } catch (error) {
        problems.push(`${label}: ${error.message}`);
      }
    }
  }

  // Jedes Paar numerisch prüfen. Der erste Index gewinnt bei doppelter id —
  // eine doppelte id ist bereits als eigener Fehler gemeldet.
  const declared = new Set();
  for (const [index, entry] of entries.entries()) {
    for (const rule of entry?.overlaps ?? []) {
      declared.add(`${index}\u0000${rule?.with}`);
      if (!seen.has(rule?.with)) {
        problems.push(
          `${entry?.id}: overlaps verweist auf unbekannte id '${rule?.with}'`,
        );
        continue;
      }
      if (rule?.with === entry?.id) {
        problems.push(`${entry?.id}: overlaps verweist auf sich selbst`);
        continue;
      }
      for (const field of ['reason', 'mitigation']) {
        if (!rule?.[field]) {
          problems.push(
            `${entry?.id}: overlaps mit '${rule?.with}' ohne '${field}'`,
          );
        }
      }
      const otherIndex = seen.get(rule.with);
      const mine = parsed.get(index);
      const other = parsed.get(otherIndex);
      if (mine && other && !rangesOverlap(mine, other)) {
        problems.push(
          `${entry?.id}: overlaps mit '${rule.with}' erklärt eine Überschneidung, ` +
            `die es nicht gibt (${entry?.cidr} und ${entries[otherIndex]?.cidr} sind disjunkt)`,
        );
      }
    }
  }

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = parsed.get(i);
      const b = parsed.get(j);
      if (!a || !b || !rangesOverlap(a, b)) continue;
      const idA = entries[i]?.id;
      const idB = entries[j]?.id;
      if (!declared.has(`${i}\u0000${idB}`)) {
        problems.push(
          `unerklärte Überschneidung: '${idA}' (${entries[i]?.cidr}) mit ` +
            `'${idB}' (${entries[j]?.cidr}) — '${idA}' nennt '${idB}' nicht unter overlaps`,
        );
      }
      if (!declared.has(`${j}\u0000${idA}`)) {
        problems.push(
          `unerklärte Überschneidung: '${idB}' (${entries[j]?.cidr}) mit ` +
            `'${idA}' (${entries[i]?.cidr}) — '${idB}' nennt '${idA}' nicht unter overlaps`,
        );
      }
    }
  }

  return problems;
}

// ── Karte ───────────────────────────────────────────────────────────────────

function cell(text) {
  return String(text ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

function renderMap(entries, registryPath) {
  // [T016596] Der relative Pfad entsteht hier per slice() auf dem absoluten
  // Pfad und erbt dessen Trenner — unter Windows also Backslashes, die sonst
  // im Kartenkopf des committeten Artefakts landen.
  const rel = (registryPath.startsWith(REPO)
    ? registryPath.slice(REPO.length + 1)
    : registryPath).split(sep).join('/');
  const sorted = [...entries].sort((a, b) => {
    const pa = (() => {
      try {
        return parseCidr(a.cidr).first;
      } catch {
        return Number.MAX_SAFE_INTEGER;
      }
    })();
    const pb = (() => {
      try {
        return parseCidr(b.cidr).first;
      } catch {
        return Number.MAX_SAFE_INTEGER;
      }
    })();
    return pa - pb;
  });

  const lines = [
    '# Netzwerk-Adressplan',
    '',
    `<!-- GENERIERT aus ${rel} — nicht von Hand editieren.`,
    '     Neu erzeugen: task networks:map · Prüfen: task networks:check -->',
    '',
    'Jeder IP-Bereich des Projekts, nach Adresse sortiert. Eine Überschneidung ist',
    'nicht verboten, aber erklärungspflichtig: der Guard verlangt, dass beide',
    'beteiligten Bereiche einander nennen, mit Grund und Absicherung.',
    '',
    '| Bereich | Eigentümer | Zweck | Status | Konfiguriert in |',
    '|---|---|---|---|---|',
  ];
  for (const entry of sorted) {
    lines.push(
      `| \`${cell(entry.cidr)}\` | ${cell(entry.owner)} | ${cell(entry.purpose)} ` +
        `| ${cell(entry.status)} | ${cell(entry.source)} |`,
    );
  }

  const withOverlaps = sorted.filter((entry) => (entry.overlaps ?? []).length > 0);
  if (withOverlaps.length > 0) {
    lines.push('', '## Erklärte Überschneidungen', '');
    lines.push('| Bereich | überschneidet | Grund | Absicherung |');
    lines.push('|---|---|---|---|');
    for (const entry of withOverlaps) {
      for (const rule of entry.overlaps) {
        lines.push(
          `| \`${cell(entry.id)}\` | \`${cell(rule.with)}\` | ${cell(rule.reason)} ` +
            `| ${cell(rule.mitigation)} |`,
        );
      }
    }
  }

  const notes = sorted.filter((entry) => entry.notes);
  if (notes.length > 0) {
    lines.push('', '## Anmerkungen', '');
    for (const entry of notes) {
      lines.push(`- **\`${cell(entry.id)}\`** — ${cell(entry.notes)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ── Einstieg ────────────────────────────────────────────────────────────────

function main(argv) {
  const emitMap = argv.includes('--emit-map');
  const registryFlag = argv.indexOf('--registry');
  const registryPath =
    registryFlag === -1 ? DEFAULT_REGISTRY : argv[registryFlag + 1];
  if (registryFlag !== -1 && !registryPath) {
    console.error('networks-check: --registry braucht einen Pfad');
    return 2;
  }

  let entries;
  try {
    entries = loadRegistry(registryPath);
  } catch (error) {
    console.error(`networks-check: ${error.message}`);
    return 2;
  }

  const problems = check(entries);
  if (problems.length > 0) {
    console.error(`networks-check: ${problems.length} Verstoß/Verstöße in ${registryPath}`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    console.error('');
    console.error('  Eine Überschneidung ist nicht verboten — sie muss von BEIDEN Seiten');
    console.error('  unter overlaps erklärt werden (with, reason, mitigation).');
    return 1;
  }

  if (emitMap) {
    const outPath = DEFAULT_MAP;
    writeFileSync(outPath, renderMap(entries, registryPath), 'utf8');
    console.log(`networks-check: Karte geschrieben — ${outPath}`);
    return 0;
  }

  console.log(
    `networks-check: OK — ${entries.length} Bereiche, keine unerklärte Überschneidung`,
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
