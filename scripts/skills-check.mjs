#!/usr/bin/env node
// scripts/skills-check.mjs
//
// Fail-closed Guard über das Skill-Inventar
// (docs/agent-guide/registry/skills.yaml, SSOT — Plan registry-ssot-gates P3).
//
//   node scripts/skills-check.mjs                    # prüfen (task skills:check)
//   node scripts/skills-check.mjs --emit-map         # Karte schreiben (task skills:map)
//   node scripts/skills-check.mjs --registry <pfad> [--project <pfad> --vendor-lock <pfad>]
//
// Gegenbeleg (eingebunden statt dupliziert): scripts/agent-skills/project.mjs
// --check (Projektions-Engine, Ticket T900151) prüft Soll (skills.yaml) gegen
// Ist (Symlinks je Harness) inkl. `sync: identical`-Gleichheit — dieser Guard
// ruft sie als Subprozess auf und failt mit, statt die Logik zu kopieren.
// Zusätzlich geprüft wird hier nur, was die Engine nicht abdeckt:
//   1. docs/agent-guide/registry/vendor-lock.json existiert und parst
//      (Herkunfts-Lock der `provenance: vendor`-Einträge),
//   2. jeder Registry-Skill hat eine vorhandene `source` (Kanon).
//
// Die Karte docs/agent-guide/maps/skills-map.md wird per --emit-map erzeugt.

import { readFileSync, writeFileSync } from 'node:fs';
import { existsSync, lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REGISTRY = join(REPO, 'docs/agent-guide/registry/skills.yaml');
const DEFAULT_PROJECT = join(REPO, 'scripts/agent-skills/project.mjs');
const DEFAULT_VENDOR_LOCK = join(REPO, 'docs/agent-guide/registry/vendor-lock.json');
const DEFAULT_MAP = join(REPO, 'docs/agent-guide/maps/skills-map.md');

const HARNESS_ORDER = ['codex', 'agy', 'opencode', 'claude_code', 'muse'];

function loadRegistry(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Registry nicht lesbar: ${path}`);
  }
  const doc = parseYaml(text);
  if (!Array.isArray(doc?.skills)) {
    throw new Error(`Registry hat keinen Listen-Schlüssel 'skills': ${path}`);
  }
  return doc;
}

function pathExists(repoRoot, rel) {
  try {
    lstatSync(join(repoRoot, rel));
    return true;
  } catch {
    return false;
  }
}

function check(doc, repoRoot, projectPath, vendorLockPath, registryOverridden) {
  const problems = [];
  const seen = new Set();

  const args = [projectPath, '--check'];
  if (registryOverridden) args.push('--registry', registryOverridden);
  const proj = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (proj.status !== 0) {
    problems.push(
      `Projektions-Engine fehlgeschlagen (scripts/agent-skills/project.mjs --check, Exit ${proj.status}):` +
        `\n${(proj.stderr || proj.stdout || '').split('\n').slice(0, 10).join('\n')}`,
    );
  }

  try {
    JSON.parse(readFileSync(vendorLockPath, 'utf8'));
  } catch {
    problems.push(`vendor-lock nicht lesbar/parst nicht: ${vendorLockPath}`);
  }

  for (const [index, skill] of doc.skills.entries()) {
    const label = skill?.id ?? `Skill #${index + 1}`;
    if (!skill?.id) {
      problems.push(`Skill #${index + 1}: Pflichtfeld 'id' fehlt`);
      continue;
    }
    if (seen.has(skill.id)) {
      problems.push(`${label}: doppelte Skill-ID`);
      continue;
    }
    seen.add(skill.id);
    if (!skill.source) {
      problems.push(`${label}: Pflichtfeld 'source' fehlt`);
    } else if (!pathExists(repoRoot, skill.source)) {
      problems.push(`${label}: kanonische source fehlt im Dateisystem: ${skill.source}`);
    }
    for (const [harness, projEntry] of Object.entries(skill.harnesses ?? {})) {
      if (!projEntry?.path) {
        problems.push(`${label}: harness '${harness}' ohne 'path'`);
      }
    }
    for (const harness of Object.keys(skill.exclusions ?? {})) {
      if (skill.harnesses?.[harness]) {
        problems.push(`${label}: harness '${harness}' zugleich projiziert und exkludiert`);
      }
    }
  }

  return problems;
}

