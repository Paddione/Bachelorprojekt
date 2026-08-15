import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

function getRegistryPath(): string {
  const p = process.env.SESSION_HUB_REGISTRY;
  if (p) return p;
  return join(homedir(), '.local/share/bachelorprojekt/active-sessions.json');
}

function getArchiveDir(): string {
  const p = process.env.SESSIONS_ARCHIVE_DIR;
  if (p) return p;
  return join(homedir(), '.local/share/bachelorprojekt/sessions-archive');
}

async function writeAtomically(filePath: string, data: string): Promise<void> {
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(tmpPath, data, 'utf8');
  await rename(tmpPath, filePath);
}

interface RegistryEntry {
  slug: string;
  started_at?: string;
  type?: string;
  title?: string;
  participants?: string[];
  owner?: string;
  preferred_username?: string;
  local_url?: string;
}

async function readRegistry(filePath: string): Promise<RegistryEntry[]> {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Registry is not an array');
  }
  return parsed as RegistryEntry[];
}

export async function purgeOldSessions({ maxAgeDays = 30 }: { maxAgeDays?: number } = {}): Promise<{ purged: number; warnings: string[] }> {
  const registryPath = getRegistryPath();
  const archiveDir = getArchiveDir();
  const warnings: string[] = [];

  let registry: RegistryEntry[] = [];
  try {
    registry = await readRegistry(registryPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      registry = [];
    } else {
      warnings.push('corrupt-registry');
      return { purged: 0, warnings };
    }
  }

  const now = new Date();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const toKeep: RegistryEntry[] = [];
  const toPurge: RegistryEntry[] = [];

  for (const entry of registry) {
    if (!entry.started_at) {
      toKeep.push(entry);
      continue;
    }
    const startedAt = new Date(entry.started_at);
    if (isNaN(startedAt.getTime())) {
      toKeep.push(entry);
      continue;
    }
    const ageMs = now.getTime() - startedAt.getTime();
    if (ageMs > maxAgeMs) {
      toPurge.push(entry);
    } else {
      toKeep.push(entry);
    }
  }

  if (toPurge.length === 0) {
    return { purged: 0, warnings };
  }

  await mkdir(archiveDir, { recursive: true });

  for (const entry of toPurge) {
    const startedAtIso = entry.started_at || new Date().toISOString();
    const startedAtSanitized = startedAtIso.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const id = `${entry.slug}-${startedAtSanitized}`;

    let markdownContent = 'Inhalt nicht verfügbar';
    let contentAvailable = false;

    if (entry.local_url) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(entry.local_url, { signal: controller.signal });
        if (res.ok) {
          markdownContent = await res.text();
          contentAvailable = true;
        }
      } catch {
        // Fetch failed or timed out
      } finally {
        clearTimeout(timeoutId);
      }
    }

    const mdPath = join(archiveDir, `${id}.md`);
    const metaPath = join(archiveDir, `${id}.meta.json`);

    const meta = {
      id,
      slug: entry.slug,
      type: entry.type || 'unknown',
      title: entry.title || entry.slug,
      date: startedAtIso,
      participants: entry.participants || [],
      owner: entry.owner || entry.preferred_username || 'unknown',
      content_available: contentAvailable
    };

    await writeFile(mdPath, markdownContent, 'utf8');
    await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }

  try {
    await writeAtomically(registryPath, JSON.stringify(toKeep, null, 2));
  } catch {
    warnings.push('write-failed');
  }

  return { purged: toPurge.length, warnings };
}

export interface ArchivedSession {
  id: string;
  slug: string;
  type: string;
  title: string;
  date: string;
  participants: string[];
  owner: string;
  content_available: boolean;
}

export async function listArchivedSessions({
  viewer,
  isAdmin,
  offset = 0,
  limit = 50,
  type
}: {
  viewer: string;
  isAdmin: boolean;
  offset?: number;
  limit?: number;
  type?: string;
}): Promise<{ items: ArchivedSession[]; total: number; hasMore: boolean }> {
  const archiveDir = getArchiveDir();
  let files: string[] = [];
  try {
    files = await readdir(archiveDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { items: [], total: 0, hasMore: false };
    }
    throw err;
  }

  const metaFiles = files.filter(f => f.endsWith('.meta.json'));
  const sessions: ArchivedSession[] = [];

  for (const file of metaFiles) {
    try {
      const raw = await readFile(join(archiveDir, file), 'utf8');
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.id !== 'string' ||
        typeof parsed.slug !== 'string' ||
        typeof parsed.owner !== 'string'
      ) {
        continue;
      }
      sessions.push(parsed as ArchivedSession);
    } catch {
      // Skip corrupt sidecars
      continue;
    }
  }

  // Visibility check: admin sees all, non-admin only own
  let filtered = sessions.filter(s => {
    if (isAdmin) return true;
    return s.owner === viewer;
  });

  // Type filter
  if (type) {
    filtered = filtered.filter(s => s.type === type);
  }

  // Sort by date chronologically descending (latest first)
  filtered.sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    return timeB - timeA;
  });

  const total = filtered.length;
  const sliced = filtered.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return {
    items: sliced,
    total,
    hasMore
  };
}

export async function getArchivedMarkdown(id: string): Promise<string | null> {
  if (!/^[a-z0-9-]+$/.test(id)) {
    return null;
  }
  const archiveDir = getArchiveDir();
  const filePath = join(archiveDir, `${id}.md`);
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

