import { Request, Response } from 'express';
import { pool } from '../db';
import { logger } from '../lib/logger';

export async function dbHealth(_req: Request, res: Response) {
  try {
    if (!pool) return res.status(200).json({ configured: false, healthy: false });
    const r = await pool.query('select now() as now');

    // Check index presence
    const idxQuery = `
      select indexname
      from pg_indexes
      where schemaname = current_schema()
        and tablename = 'videos'
        and indexname in (
          'idx_videos_path',
          'idx_videos_last_modified',
          'idx_videos_size',
          'idx_videos_path_last_modified',
          'idx_videos_categories_gin',
          'idx_videos_custom_categories_gin'
        )
    `;
    const idxRes = await pool.query<{ indexname: string }>(idxQuery);
    const present = new Set(idxRes.rows.map((row) => row.indexname));

    // Run representative queries and time them
    const sampleQueries = {
      byPath: `select id from videos where path like $1 order by last_modified desc limit 50`,
      bySize: `select id from videos where size > $1 order by size desc limit 50`,
      byCategories: `select id from videos where categories is not null limit 50`,
    } as const;

    const timings: Record<string, number> = {};
    const thresholdMs = 300;

    const t1 = Date.now();
    await pool.query(sampleQueries.byPath, ['%/']);
    timings.byPath = Date.now() - t1;
    logger.logPerformance('db.query.byPath', timings.byPath, { thresholdMs });
    if (timings.byPath > thresholdMs)
      logger.warn('Slow DB query', { op: 'db.query.byPath', duration: timings.byPath });

    const t2 = Date.now();
    await pool.query(sampleQueries.bySize, [0]);
    timings.bySize = Date.now() - t2;
    logger.logPerformance('db.query.bySize', timings.bySize, { thresholdMs });
    if (timings.bySize > thresholdMs)
      logger.warn('Slow DB query', { op: 'db.query.bySize', duration: timings.bySize });

    const t3 = Date.now();
    await pool.query(sampleQueries.byCategories);
    timings.byCategories = Date.now() - t3;
    logger.logPerformance('db.query.byCategories', timings.byCategories, { thresholdMs });
    if (timings.byCategories > thresholdMs)
      logger.warn('Slow DB query', { op: 'db.query.byCategories', duration: timings.byCategories });

    res.status(200).json({
      configured: true,
      healthy: true,
      now: r.rows[0]?.now,
      indexes: {
        idx_videos_path: present.has('idx_videos_path'),
        idx_videos_last_modified: present.has('idx_videos_last_modified'),
        idx_videos_size: present.has('idx_videos_size'),
        idx_videos_path_last_modified: present.has('idx_videos_path_last_modified'),
        idx_videos_categories_gin: present.has('idx_videos_categories_gin'),
        idx_videos_custom_categories_gin: present.has('idx_videos_custom_categories_gin'),
      },
      timings,
      thresholdMs,
    });
  } catch (e) {
    // Return 200 to avoid noisy client errors; encode health in payload
    const err = e as Error & { code?: string };
    res.status(200).json({ configured: true, healthy: false, error: err.message, code: err.code });
  }
}
