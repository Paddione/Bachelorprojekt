// scripts/toolset/lib/registry.mjs
import fs from 'node:fs';
import yaml from 'js-yaml';

export const KNOWN_PREFIXES = ['cli:', 'mcp:', 'skill:', 'agent:', 'plugin:'];

export const ENFORCEABLE_CLASSES = ['mcp:', 'plugin:', 'skill:'];

export function isEnforceable(instanceKey) {
  return ENFORCEABLE_CLASSES.some(prefix => instanceKey.startsWith(prefix));
}

export function parseInstanceKey(key) {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(`Invalid instance key '${key}': must contain a known prefix (${KNOWN_PREFIXES.join(', ')})`);
  }
  const prefix = key.slice(0, colonIndex + 1);
  const name = key.slice(colonIndex + 1);
  if (!KNOWN_PREFIXES.includes(prefix)) {
    throw new Error(`Invalid instance key prefix '${prefix}' in '${key}'`);
  }
  return { prefix, name };
}

export function loadRegistry(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Registry file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = yaml.load(content);
  } catch (err) {
    throw new Error(`Failed to parse YAML in ${filePath}: ${err.message}`);
  }

  if (!data || typeof data !== 'object' || !data.capabilities) {
    throw new Error(`Registry file ${filePath} must contain a top-level 'capabilities' object`);
  }

  const capabilities = data.capabilities;
  const validatedCapabilities = {};

  for (const [capName, instances] of Object.entries(capabilities)) {
    if (!instances || typeof instances !== 'object') {
      throw new Error(`Capability '${capName}' in ${filePath} must be an object of instances`);
    }

    let canonicalCount = 0;
    const validatedInstances = {};

    for (const [instKey, instConfig] of Object.entries(instances)) {
      parseInstanceKey(instKey); // Validates prefix

      if (!instConfig || typeof instConfig !== 'object') {
        throw new Error(`Instance '${instKey}' of capability '${capName}' must be an object`);
      }

      const state = instConfig.state;
      if (!['canonical', 'suppressed', 'unreviewed'].includes(state)) {
        throw new Error(`Instance '${instKey}' of capability '${capName}' has invalid state '${state}'`);
      }

      if (state === 'canonical') {
        canonicalCount++;
      }

      if (state !== 'canonical' && !instConfig.reason) {
        throw new Error(`Instance '${instKey}' of capability '${capName}' has state '${state}' but is missing a 'reason'`);
      }

      validatedInstances[instKey] = {
        state: instConfig.state,
        reason: instConfig.reason || null,
        ...instConfig,
      };
    }

    validatedCapabilities[capName] = validatedInstances;
  }

  return {
    capabilities: validatedCapabilities,
  };
}
