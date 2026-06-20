#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('Usage: node validate-manifest.mjs <path-to-app.yaml>');
  process.exit(1);
}

try {
  const fileContent = fs.readFileSync(path.resolve(manifestPath), 'utf8');
  const doc = YAML.parse(fileContent);

  if (!doc || typeof doc !== 'object') {
    throw new Error('Manifest is not a valid YAML object');
  }

  // Required top-level fields
  const required = ['name', 'title', 'description', 'kustomize'];
  for (const field of required) {
    if (!doc[field]) {
      throw new Error(`Missing required field: "${field}"`);
    }
    if (typeof doc[field] !== 'string') {
      throw new Error(`Field "${field}" must be a string`);
    }
  }

  // Name validation pattern
  if (!/^[a-z0-9-]+$/.test(doc.name)) {
    throw new Error(`Field "name" must match pattern ^[a-z0-9-]+$ (got "${doc.name}")`);
  }

  // Title must not contain shell metacharacters
  if (doc.title && /[$`"'|&;()<>{}[\]\\!#~*?\t\n]/.test(doc.title)) {
    throw new Error(`Field "title" contains forbidden shell metacharacters (got "${doc.title}")`);
  }

  // Optional domains validation
  if (doc.domains !== undefined) {
    if (!Array.isArray(doc.domains)) {
      throw new Error('Field "domains" must be an array');
    }
    for (const [idx, item] of doc.domains.entries()) {
      if (!item || typeof item !== 'object') {
        throw new Error(`domains[${idx}] must be an object`);
      }
      if (!item.key || typeof item.key !== 'string') {
        throw new Error(`domains[${idx}].key must be a string`);
      }
      if (!item.host || typeof item.host !== 'string') {
        throw new Error(`domains[${idx}].host must be a string`);
      }
    }
  }

  // Optional OIDC validation
  if (doc.oidc !== undefined) {
    if (!doc.oidc || typeof doc.oidc !== 'object') {
      throw new Error('Field "oidc" must be an object');
    }
    if (!doc.oidc.client_id || typeof doc.oidc.client_id !== 'string') {
      throw new Error('oidc.client_id must be a string');
    }
    if (/[$`"'|&;()<>{}[\]\\!#~*?\t\n]/.test(doc.oidc.client_id)) {
      throw new Error(`oidc.client_id contains forbidden shell metacharacters (got "${doc.oidc.client_id}")`);
    }
    if (!Array.isArray(doc.oidc.redirect_uris)) {
      throw new Error('oidc.redirect_uris must be an array');
    }
    for (const [idx, uri] of doc.oidc.redirect_uris.entries()) {
      if (typeof uri !== 'string') {
        throw new Error(`oidc.redirect_uris[${idx}] must be a string`);
      }
      const sanitized = uri.replace(/\$\{[^}]+\}/g, 'placeholder.example.com');
      try {
        new URL(sanitized);
      } catch {
        throw new Error(`oidc.redirect_uris[${idx}] is not a valid URL (got "${uri}")`);
      }
    }
  }

  // Optional secrets validation
  if (doc.secrets !== undefined) {
    if (!Array.isArray(doc.secrets)) {
      throw new Error('Field "secrets" must be an array');
    }
    for (const [idx, secret] of doc.secrets.entries()) {
      if (typeof secret !== 'string') {
        throw new Error(`secrets[${idx}] must be a string`);
      }
      if (!/^[A-Z][A-Z0-9_]*$/.test(secret)) {
        throw new Error(`secrets[${idx}] must match pattern ^[A-Z][A-Z0-9_]*$ (got "${secret}")`);
      }
    }
  }

  // Optional requires validation
  if (doc.requires !== undefined) {
    if (!Array.isArray(doc.requires)) {
      throw new Error('Field "requires" must be an array');
    }
    for (const [idx, req] of doc.requires.entries()) {
      if (typeof req !== 'string') {
        throw new Error(`requires[${idx}] must be a string`);
      }
    }
  }

  // Optional resources validation
  if (doc.resources !== undefined) {
    if (!doc.resources || typeof doc.resources !== 'object') {
      throw new Error('Field "resources" must be an object');
    }
    if (doc.resources.cpu && typeof doc.resources.cpu !== 'string') {
      throw new Error('resources.cpu must be a string');
    }
    if (doc.resources.memory && typeof doc.resources.memory !== 'string') {
      throw new Error('resources.memory must be a string');
    }
  }

  console.log(`✅ Manifest ${manifestPath} is valid.`);
  process.exit(0);
} catch (err) {
  console.error(`❌ Validation failed: ${err.message}`);
  process.exit(1);
}
