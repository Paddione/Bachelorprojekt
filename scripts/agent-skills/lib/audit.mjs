// scripts/agent-skills/lib/audit.mjs
// Filesystem audit (missing/unexpected/dangling/body-drift/symlink diagnostics) and
// deliberate projection writes for the projection engine.
// Ticket: T900151, Partial p1 (Inventar + Projektions-Engine)

import fs from 'node:fs';
import path from 'node:path';
import {
  isSymlink,
  isDirectory,
  isSkillDir,
  realpathSafe,
  computeDirHash,
  resolveFromRoot,
  GENERATED_METADATA_FILENAMES,
} from './fsutil.mjs';
import { makeFinding } from './findings.mjs';
import { HARNESS_IDS } from './registry.mjs';

function discoverHarness(harness, findings) {
  const discovered = new Map();

  if (isSymlink(harness.root)) {
    findings.push(
      makeFinding('symlinked-harness-root', {
        harness: harness.id,
        path: harness.discovery_root,
      }),
    );
    return discovered;
  }

  if (!isDirectory(harness.root)) return discovered;

  let entries;
  try {
    entries = fs.readdirSync(harness.root, { withFileTypes: true });
  } catch {
    return discovered;
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const childAbs = path.join(harness.root, entry.name);
    if (!isSkillDir(childAbs)) continue;
    discovered.set(entry.name, `${harness.discovery_root}/${entry.name}`);
  }

  return discovered;
}

export function auditRegistry({ rootAbs, harnesses, catalog, ignoredIds }) {
  const findings = [];
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  const discoveredByHarness = new Map();

  for (const harness of harnesses) {
    discoveredByHarness.set(harness.id, discoverHarness(harness, findings));
  }

  for (const skill of catalog) {
    const sourceAbs = resolveFromRoot(rootAbs, skill.source);
    const sourceExists = isSkillDir(sourceAbs);
    if (!sourceExists) {
      findings.push(
        makeFinding('dangling-source', {
          skill: skill.id,
          path: skill.source,
        }),
      );
    }

    for (const harnessId of HARNESS_IDS) {
      const projection = skill.harnesses[harnessId];
      if (!projection) continue;

      const projectionAbs = resolveFromRoot(rootAbs, projection.path);
      if (isSymlink(projectionAbs)) {
        findings.push(
          makeFinding('symlinked-projection', {
            skill: skill.id,
            harness: harnessId,
            path: projection.path,
          }),
        );
      }

      if (!isSkillDir(projectionAbs)) {
        findings.push(
          makeFinding('missing-projection', {
            skill: skill.id,
            harness: harnessId,
            path: projection.path,
          }),
        );
        continue;
      }

      if (projection.sync === 'identical' && sourceExists) {
        const sourceReal = realpathSafe(sourceAbs);
        const projectionReal = realpathSafe(projectionAbs);
        if (sourceReal && projectionReal && sourceReal === projectionReal) continue;
        if (computeDirHash(sourceAbs) !== computeDirHash(projectionAbs)) {
          findings.push(
            makeFinding('body-drift', {
              skill: skill.id,
              harness: harnessId,
              path: projection.path,
            }),
          );
        }
      }
    }
  }

  for (const harness of harnesses) {
    const discovered = discoveredByHarness.get(harness.id) || new Map();
    for (const [skillId, discoveredPath] of discovered) {
      if (ignoredIds.has(skillId)) continue;
      const skill = catalogById.get(skillId);
      if (!skill) {
        findings.push(
          makeFinding('unregistered-skill', {
            skill: skillId,
            harness: harness.id,
            path: discoveredPath,
          }),
        );
        continue;
      }
      if (!skill.harnesses[harness.id]) {
        findings.push(
          makeFinding('unexpected-projection', {
            skill: skillId,
            harness: harness.id,
            path: discoveredPath,
          }),
        );
      }
    }
  }

  return findings;
}

export function planWrites({ rootAbs, catalog }) {
  const actions = [];

  for (const skill of catalog) {
    const sourceAbs = resolveFromRoot(rootAbs, skill.source);
    if (!isSkillDir(sourceAbs)) continue;
    const sourceReal = realpathSafe(sourceAbs);

    for (const harnessId of HARNESS_IDS) {
      const projection = skill.harnesses[harnessId];
      if (!projection || projection.sync !== 'identical') continue;

      const targetAbs = resolveFromRoot(rootAbs, projection.path);
      const targetReal = realpathSafe(targetAbs);
      if (sourceReal && targetReal && sourceReal === targetReal) continue;
      if (fs.existsSync(targetAbs)) continue;

      actions.push({
        skill: skill.id,
        harness: harnessId,
        path: projection.path,
        source: skill.source,
        sourceAbs,
        targetAbs,
      });
    }
  }

  return actions;
}

export function applyWrites(actions) {
  for (const action of actions) {
    fs.mkdirSync(path.dirname(action.targetAbs), { recursive: true });
    fs.cpSync(action.sourceAbs, action.targetAbs, {
      recursive: true,
      dereference: true,
      force: false,
      errorOnExist: false,
      filter: (source) => !GENERATED_METADATA_FILENAMES.has(path.basename(source)),
    });
  }
}

export function catalogForOutput(catalog) {
  return catalog.map((skill) => ({
    id: skill.id,
    provenance: skill.provenance,
    exposure: skill.exposure,
    source: skill.source,
    harnesses: Object.fromEntries(
      Object.entries(skill.harnesses).map(([harnessId, projection]) => [
        harnessId,
        { path: projection.path, sync: projection.sync },
      ]),
    ),
    exclusions: skill.exclusions,
  }));
}