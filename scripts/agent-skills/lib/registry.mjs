// scripts/agent-skills/lib/registry.mjs
// Schema validation of the authoritative skill inventory (docs/agent-guide/registry/skills.yaml).
// Ticket: T900151, Partial p1 (Inventar + Projektions-Engine)

import { isObject, isNonEmptyString, normalizeRelative, isInsideNormalized, resolveFromRoot } from './fsutil.mjs';
import { makeFinding, FATAL_CODES } from './findings.mjs';

export const HARNESS_IDS = ['codex', 'agy', 'opencode', 'claude_code'];
export const ALLOWED_EXPOSURES = new Set(['portable', 'native', 'adapter']);
export const ALLOWED_SYNC = new Set(['identical', 'manual']);

export function hasValidAdapterMaps(maps) {
  return (
    Array.isArray(maps) &&
    maps.length > 0 &&
    maps.every(
      (entry) => isObject(entry) && isNonEmptyString(entry.capability) && isNonEmptyString(entry.runtime_tool),
    )
  );
}

export function validateRegistry(doc, context) {
  const findings = [];
  const fatal = [];
  const push = (finding) => {
    if (FATAL_CODES.has(finding.code)) fatal.push(finding);
    else findings.push(finding);
  };

  const harnesses = [];
  const discoveryRoots = {};
  const ignored = [];
  const ignoredIds = new Set();
  const catalog = [];
  const seenSkillIds = new Set();

  if (!isObject(doc)) {
    push(makeFinding('invalid-schema', { path: context.registryDisplay, message: 'registry document must be a mapping' }));
    return { fatal: true, findings: [...fatal, ...findings], harnesses, catalog, ignored, ignoredIds };
  }

  if (doc.schema_version !== 1 && doc.schema_version !== '1') {
    push(
      makeFinding('invalid-schema', {
        path: context.registryDisplay,
        message: 'schema_version must be 1',
      }),
    );
  }

  if (!isObject(doc.harnesses)) {
    push(makeFinding('invalid-schema', { path: context.registryDisplay, message: 'harnesses must be a mapping' }));
  } else {
    for (const harnessId of Object.keys(doc.harnesses)) {
      if (!HARNESS_IDS.includes(harnessId)) {
        push(makeFinding('unknown-harness', { harness: harnessId, path: context.registryDisplay }));
      }
    }

    for (const harnessId of HARNESS_IDS) {
      const declaration = doc.harnesses[harnessId];
      if (!isObject(declaration)) {
        push(
          makeFinding('invalid-schema', {
            harness: harnessId,
            path: context.registryDisplay,
            message: 'harness declaration must be a mapping',
          }),
        );
        continue;
      }

      const discoveryRoot = normalizeRelative(declaration.discovery_root);
      if (!discoveryRoot) {
        push(
          makeFinding('invalid-schema', {
            harness: harnessId,
            path: context.registryDisplay,
            message: 'discovery_root must be a relative path',
          }),
        );
        continue;
      }

      discoveryRoots[harnessId] = discoveryRoot;
      harnesses.push({
        id: harnessId,
        discovery_root: discoveryRoot,
        root: resolveFromRoot(context.rootAbs, discoveryRoot),
      });
    }
  }

  if (doc.ignore !== undefined) {
    if (!Array.isArray(doc.ignore)) {
      push(makeFinding('invalid-schema', { path: context.registryDisplay, message: 'ignore must be a list' }));
    } else {
      for (const entry of doc.ignore) {
        if (!isObject(entry) || !isNonEmptyString(entry.id)) {
          push(makeFinding('invalid-schema', { path: context.registryDisplay, message: 'ignore entry requires id' }));
          continue;
        }
        const id = entry.id.trim();
        if (ignoredIds.has(id)) {
          push(makeFinding('duplicate-skill-id', { skill: id, path: context.registryDisplay }));
        }
        ignoredIds.add(id);
        if (!isNonEmptyString(entry.rationale)) {
          push(makeFinding('non-rationalized-exception', { skill: id, path: context.registryDisplay }));
        }
        ignored.push({ id, rationale: isNonEmptyString(entry.rationale) ? entry.rationale.trim() : '' });
      }
    }
  }

  if (!Array.isArray(doc.skills)) {
    push(makeFinding('invalid-schema', { path: context.registryDisplay, message: 'skills must be a list' }));
  }

  const skills = Array.isArray(doc.skills) ? doc.skills : [];
  for (const entry of skills) {
    if (!isObject(entry)) {
      push(makeFinding('invalid-schema', { path: context.registryDisplay, message: 'skill entry must be a mapping' }));
      continue;
    }

    const id = isNonEmptyString(entry.id) ? entry.id.trim() : null;
    if (!id) {
      push(makeFinding('invalid-schema', { path: context.registryDisplay, message: 'skill entry requires id' }));
      continue;
    }
    if (seenSkillIds.has(id) || ignoredIds.has(id)) {
      push(makeFinding('duplicate-skill-id', { skill: id, path: context.registryDisplay }));
    }
    seenSkillIds.add(id);

    const provenance = isNonEmptyString(entry.provenance) ? entry.provenance.trim() : null;
    if (!provenance) {
      push(makeFinding('invalid-schema', { skill: id, message: 'provenance must be a non-empty string' }));
    }

    const exposure = isNonEmptyString(entry.exposure) ? entry.exposure.trim() : null;
    if (!exposure || !ALLOWED_EXPOSURES.has(exposure)) {
      push(makeFinding('invalid-exposure', { skill: id, path: context.registryDisplay }));
    }

    const source = normalizeRelative(entry.source);
    if (!source) {
      push(makeFinding('invalid-schema', { skill: id, message: 'source must be a relative path' }));
    }

    const projections = {};
    const exclusions = {};
    let projectionsValid = isObject(entry.harnesses);
    if (!projectionsValid) {
      push(makeFinding('invalid-schema', { skill: id, message: 'harnesses must be a mapping' }));
    } else {
      for (const [harnessId, projection] of Object.entries(entry.harnesses)) {
        if (!HARNESS_IDS.includes(harnessId)) {
          push(makeFinding('unknown-harness', { skill: id, harness: harnessId, path: context.registryDisplay }));
          continue;
        }
        if (!isObject(projection)) {
          push(makeFinding('invalid-schema', { skill: id, harness: harnessId, message: 'projection must be a mapping' }));
          continue;
        }

        const projectionPath = normalizeRelative(projection.path);
        if (!projectionPath) {
          push(makeFinding('invalid-schema', { skill: id, harness: harnessId, message: 'projection path must be relative' }));
          continue;
        }

        const discoveryRoot = discoveryRoots[harnessId];
        if (discoveryRoot && !isInsideNormalized(projectionPath, discoveryRoot)) {
          push(makeFinding('projection-outside-harness-root', { skill: id, harness: harnessId, path: projectionPath }));
        }

        const sync = projection.sync;
        if (!ALLOWED_SYNC.has(sync)) {
          push(makeFinding('invalid-schema', { skill: id, harness: harnessId, message: 'sync must be identical or manual' }));
          continue;
        }

        const rationale = isNonEmptyString(projection.rationale) ? projection.rationale.trim() : '';
        if (sync === 'manual' && !rationale) {
          push(makeFinding('non-rationalized-exception', { skill: id, harness: harnessId, path: projectionPath }));
        }
        if (exposure === 'adapter' && sync === 'manual' && !hasValidAdapterMaps(projection.maps)) {
          push(makeFinding('adapter-mapping-missing', { skill: id, harness: harnessId, path: projectionPath }));
        }

        projections[harnessId] = {
          path: projectionPath,
          sync,
          rationale,
          maps: hasValidAdapterMaps(projection.maps) ? projection.maps : [],
        };
      }
    }

    const exclusionsValid = entry.exclusions === undefined || isObject(entry.exclusions);
    if (!exclusionsValid) {
      push(makeFinding('invalid-schema', { skill: id, message: 'exclusions must be a mapping' }));
    } else if (isObject(entry.exclusions)) {
      for (const [harnessId, rationale] of Object.entries(entry.exclusions)) {
        if (!HARNESS_IDS.includes(harnessId)) {
          push(makeFinding('unknown-harness', { skill: id, harness: harnessId, path: context.registryDisplay }));
          continue;
        }
        if (projections[harnessId]) {
          push(
            makeFinding('invalid-schema', {
              skill: id,
              harness: harnessId,
              message: 'harness cannot be both projected and excluded',
            }),
          );
        }
        if (isNonEmptyString(rationale)) {
          exclusions[harnessId] = rationale.trim();
        } else {
          exclusions[harnessId] = '';
          push(makeFinding('non-rationalized-exception', { skill: id, harness: harnessId, path: context.registryDisplay }));
        }
      }
    }

    if (projectionsValid && exclusionsValid) {
      for (const harnessId of HARNESS_IDS) {
        if (!projections[harnessId] && !Object.prototype.hasOwnProperty.call(exclusions, harnessId)) {
          push(makeFinding('non-rationalized-exception', { skill: id, harness: harnessId, path: context.registryDisplay }));
        }
      }
    }

    catalog.push({
      id,
      provenance: provenance || '',
      exposure: exposure || '',
      source: source || '',
      harnesses: projections,
      exclusions,
    });
  }

  catalog.sort((a, b) => a.id.localeCompare(b.id));
  ignored.sort((a, b) => a.id.localeCompare(b.id));

  return {
    fatal: fatal.length > 0,
    findings: [...fatal, ...findings],
    harnesses,
    catalog,
    ignored,
    ignoredIds,
  };
}