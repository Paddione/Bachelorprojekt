import { Request, Response } from 'express';
import { db } from '../db';
import { videos, tags, tagSynonyms } from '@shared/schema';
import { VideoCategories, CustomCategories } from '@shared/types';
import { eq } from 'drizzle-orm';
import { syncVideoSidecar } from '../lib/sidecar';

export async function renameTagRoute(req: Request, res: Response) {
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const { id } = req.params;
  const { newName } = req.body as { newName: string };

  if (!newName) return res.status(400).json({ error: 'newName is required' });

  const [tag] = await db.select().from(tags).where(eq(tags.id, id));
  if (!tag) return res.status(404).json({ error: 'Tag not found' });

  const oldName = tag.name;
  const type = tag.type;

  // Update tag name
  await db.update(tags).set({ name: newName, updatedAt: new Date() }).where(eq(tags.id, id));

  // Update videos
  const allVideos = await db.select().from(videos);
  let updatedCount = 0;
  const changedWithRoot: typeof allVideos = [];

  for (const video of allVideos) {
    let changed = false;
    // Note: cats/customCats are references to video object properties —
    // in-place mutations are visible to syncVideoSidecar later
    const cats = video.categories;
    const customCats = video.customCategories;

    // Check categories
    if (cats[type] && cats[type].includes(oldName)) {
      cats[type] = cats[type].map((t: string): string => (t === oldName ? newName : t));
      changed = true;
    }

    // Check customCategories
    if (customCats[type] && customCats[type].includes(oldName)) {
      customCats[type] = customCats[type].map((t: string): string => (t === oldName ? newName : t));
      changed = true;
    }

    if (changed) {
      await db
        .update(videos)
        .set({
          categories: cats,
          customCategories: customCats,
        })
        .where(eq(videos.id, video.id));
      updatedCount++;
      if (video.rootKey) changedWithRoot.push(video);
    }
  }

  // Sync sidecars for all affected videos with a rootKey
  for (const video of changedWithRoot) {
    await syncVideoSidecar(video as any);
  }

  res.json({ success: true, updatedVideos: updatedCount });
}

export async function mergeTagsRoute(req: Request, res: Response) {
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const { sourceId, targetId } = req.body as { sourceId: string; targetId: string };

  if (!sourceId || !targetId)
    return res.status(400).json({ error: 'sourceId and targetId required' });

  const [sourceTag] = await db.select().from(tags).where(eq(tags.id, sourceId));
  const [targetTag] = await db.select().from(tags).where(eq(tags.id, targetId));

  if (!sourceTag || !targetTag) return res.status(404).json({ error: 'Tags not found' });

  const sourceType = sourceTag.type;
  // const targetType = targetTag.type; // Assuming we merge within same type or effectively move to target

  const allVideos = await db.select().from(videos);
  let updatedCount = 0;
  const changedWithRoot: typeof allVideos = [];

  for (const video of allVideos) {
    let changed = false;
    // Note: cats/customCats are references to video object properties —
    // in-place mutations are visible to syncVideoSidecar later
    const cats = video.categories;
    const customCats = video.customCategories;

    // Helper to replace/add
    const processList = (list: string[] | undefined) => {
      if (!list) return list;
      if (list.includes(sourceTag.name)) {
        changed = true;
        // Remove source
        const filtered = list.filter((t) => t !== sourceTag.name);
        // Add target if not present
        if (!filtered.includes(targetTag.name)) {
          filtered.push(targetTag.name);
        }
        return filtered;
      }
      return list;
    };

    if (cats[sourceType]) cats[sourceType] = processList(cats[sourceType])!;
    if (customCats[sourceType]) customCats[sourceType] = processList(customCats[sourceType])!;

    if (changed) {
      await db
        .update(videos)
        .set({ categories: cats, customCategories: customCats })
        .where(eq(videos.id, video.id));
      updatedCount++;
      if (video.rootKey) changedWithRoot.push(video);
    }
  }

  // Sync sidecars for all affected videos with a rootKey
  for (const video of changedWithRoot) {
    await syncVideoSidecar(video as any);
  }

  // Delete source tag
  await db.delete(tags).where(eq(tags.id, sourceId));

  res.json({ success: true, updatedVideos: updatedCount });
}

export async function addSynonymRoute(req: Request, res: Response) {
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const { source, target } = req.body as { source: string; target: string };

  if (!source || !target) return res.status(400).json({ error: 'source and target required' });

  await db.insert(tagSynonyms).values({ source, target }).onConflictDoNothing();

  res.json({ success: true });
}

export async function listSynonymsRoute(req: Request, res: Response) {
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const rows = await db.select().from(tagSynonyms);
  res.json(rows);
}

export async function deleteSynonymRoute(req: Request, res: Response) {
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const { source } = req.params;
  await db.delete(tagSynonyms).where(eq(tagSynonyms.source, source));
  res.json({ success: true });
}
