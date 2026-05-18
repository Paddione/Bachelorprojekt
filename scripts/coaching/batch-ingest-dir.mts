import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';

const SUPPORTED_EXTS = new Set(['.pdf', '.doc', '.docx', '.epub']);
const HASH_SUFFIX_RE = /_[0-9a-f]{32}(\.[^.]+)$/i;

export interface FileCandidate {
  filePath: string;
  filename: string;
  sha256: string;
  relPath: string;
  blockSlug: string | null;
  blockCollection: string | null;
  courseCollection: string;
  preview: string | null;
}

export interface FileMetadata {
  blockSlug: string | null;
  blockCollection: string | null;
  courseCollection: string;
}

export function deriveMetadata(filePath: string, inputDir: string, courseSlug: string): FileMetadata {
  const rel = relative(inputDir, filePath);
  const parts = rel.split('/');
  const blockMatch = parts.length > 1 ? parts[0].match(/^block(\d+)$/i) : null;
  const blockSlug = blockMatch ? parts[0].toLowerCase() : null;
  const courseCollection = `coaching-${courseSlug}`;
  const blockCollection = blockSlug ? `${courseCollection}-${blockSlug}` : null;
  return { blockSlug, blockCollection, courseCollection };
}

export async function scanAndDedup(dir: string): Promise<Omit<FileCandidate, 'relPath' | 'blockSlug' | 'blockCollection' | 'courseCollection' | 'preview'>[]> {
  const allFiles = await collectFiles(dir);
  const supported = allFiles.filter((f) => SUPPORTED_EXTS.has(extname(f).toLowerCase()));

  const hashed = await Promise.all(supported.map(async (f) => {
    const buf = await readFile(f);
    const hash = createHash('sha256').update(buf).digest('hex');
    return { filePath: f, filename: basename(f), sha256: hash };
  }));

  const byHash = new Map<string, typeof hashed[0]>();
  for (const entry of hashed) {
    const existing = byHash.get(entry.sha256);
    if (!existing) {
      byHash.set(entry.sha256, entry);
    } else {
      const currentIsClean = !HASH_SUFFIX_RE.test(existing.filename);
      const newIsClean = !HASH_SUFFIX_RE.test(entry.filename);
      if (newIsClean && !currentIsClean) byHash.set(entry.sha256, entry);
    }
  }

  return Array.from(byHash.values());
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}
