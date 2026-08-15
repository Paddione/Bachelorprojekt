import { Request, Response } from 'express';
import { db } from '../db';
import {
  videos,
  directoryRoots,
  appSettings,
  filterPresets,
  tags,
  type InsertDBVideo,
} from '@shared/schema';
import { eq, inArray, isNotNull, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { resolveInputPath } from '../lib/path-resolver';
import { syncVideoSidecar } from '../lib/sidecar';

function requireDb(res: Response) {
  if (!db) {
    res.status(503).json({ error: 'Database not configured' });
    return false;
  }
  return true;
}

// Resolve the movies_index.json path once at module load
const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
const MOVIES_INDEX_PATH = path.join(MEDIA_ROOT, 'movies_index.json');

// Videos
export async function listVideos(req: Request, res: Response) {
  const includeIncomplete = req.query.includeIncomplete === 'true';

  // Fast path: serve pre-built movies_index.json for the default query.
  // This avoids a DB round-trip and gives every user the same library instantly.
  if (!includeIncomplete) {
    try {
      const content = await fs.readFile(MOVIES_INDEX_PATH, 'utf-8');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Source', 'movies-index-file');
      return res.send(content);
    } catch {
      // File missing — fall through to DB query
    }
  }

  // Fallback: query DB directly
  if (!requireDb(res)) return;

  let rows;
  if (includeIncomplete) {
    rows = await db!.select().from(videos);
  } else {
    rows = await db!
      .select()
      .from(videos)
      .where(
        and(
          isNotNull(videos.thumbnail),
          eq(videos.processingStatus, 'completed'),
        ),
      );
  }
  // Deduplicate by filename — same physical file may have multiple DB records
  // with different IDs due to client/server ID generation mismatch
  const seen = new Map<string, number>();
  const deduped = rows.filter((row: any, i: number) => {
    const key = `${row.filename}\0${row.size}`;
    if (seen.has(key)) return false;
    seen.set(key, i);
    return true;
  });
  res.json(deduped);
}

export async function bulkUpsertVideos(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const payload = (req.body?.videos || []) as Array<any>;
  if (!Array.isArray(payload)) return res.status(400).json({ error: 'videos must be an array' });

  const rows: InsertDBVideo[] = payload.map((v) => ({
    id: v.id,
    filename: v.filename,
    displayName: v.displayName,
    path: v.path,
    size: Number(v.size) || 0,
    lastModified: new Date(v.lastModified),
    metadata: v.metadata || {},
    categories: v.categories || {},
    customCategories: v.customCategories || {},
    thumbnail: v.thumbnail || null,
    rootKey: v.rootKey ?? (null as any),
    hashFast: v.hashFast || null,
    hashPerceptual: v.hashPerceptual || null,
  }));

  if (rows.length === 0) return res.json({ upserted: 0 });

  // Remove duplicate records: same filename+path but different id
  // This handles client/server ID generation mismatch (btoa vs sha256)
  const incomingPaths = rows.map((r) => r.path).filter(Boolean) as string[];
  const incomingIds = new Set(rows.map((r) => r.id));
  if (incomingPaths.length > 0) {
    await db!
      .delete(videos)
      .where(
        and(
          inArray(videos.path, incomingPaths),
          sql`${videos.id} NOT IN (${sql.join(
            [...incomingIds].map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      );
  }

  // Upsert by id
  await db!
    .insert(videos)
    .values(rows)
    .onConflictDoUpdate({
      target: videos.id,
      set: {
        filename: (rows as any)[0].filename, // placeholders required by drizzle; real values taken per-row
        displayName: (rows as any)[0].displayName,
        path: (rows as any)[0].path,
        size: (rows as any)[0].size,
        lastModified: (rows as any)[0].lastModified,
        metadata: (rows as any)[0].metadata,
        categories: (rows as any)[0].categories,
        customCategories: (rows as any)[0].customCategories,
        thumbnail: (rows as any)[0].thumbnail,
        rootKey: (rows as any)[0].rootKey,
        hashFast: (rows as any)[0].hashFast,
        hashPerceptual: (rows as any)[0].hashPerceptual,
      },
    });

  // Write sidecars for all server-indexed videos (any rootKey)
  const sidecarRows = rows.filter((r) => r.rootKey);
  if (sidecarRows.length > 0) {
    await Promise.all(
      sidecarRows.map((row) => syncVideoSidecar(row as any)),
    );
  }

  // Rebuild movies_index.json so the fast-path GET /api/videos reflects changes
  try {
    const { generateMoviesIndex } = await import('../lib/startup-tasks');
    await generateMoviesIndex(db);
  } catch { /* non-fatal */ }

  res.json({ upserted: rows.length });
}

export async function patchVideo(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const { id } = req.params;
  const patch = req.body || {};
  const set: any = {};
  const allowed = [
    'filename',
    'displayName',
    'path',
    'size',
    'lastModified',
    'metadata',
    'categories',
    'customCategories',
    'thumbnail',
    'rootKey',
  ];
  for (const k of allowed) {
    if (k in patch) set[k] = k === 'lastModified' ? new Date(patch[k]) : patch[k];
  }
  if (Object.keys(set).length === 0)
    return res.status(400).json({ error: 'No valid fields to update' });
  const result = await db!.update(videos).set(set).where(eq(videos.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: 'Not found' });

  // Write sidecar for server-indexed videos (any rootKey)
  const updated = result[0];
  if (updated.rootKey) {
    await syncVideoSidecar(updated as any);
  }

  res.json(result[0]);
}

export async function deleteVideo(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const { id } = req.params;
  const result = await db!.delete(videos).where(eq(videos.id, id)).returning();
  res.json({ deleted: result.length });
}

export async function batchDeleteVideos(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const ids: string[] = req.body?.ids || [];
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ deleted: 0 });
  const result = await db!.delete(videos).where(inArray(videos.id, ids)).returning();
  res.json({ deleted: result.length });
}

export async function cleanupMissingVideos(_req: Request, res: Response) {
  if (!requireDb(res)) return;

  try {
    const allVideos = await db!.select().from(videos);
    const missingIds: string[] = [];

    for (const video of allVideos) {
      const resolved = await resolveInputPath(video.path, video.rootKey || undefined, db);
      if (!resolved) {
        missingIds.push(video.id);
      }
    }

    if (missingIds.length > 0) {
      const deleted = await db!.delete(videos).where(inArray(videos.id, missingIds)).returning();
      return res.json({ deletedCount: deleted.length, missingIds });
    }

    res.json({ deletedCount: 0, missingIds: [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Directory Roots
export async function getRoots(_req: Request, res: Response) {
  if (!requireDb(res)) return;
  const rows = await db!.select().from(directoryRoots);
  res.json({ roots: rows });
}

export async function setRoot(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const { rootKey, directories, name } = req.body || {};
  if (!rootKey || !Array.isArray(directories))
    return res.status(400).json({ error: 'rootKey and directories required' });
  const value = { rootKey, name: name || rootKey, directories, updatedAt: new Date() } as any;
  await db!
    .insert(directoryRoots)
    .values(value)
    .onConflictDoUpdate({ target: directoryRoots.rootKey, set: value });
  res.json({ success: true });
}

export async function addDirectory(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const { rootKey, path } = req.body || {};
  if (!rootKey || typeof path !== 'string')
    return res.status(400).json({ error: 'rootKey and path required' });
  const [root] = await db!
    .select()
    .from(directoryRoots)
    .where(eq(directoryRoots.rootKey, rootKey))
    .limit(1);
  const dirs = Array.from(new Set([...(root?.directories || []), normalizeDir(path)]));
  await db!
    .insert(directoryRoots)
    .values({
      rootKey,
      name: root?.name || rootKey,
      directories: dirs,
      updatedAt: new Date(),
    } as any)
    .onConflictDoUpdate({
      target: directoryRoots.rootKey,
      set: { directories: dirs, updatedAt: new Date() } as any,
    });
  res.json({ success: true });
}

export async function removeDirectory(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const { rootKey, path } = req.body || {};
  if (!rootKey || typeof path !== 'string')
    return res.status(400).json({ error: 'rootKey and path required' });
  const [root] = await db!
    .select()
    .from(directoryRoots)
    .where(eq(directoryRoots.rootKey, rootKey))
    .limit(1);
  if (!root) return res.status(404).json({ error: 'root not found' });
  const norm = normalizeDir(path);
  const dirs = (root.directories || []).filter((d) => !d.startsWith(norm));
  await db!
    .update(directoryRoots)
    .set({ directories: dirs as any, updatedAt: new Date() } as any)
    .where(eq(directoryRoots.rootKey, rootKey));
  res.json({ success: true });
}

export async function deleteRoot(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const { rootKey } = req.params;
  const result = await db!
    .delete(directoryRoots)
    .where(eq(directoryRoots.rootKey, rootKey))
    .returning();
  res.json({ deleted: result.length });
}

export async function getLastRootKey(_req: Request, res: Response) {
  if (!requireDb(res)) return;
  const [row] = await db!
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, 'last_root_key'))
    .limit(1);
  res.json({ lastRootKey: row?.value || null });
}

export async function setLastRootKey(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const { rootKey } = req.body || {};
  if (typeof rootKey !== 'string') return res.status(400).json({ error: 'rootKey required' });
  await db!
    .insert(appSettings)
    .values({ key: 'last_root_key', value: rootKey, updatedAt: new Date() } as any)
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: rootKey, updatedAt: new Date() } as any,
    });
  res.json({ success: true });
}

// Filter Presets
export async function listPresets(_req: Request, res: Response) {
  if (!requireDb(res)) return;
  const rows = await db!.select().from(filterPresets);
  res.json(rows);
}

export async function createPreset(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const payload = req.body;
  const id = payload?.id || `preset_${randomUUID()}`;
  const now = new Date();
  const row = { id, name: payload.name, payload, createdAt: now, updatedAt: now } as any;
  const [inserted] = await db!
    .insert(filterPresets)
    .values(row)
    .onConflictDoUpdate({
      target: filterPresets.id,
      set: { name: payload.name, payload, updatedAt: now } as any,
    })
    .returning();
  res.json(inserted);
}

export async function updatePreset(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const { id } = req.params;
  const payload = req.body;
  const [updated] = await db!
    .update(filterPresets)
    .set({ name: payload.name, payload, updatedAt: new Date() } as any)
    .where(eq(filterPresets.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
}

export async function deletePreset(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const { id } = req.params;
  const result = await db!.delete(filterPresets).where(eq(filterPresets.id, id)).returning();
  res.json({ deleted: result.length });
}

function normalizeDir(path: string): string {
  const norm = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return norm ? `${norm}/` : '';
}

// Tags
export async function listTags(_req: Request, res: Response) {
  if (!requireDb(res)) return;
  const rows = await db!.select().from(tags).orderBy(tags.name);
  res.json(rows);
}

export async function updateTag(req: Request, res: Response) {
  if (!requireDb(res)) return;
  const { id } = req.params;
  const { url, type } = req.body;

  const set: any = {};
  if (url !== undefined) set.url = url;
  if (type !== undefined) set.type = type;

  if (Object.keys(set).length === 0)
    return res.status(400).json({ error: 'No valid fields to update' });

  const [updated] = await db!
    .update(tags)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(tags.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
}