function cell(text) {
  return String(text ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() || '—';
}

function renderMap(doc, registryPath) {
  const rel = (registryPath.startsWith(REPO)
    ? registryPath.slice(REPO.length + 1)
    : registryPath
  ).split(sep).join('/');
  const skills = [...doc.skills].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const lines = [
    '# Skill-Inventar',
    '',
    `<!-- GENERIERT aus ${rel} — nicht von Hand editieren.`,
    '     Neu erzeugen: task skills:map · Prüfen: task skills:check -->',
    '',
    'Autoritativer Skill-Bestand je Harness. `sync: identical` heißt: gleiche Inhalte',
    'wie der Kanon; `manual` heißt: Harness-Adapter mit eigenem Mapping.',
    'Projektions-Engine: `scripts/agent-skills/project.mjs --check`.',
    '',
    '| Skill | Kanon | ' + HARNESS_ORDER.map((h) => `\`${h}\``).join(' | ') + ' |',
    '|' + '---|'.repeat(2 + HARNESS_ORDER.length),
  ];
  for (const skill of skills) {
    const cells = [`\`${cell(skill.id)}\``, `\`${cell(skill.source)}\``];
    for (const harness of HARNESS_ORDER) {
      const projEntry = skill.harnesses?.[harness];
      const excl = skill.exclusions?.[harness];
      if (projEntry) {
        cells.push(projEntry.sync === 'manual' ? 'manuell' : 'identisch');
      } else if (excl) {
        cells.push('ausgenommen');
      } else {
        cells.push('—');
      }
    }
    lines.push(`| ${cells.join(' | ')} |`);
  }
  const manuals = skills.filter((s) =>
    Object.values(s.harnesses ?? {}).some((p) => p?.sync === 'manual'),
  );
  if (manuals.length > 0) {
    lines.push('', '## Manuelle Adapter (sync: manual)', '');
    for (const skill of manuals) {
      const maps = [];
      for (const [harness, projEntry] of Object.entries(skill.harnesses)) {
        if (projEntry?.sync === 'manual') {
          maps.push(`${harness}: ${(projEntry.maps ?? []).map((m) => `\`${m.runtime_tool}\``).join(', ')}`);
        }
      }
      lines.push(`- \`${cell(skill.id)}\` — ${cell(skill.harnesses?.[HARNESS_ORDER[2]]?.rationale ?? '')} (${maps.join('; ')})`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function flagValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const value = argv[i + 1];
  if (!value) {
    console.error(`skills-check: ${flag} braucht einen Pfad`);
    process.exit(2);
  }
  return value;
}

function main(argv) {
  const emitMap = argv.includes('--emit-map');
  const registryPath = flagValue(argv, '--registry') ?? DEFAULT_REGISTRY;
  const projectPath = flagValue(argv, '--project') ?? DEFAULT_PROJECT;
  const vendorLockPath = flagValue(argv, '--vendor-lock') ?? DEFAULT_VENDOR_LOCK;
  const repoRoot = dirname(registryPath).split(`${sep}docs${sep}`)[0] || REPO;

  let doc;
  try {
    doc = loadRegistry(registryPath);
  } catch (error) {
    console.error(`skills-check: ${error.message}`);
    return 2;
  }

  if (emitMap) {
    for (const [index, skill] of doc.skills.entries()) {
      if (!skill?.id) {
        console.error(`skills-check: Skill #${index + 1}: Pflichtfeld 'id' fehlt`);
        return 1;
      }
    }
    writeFileSync(DEFAULT_MAP, renderMap(doc, registryPath), 'utf8');
    console.log(`skills-check: Karte geschrieben — ${DEFAULT_MAP}`);
    return 0;
  }

  const problems = check(doc, REPO, projectPath, vendorLockPath, flagValue(argv, '--registry'));
  if (problems.length > 0) {
    console.error(`skills-check: ${problems.length} Verstoß/Verstöße`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    return 1;
  }

  console.log(`skills-check: OK — ${doc.skills.length} Skills, Projektion + vendor-lock valide`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
