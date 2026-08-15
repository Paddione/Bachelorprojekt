import { Request, Response } from 'express';
import { db } from '../db';
import { videos, duplicateIgnores, DBVideo } from '@shared/schema';
import { eq, isNull, or, sql } from 'drizzle-orm';
import { computeFastHash, computePhash } from '../lib/hashing';

interface HashUpdates {
    hashFast?: string;
    hashPerceptual?: string;
}

interface DuplicateRow {
    hash: string;
    ids: string[];
    count: number;
}

export async function computeHashes(req: Request, res: Response) {
    if (!db) return res.status(503).json({ error: 'Database not configured' });

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    // Find videos without hashes
    const videosToProcess = await db
        .select()
        .from(videos)
        .where(or(isNull(videos.hashFast), isNull(videos.hashPerceptual)))
        .limit(limit);

    let processed = 0;
    for (const video of videosToProcess) {
        try {
            const updates: HashUpdates = {};
            // Only compute if missing
            if (!video.hashFast) {
                updates.hashFast = await computeFastHash(video.path);
            }
            if (!video.hashPerceptual) {
                updates.hashPerceptual = await computePhash(video.path);
            }

            if (Object.keys(updates).length > 0) {
                await db.update(videos).set(updates).where(eq(videos.id, video.id));
                processed++;
            }
        } catch (e) {
            console.error(`Error processing video ${video.id}:`, e);
        }
    }

    // Check how many remaining
    const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(videos)
        .where(or(isNull(videos.hashFast), isNull(videos.hashPerceptual)));

    res.json({ processed, remaining: Number(count) });
}

export async function getDuplicates(req: Request, res: Response) {
    if (!db) return res.status(503).json({ error: 'Database not configured' });

    // Find duplicates by fast hash
    const fastDuplicates = await db.execute(sql`
    SELECT hash_fast as hash, array_agg(id) as ids, count(*) as count
    FROM videos
    WHERE hash_fast IS NOT NULL AND hash_fast != ''
    GROUP BY hash_fast
    HAVING count(*) > 1
  `);

    // Find duplicates by perceptual hash
    const perceptualDuplicates = await db.execute(sql`
    SELECT hash_perceptual as hash, array_agg(id) as ids, count(*) as count
    FROM videos
    WHERE hash_perceptual IS NOT NULL AND hash_perceptual != ''
    GROUP BY hash_perceptual
    HAVING count(*) > 1
  `);

    // Fetch ignores
    const ignores = await db.select().from(duplicateIgnores);
    const ignoreSet = new Set(ignores.map((i) => `${i.video1}:${i.video2}`));

    // Fetch video details for the IDs
    const allIds = new Set<string>();
    (fastDuplicates.rows as unknown as DuplicateRow[]).forEach((row) => row.ids.forEach((id: string) => allIds.add(id)));
    (perceptualDuplicates.rows as unknown as DuplicateRow[]).forEach((row) => row.ids.forEach((id: string) => allIds.add(id)));

    let videoDetails: DBVideo[] = [];
    if (allIds.size > 0) {
        videoDetails = await db.select().from(videos).where(sql`id IN ${Array.from(allIds)}`);
    }

    const videoMap = new Map(videoDetails.map((v) => [v.id, v]));

    const enrich = (rows: DuplicateRow[]) =>
        rows
            .map((row) => {
                const ids = row.ids;
                // Check if this group is ignored (only for pairs)
                if (ids.length === 2) {
                    const [v1, v2] = [...ids].sort();
                    if (ignoreSet.has(`${v1}:${v2}`)) return null;
                }
                return {
                    hash: row.hash,
                    count: row.count,
                    videos: ids.map((id: string) => videoMap.get(id)).filter(Boolean),
                };
            })
            .filter(Boolean);

    res.json({
        fast: enrich(fastDuplicates.rows as unknown as DuplicateRow[]),
        perceptual: enrich(perceptualDuplicates.rows as unknown as DuplicateRow[]),
    });
}

export async function ignoreDuplicateRoute(req: Request, res: Response) {
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const { video1, video2 } = req.body as { video1: string; video2: string };
    if (!video1 || !video2) return res.status(400).json({ error: 'video1 and video2 required' });

    const [v1, v2] = [video1, video2].sort();
    await db.insert(duplicateIgnores).values({ video1: v1, video2: v2 }).onConflictDoNothing();
    res.json({ success: true });
}
