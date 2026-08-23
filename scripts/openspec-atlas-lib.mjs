#!/usr/bin/env node
// scripts/openspec-atlas-lib.mjs — Spec Atlas Generator [T015012]
//
// Erzeugt docs/spec-atlas.md aus vier mechanischen Quellen:
//   openspec/specs/*.md            Requirements/Szenarien/Zahlen je Slug
//   openspec/component-map.yaml    Reverse-Mapping Slug -> Code-Pfade
//   openspec/changes/archive/*     Provenance (.ticket + Delta-Specs)
//   openspec/changes/*/            In-Flight-Deltas aktiver Changes
//
// D2 (design.md): Die Delta-Grammatik wird NICHT kopiert — parseDelta kommt
// aus scripts/openspec-merge.mjs. Drift zwischen Merge-Tool und Atlas ist
// damit konstruktiv ausgeschlossen.
//
// Determinismus (Freshness-Anforderung, Taskfile.yml Phase-0-Kommentar):
// keine Wall-Clock-Zeit im Output; Touch-Daten stammen ausschliesslich aus
// den Datumspraefixen der Archiv-Verzeichnisnamen. Zwei Laeufe auf identischem
// Baum erzeugen byteidentische Ausgabe.

import { parseDelta } from './openspec-merge.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Delta-Einträge in kanonischer Form — Paritätsanker für Suite B. */
export function extractDeltaEntries(text) {
  return parseDelta(text).map(({ op, name }) => ({ op, name }));
}

