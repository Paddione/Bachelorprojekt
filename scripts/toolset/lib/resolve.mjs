// scripts/toolset/lib/resolve.mjs — Harness-Schema und Werkzeugsatz (T900791).
// WILDCARD_ROLES: SSOT lib/roles.mjs (T900980), hier re-exportiert für bestehende Importe.
import { WILDCARD_ROLES } from './roles.mjs';
export { WILDCARD_ROLES };

// Validiert den `harnesses`-Block der Registry.
// @param harnesses Objekt aus loadRegistry (Name → Harness-Eintrag)
// @param forbiddenProviders Array verbotener Anbieter-Namen
// @param validRoles Set oder Array gültiger Rollen-Namen
// @returns Array von Fehlermeldungen (leer = gültig)
export function validateHarnesses(harnesses, forbiddenProviders, validRoles) {
  const errors = [];
  const roles = validRoles instanceof Set ? validRoles : new Set(validRoles ?? []);
  const forbidden = new Set(forbiddenProviders ?? []);
  for (const [name, h] of Object.entries(harnesses ?? {})) {
    if (!h || typeof h !== 'object') {
      errors.push(`harness '${name}': must be an object`);
      continue;
    }
    for (const field of ['job', 'provider', 'default_model']) {
      if (typeof h[field] !== 'string' || h[field].trim() === '') {
        errors.push(`harness '${name}': missing or empty '${field}'`);
      }
    }
    if (!Array.isArray(h.roles) || h.roles.length === 0) {
      errors.push(`harness '${name}': 'roles' must be a non-empty array`);
    } else {
      for (const r of h.roles) {
        if (!roles.has(r)) {
          errors.push(`harness '${name}': unknown role '${r}'`);
        }
      }
    }
    if (typeof h.config !== 'string' && h.config !== null) {
      errors.push(`harness '${name}': 'config' must be a string or null`);
    }
    if (typeof h.provider === 'string' && forbidden.has(h.provider)) {
      errors.push(`forbidden provider ${h.provider} in harness ${name}`);
    }
  }
  return errors;
}

// Löst den Werkzeugsatz einer Harness auf.
// @param capabilities validierte Capabilities aus loadRegistry
// @param harness ein Harness-Eintrag ({ roles: [...] })
// @returns Set der Instanz-Keys (z. B. 'mcp:context7')
export function resolveToolset(capabilities, harness) {
  const toolset = new Set();
  const harnessRoles = new Set(harness?.roles ?? []);
  const wildcardHit = [...harnessRoles].some(r => WILDCARD_ROLES.includes(r));
  for (const instances of Object.values(capabilities ?? {})) {
    for (const [instKey, cfg] of Object.entries(instances)) {
      if (cfg?.state === 'suppressed') continue;
      if (!Array.isArray(cfg?.roles)) continue;
      const direct = cfg.roles.some(r => harnessRoles.has(r));
      const wildcard = wildcardHit && cfg.roles.includes('all');
      if (direct || wildcard) {
        toolset.add(instKey);
      }
    }
  }
  return toolset;
}
