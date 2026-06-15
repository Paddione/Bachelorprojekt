import path from 'path';
import fs from 'fs/promises';
import { eq } from 'drizzle-orm';
import { directoryRoots } from '@shared/schema';
import { logger } from './logger';

/**
 * Resolve a relative path to an absolute path using rootKey and MEDIA_ROOT
 * Tries multiple candidate paths to find where the file actually exists
 */
export async function resolveInputPath(
    relativePath: string,
    rootKey: string | undefined,
    db: any,
): Promise<string | null> {
    const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'Bibliothek');

    // If inputPath is already absolute, verify it exists
    if (path.isAbsolute(relativePath)) {
        try {
            await fs.access(relativePath);
            return relativePath;
        } catch {
            logger.warn(`[PathResolver] Absolute path not found: ${relativePath}`);
            return null;
        }
    }

    // Build candidate root paths
    const candidateRoots: string[] = [MEDIA_ROOT];

    // Try to look up root from database if rootKey is provided
    if (rootKey && db) {
        try {
            const [root] = await db
                .select()
                .from(directoryRoots)
                .where(eq(directoryRoots.rootKey, rootKey))
                .limit(1);

            if (root) {
                // Add root name subdirectory
                candidateRoots.unshift(path.join(MEDIA_ROOT, root.name));

                // Add any stored directory paths
                if (root.directories && Array.isArray(root.directories)) {
                    for (const dir of root.directories) {
                        if (path.isAbsolute(dir)) {
                            candidateRoots.push(dir);
                        }
                    }
                }
            }
        } catch (error: any) {
            logger.warn(`[PathResolver] Failed to look up root: ${rootKey}`, { error: error?.message });
        }
    }

    // Also try common fallback paths
    candidateRoots.push(
        path.join(process.cwd(), 'Bibliothek'),
        process.cwd(),
    );

    // Try each candidate to find where the file exists
    for (const rootPath of candidateRoots) {
        const candidate = path.join(rootPath, relativePath);
        try {
            await fs.access(candidate);
            logger.debug(`[PathResolver] Resolved path: ${relativePath} -> ${candidate}`);
            return candidate;
        } catch {
            // Continue to next candidate
        }
    }

    logger.error(`[PathResolver] Could not resolve path: ${relativePath}`, {
        rootKey,
        triedPaths: candidateRoots.map((r) => path.join(r, relativePath)),
    });
    return null;
}