/** SSOT-Spec parsen: Purpose-Prosa, Requirement-Namen, Szenario-Zahl, Zeilen. */
export function parseSpecFile(content) {
  const lines = content.split('\n');
  const purpose = [];
  const requirements = [];
  let inPurpose = false;
  let scenarioCount = 0;
  for (const line of lines) {
    if (/^## Purpose\s*$/.test(line)) { inPurpose = true; continue; }
    if (inPurpose && /^## /.test(line)) {
      inPurpose = false;
    } else if (inPurpose && line.trim() && !/^---\s*$/.test(line)) {
      purpose.push(line.trim());
    }
    const r = line.match(/^### Requirement: (.+?)\s*$/);
    if (r) requirements.push(r[1].trim());
    if (/^#### Scenario:/.test(line)) scenarioCount += 1;
  }
  return {
    purpose: purpose.join(' ').slice(0, 200),
    requirements,
    scenarioCount,
    lineCount: lines.length,
  };
}

/**
 * Minimale YAML-Subset-Parser für die Gruppen-Config:
 *   groups:
 *     <gruppenname>:
 *       - <spec-slug>
 * Reihenfolge im File = Reihenfolge im Artefakt.
 */
export function loadGroups(yamlPath) {
  const groups = [];
  if (!fs.existsSync(yamlPath)) return groups;
  let current = null;
  for (const raw of fs.readFileSync(yamlPath, 'utf8').split('\n')) {
    if (/^\s*#/.test(raw) || !raw.trim()) continue;
    const g = raw.match(/^  (\S+):\s*$/);
    if (g) { current = { name: g[1], slugs: [] }; groups.push(current); continue; }
    const s = raw.match(/^    - (\S+)\s*$/);
    if (s && current) current.slugs.push(s[1]);
  }
  return groups;
}

/** component-map.yaml: Reverse-Mapping spec-slug -> [code-prefixes]. */
export function loadComponentMap(yamlPath) {
  const map = new Map();
  if (!fs.existsSync(yamlPath)) return map;
  let prefix = null;
  for (const raw of fs.readFileSync(yamlPath, 'utf8').split('\n')) {
    const p = raw.match(/^\s*-\s+prefix:\s*(\S+)/);
    if (p) { prefix = p[1]; continue; }
    const s = raw.match(/^\s+spec:\s*(\S+)/);
    if (s && prefix) {
      if (!map.has(s[1])) map.set(s[1], []);
      map.get(s[1]).push(prefix);
      prefix = null;
    }
  }
  return map;
}

/**
 * Delta-Scans über Change-Verzeichnisse (Archive UND aktiv).
 * Fail-open [T015012]: fehlendes/leeres .ticket => kein Provenance-Eintrag,
 * kein Fehler. Datum = Datumspräfix des Verzeichnisses, sonst "active".
 */
export function scanChangeDeltas(changesDir, { skipArchive = true } = {}) {
  const touches = [];
  if (!fs.existsSync(changesDir)) return touches;
  const entries = fs.readdirSync(changesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !(skipArchive && name === 'archive'))
    .sort(); // lexikografisch = chronologisch dank ISO-Datumspräfix
  for (const name of entries) {
    const dir = path.join(changesDir, name);
    let ticket = null;
    const ticketPath = path.join(dir, '.ticket');
    if (fs.existsSync(ticketPath)) {
      const t = fs.readFileSync(ticketPath, 'utf8').trim();
      if (t) ticket = t;
    }
    const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-/);
    const date = dateMatch ? dateMatch[1] : 'active';
    const specsDir = path.join(dir, 'specs');
    if (!fs.existsSync(specsDir)) continue;
    for (const f of fs.readdirSync(specsDir).sort()) {
      if (!f.endsWith('.md')) continue;
      const parentSlug = f.replace(/\.md$/, '');
      for (const entry of extractDeltaEntries(fs.readFileSync(path.join(specsDir, f), 'utf8'))) {
        touches.push({ dirName: name, parentSlug, ticket, date, ...entry });
      }
    }
  }
  return touches;
}

function buildAtlas({ specsDir, componentMapPath, archiveDir, changesDir, groupsPath }) {
  const groups = loadGroups(groupsPath);
  const codePaths = loadComponentMap(componentMapPath);

  const slugs = fs.existsSync(specsDir)
    ? fs.readdirSync(specsDir).filter((f) => f.endsWith('.md')).sort()
    : [];

  const specs = new Map();
  let totalReqs = 0;
  let totalScenarios = 0;
  for (const f of slugs) {
    const slug = f.replace(/\.md$/, '');
    const parsed = parseSpecFile(fs.readFileSync(path.join(specsDir, f), 'utf8'));
    specs.set(slug, parsed);
    totalReqs += parsed.requirements.length;
    totalScenarios += parsed.scenarioCount;
  }

  // Provenance: letzter Touch gewinnt (größter Verzeichnisname = neuestes Datum).
  const lastTouch = new Map();
  for (const t of scanChangeDeltas(archiveDir, { skipArchive: false })) {
    const key = `${t.parentSlug}\u0000${t.name}`;
    lastTouch.set(key, t);
  }

  // In-Flight: aktive Changes, alle Touches (kein "Gewinner" — Warnung je Fall).
  const inflight = scanChangeDeltas(changesDir, { skipArchive: true });

  const groupedSlugs = new Set(groups.flatMap((g) => g.slugs));
  const ungrouped = slugs.map((f) => f.replace(/\.md$/, '')).filter((s) => !groupedSlugs.has(s));

  const out = [];
  out.push('# Spec Atlas');
  out.push('');
  out.push(`<!-- generiert von scripts/openspec-atlas.sh [T015012] — nicht handeditieren -->`);
  out.push('');
  out.push(`Specs: ${specs.size} · Requirements: ${totalReqs} · Scenarios: ${totalScenarios}`);
  out.push('');

  const emitSlug = (slug) => {
    const s = specs.get(slug);
    if (!s) return;
    out.push(`### ${slug}`);
    out.push(`Reqs: ${s.requirements.length} · Scenarios: ${s.scenarioCount} · Lines: ${s.lineCount}`);
    const paths = codePaths.get(slug) ?? [];
    if (paths.length) out.push(`Paths: ${paths.join(', ')}`);
    const touches = [...lastTouch.values()]
      .filter((t) => t.parentSlug === slug && t.ticket)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 5);
    if (touches.length) {
      out.push('Last touches:');
      for (const t of touches) out.push(`  - ${t.name} | ${t.ticket} | ${t.date} | ${t.op}`);
    }
    const flying = inflight.filter((t) => t.parentSlug === slug);
    if (flying.length) {
      out.push('In-flight:');
      for (const t of flying) out.push(`  - ${t.name} | ${t.ticket ?? '?'} | active | ${t.op}`);
    }
    out.push('');
  };

  for (const g of groups) {
    out.push(`## ${g.name}`);
    out.push('');
    for (const slug of g.slugs.sort()) emitSlug(slug);
  }
  if (ungrouped.length) {
    out.push('## Ungrouped');
    out.push('');
    for (const slug of ungrouped) emitSlug(slug);
  }
  return `${out.join('\n').replace(/\n+$/, '\n')}`;
}

function main(argv) {
  let outPath = null;
  let root = process.env.OPENSPEC_ROOT ?? null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') outPath = argv[++i];
    else if (argv[i] === '--root') root = argv[++i];
  }
  if (!root) {
    // REPO-Anker vom cwd (Muster T001997) — nicht vom Skriptpfad.
    root = `${execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()}/openspec`;
  }
  const repo = path.dirname(root);
  const content = buildAtlas({
    specsDir: path.join(root, 'specs'),
    componentMapPath: path.join(root, 'component-map.yaml'),
    archiveDir: path.join(root, 'changes', 'archive'),
    changesDir: path.join(root, 'changes'),
    groupsPath: path.join(repo, 'scripts', 'openspec-atlas-groups.yaml'),
  });
  const target = outPath ?? path.join(repo, 'docs', 'spec-atlas.md');
  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === content) {
    process.stdout.write(`atlas: unchanged ${target}\n`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  process.stdout.write(`atlas: wrote ${target} (${content.split('\n').length} lines)\n`);
}

// CLI-Einstieg nur bei direktem Aufruf (Muster openspec-merge.mjs) — Import
// der lib (z.B. aus Tests) bleibt seiteneffektfrei.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
