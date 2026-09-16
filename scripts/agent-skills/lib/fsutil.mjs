// scripts/agent-skills/lib/fsutil.mjs
// Filesystem/path helpers and content hashing for the projection engine.
// Ticket: T900151, Partial p1 (Inventar + Projektions-Engine)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const GENERATED_METADATA_FILENAMES = new Set(['.agent-skill-projection.json']);
export const MAX_HASH_DEPTH = 64;

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

export function normalizeRelative(value) {
  if (!isNonEmptyString(value)) return null;
  const normalized = value.trim().replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null;
  const posix = path.posix.normalize(normalized);
  if (posix === '.' || posix === '..' || posix.startsWith('../') || posix.startsWith('/')) return null;
  return posix.replace(/^\.\//, '').replace(/\/+$/, '');
}

export function isInsideNormalized(child, parent) {
  if (!child || !parent) return false;
  return child === parent || child.startsWith(`${parent}/`);
}

export function resolveFromRoot(rootAbs, relativePath) {
  return path.resolve(rootAbs, relativePath);
}

export function displayPath(rootAbs, absPath) {
  const rel = path.relative(rootAbs, absPath);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return toPosix(rel);
  return toPosix(absPath);
}

export function realpathSafe(absPath) {
  try {
    return fs.realpathSync(absPath);
  } catch {
    return null;
  }
}

export function isDirectory(absPath) {
  try {
    return fs.statSync(absPath).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(absPath) {
  try {
    return fs.statSync(absPath).isFile();
  } catch {
    return false;
  }
}

export function isSymlink(absPath) {
  try {
    return fs.lstatSync(absPath).isSymbolicLink();
  } catch {
    return false;
  }
}

export function isSkillDir(absPath) {
  return isDirectory(absPath) && isFile(path.join(absPath, 'SKILL.md'));
}

function listFilesRecursive(absPath, base, out, depth, seenRealDirs) {
  if (depth > MAX_HASH_DEPTH) return out;
  const real = realpathSafe(absPath);
  if (!real || seenRealDirs.has(real)) return out;
  seenRealDirs.add(real);

  let entries;
  try {
    entries = fs.readdirSync(absPath, { withFileTypes: true });
  } catch {
    return out;
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (GENERATED_METADATA_FILENAMES.has(entry.name)) continue;
    const fullPath = path.join(absPath, entry.name);
    const relativePath = base ? `${base}/${entry.name}` : entry.name;

    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      listFilesRecursive(fullPath, relativePath, out, depth + 1, seenRealDirs);
    } else if (stat.isFile()) {
      out.push(relativePath);
    }
  }

  return out;
}

const hashCache = new Map();

export function computeDirHash(absPath) {
  const cachedKey = realpathSafe(absPath) || absPath;
  if (hashCache.has(cachedKey)) return hashCache.get(cachedKey);

  const files = listFilesRecursive(absPath, '', [], 0, new Set()).sort();
  const hash = crypto.createHash('sha256');
  hash.update(`file-count:${files.length}\n`);
  for (const relativePath of files) {
    hash.update(`path:${relativePath}\n`);
    try {
      hash.update(fs.readFileSync(path.join(absPath, relativePath)));
    } catch {
      hash.update(`unreadable:${relativePath}`);
    }
    hash.update('\n');
  }

  const digest = hash.digest('hex');
  hashCache.set(cachedKey, digest);
  return digest;
}