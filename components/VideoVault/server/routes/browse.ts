import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { MOVIE_EXTENSIONS } from '../handlers/movie-handler';
import { logger } from '../lib/logger';

const router = Router();

const HDD_EXT_DIR = process.env.HDD_EXT_DIR || path.join(process.cwd(), 'media', 'hdd-ext');

interface BrowseEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  servePath?: string;
  isVideo?: boolean;
}

/**
 * GET /api/browse?path=subfolder
 * List directory contents of HDD-ext mount.
 * Empty/missing path param lists root.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const relPath = (req.query.path as string) || '';

    // Resolve and validate — prevent path traversal
    const resolved = path.resolve(HDD_EXT_DIR, relPath);
    if (!resolved.startsWith(path.resolve(HDD_EXT_DIR))) {
      return res.status(403).json({ error: 'Path traversal not allowed' });
    }

    // Verify directory exists
    let stat;
    try {
      stat = await fs.stat(resolved);
    } catch {
      return res.status(404).json({ error: 'Directory not found' });
    }

    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const dirents = await fs.readdir(resolved, { withFileTypes: true });

    const entries: BrowseEntry[] = [];

    // Process entries in parallel for speed
    await Promise.all(
      dirents.map(async (dirent) => {
        // Skip hidden files and Thumbnails directory
        if (dirent.name.startsWith('.') || dirent.name === 'Thumbnails') return;

        const fullPath = path.join(resolved, dirent.name);
        const entry: BrowseEntry = {
          name: dirent.name,
          type: dirent.isDirectory() ? 'directory' : 'file',
        };

        if (dirent.isFile()) {
          try {
            const fileStat = await fs.stat(fullPath);
            entry.size = fileStat.size;
            entry.modified = fileStat.mtime.toISOString();
          } catch { /* stat failed, skip size/modified */ }

          const ext = path.extname(dirent.name).toLowerCase();
          entry.isVideo = MOVIE_EXTENSIONS.includes(ext);

          // Serve path relative to media root
          const relativeToRoot = path.relative(HDD_EXT_DIR, fullPath);
          entry.servePath = '/media/hdd-ext/' + relativeToRoot.split(path.sep).map(encodeURIComponent).join('/');
        }

        entries.push(entry);
      }),
    );

    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    res.json({
      path: relPath,
      entries,
    });
  } catch (error: any) {
    logger.error('[Browse] Directory listing failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
