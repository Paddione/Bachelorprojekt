#!/usr/bin/env node
// scripts/agent-skills/project.mjs
// SSOT: openspec/specs/agent-skills.md — Delta: openspec/changes/portable-agent-skills/
// Ticket: T900151, Partial p1 (Inventar + Projektions-Engine)
//
// Check-only projection validator and deliberate writer for the authoritative
// skill inventory. The registry declares stable skill ids, provenance, exposure,
// canonical source paths, harness projections, and required exception rationales.
// This engine derives the expected four-harness catalog and reports drift without
// silently rewriting a worktree.
//
// Implementation is split into lib/ modules (fsutil, findings, registry, audit);
// this file is the CLI entry point.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse as parseYaml } from 'yaml';
import { isDirectory, isFile, isSymlink, displayPath, toPosix } from './lib/fsutil.mjs';
import { emit, makeFinding } from './lib/findings.mjs';
import { validateRegistry } from './lib/registry.mjs';
import { auditRegistry, planWrites, applyWrites, catalogForOutput } from './lib/audit.mjs';

const USAGE =
  'Usage: node scripts/agent-skills/project.mjs [--root <dir>] [--registry <path>] [--check|--write] [--json]';

const DEFAULT_REGISTRY_REL = 'docs/agent-guide/registry/skills.yaml';

function isCiEnabled() {
  const value = process.env.CI;
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (!normalized) return false;
  return !/^(0|false|no|off)$/i.test(normalized);
}

function parseArgs(argv) {
  const opts = {
    root: process.cwd(),
    registry: DEFAULT_REGISTRY_REL,
    check: false,
    write: false,
    json: false,
    help: false,
  };
  const fatal = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
    if (arg === '--json') {
      opts.json = true;
      continue;
    }
    if (arg === '--check') {
      opts.check = true;
      continue;
    }
    if (arg === '--write') {
      opts.write = true;
      continue;
    }
    if (arg === '--root' || arg === '--registry') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        fatal.push(makeFinding('unknown-option', { path: arg, message: 'missing required value' }));
        break;
      }
      index += 1;
      if (arg === '--root') opts.root = value;
      else opts.registry = value;
      continue;
    }

    fatal.push(makeFinding('unknown-option', { path: arg }));
    break;
  }

  if (fatal.length === 0 && opts.check && opts.write) {
    fatal.push(makeFinding('mode-conflict'));
  }

  return { opts, fatal };
}

function main() {
  const { opts, fatal } = parseArgs(process.argv.slice(2));
  const requestedMode = opts.write ? 'write' : 'check';

  if (opts.help && fatal.length === 0) {
    console.log(USAGE);
    return;
  }

  const rootAbs = path.resolve(opts.root);

  if (fatal.length > 0) {
    emit({
      json: opts.json,
      mode: requestedMode,
      rootAbs,
      registryDisplay: opts.registry,
      findings: fatal,
    });
    return;
  }

  if (!isDirectory(rootAbs)) {
    emit({
      json: opts.json,
      mode: requestedMode,
      rootAbs,
      registryDisplay: opts.registry,
      findings: [makeFinding('root-not-found', { path: toPosix(opts.root) })],
    });
    return;
  }

  const registryAbs = path.resolve(rootAbs, opts.registry);
  const registryDisplay = displayPath(rootAbs, registryAbs);

  if (!isFile(registryAbs)) {
    emit({
      json: opts.json,
      mode: requestedMode,
      rootAbs,
      registryDisplay,
      findings: [makeFinding('registry-not-found', { path: registryDisplay })],
    });
    return;
  }

  if (requestedMode === 'write' && isCiEnabled()) {
    emit({
      json: opts.json,
      mode: requestedMode,
      rootAbs,
      registryDisplay,
      findings: [makeFinding('write-mode-disabled-in-ci', { path: registryDisplay })],
    });
    return;
  }

  let doc;
  try {
    doc = parseYaml(fs.readFileSync(registryAbs, 'utf8'));
  } catch (error) {
    emit({
      json: opts.json,
      mode: requestedMode,
      rootAbs,
      registryDisplay,
      findings: [
        makeFinding('registry-not-found', {
          path: registryDisplay,
          message: error?.message || 'unreadable registry',
        }),
      ],
    });
    return;
  }

  const validated = validateRegistry(doc, { rootAbs, registryDisplay });
  const harnessesForOutput = validated.harnesses.map((harness) => ({
    id: harness.id,
    discovery_root: harness.discovery_root,
    symlinked: isSymlink(harness.root),
  }));

  if (validated.fatal) {
    emit({
      json: opts.json,
      mode: requestedMode,
      rootAbs,
      registryDisplay,
      harnesses: harnessesForOutput,
      catalog: catalogForOutput(validated.catalog),
      ignored: validated.ignored,
      findings: validated.findings,
    });
    return;
  }

  const findings = [...validated.findings];
  let actions = [];

  if (requestedMode === 'write') {
    actions = planWrites({ rootAbs, catalog: validated.catalog }).map((action) => ({
      skill: action.skill,
      harness: action.harness,
      path: action.path,
      source: action.source,
    }));
    applyWrites(planWrites({ rootAbs, catalog: validated.catalog }));
  }

  findings.push(
    ...auditRegistry({
      rootAbs,
      harnesses: validated.harnesses,
      catalog: validated.catalog,
      ignoredIds: validated.ignoredIds,
    }),
  );

  emit({
    json: opts.json,
    mode: requestedMode,
    rootAbs,
    registryDisplay,
    harnesses: harnessesForOutput,
    catalog: catalogForOutput(validated.catalog),
    ignored: validated.ignored,
    findings,
    actions,
  });
}

try {
  main();
} catch (error) {
  emit({
    json: process.argv.includes('--json'),
    mode: process.argv.includes('--write') ? 'write' : 'check',
    rootAbs: path.resolve(process.cwd()),
    registryDisplay: DEFAULT_REGISTRY_REL,
    findings: [
      makeFinding('internal-error', {
        message: error?.stack || error?.message || String(error),
      }),
    ],
  });
}