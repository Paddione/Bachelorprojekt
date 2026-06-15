# HDD-ext Sidecar Metadata Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-directory `metadata.json` sidecar files for HDD-ext videos with bidirectional sync between disk and database.

**Architecture:** A new `server/lib/sidecar.ts` module provides `readSidecar()` and `writeSidecar()` utilities. The HDD-ext index endpoint reads sidecars before DB insert (disk categories win), then writes the merged result back. Persistence routes (`patchVideo`, `bulkUpsertVideos`) and tag-ops routes (`renameTag`, `mergeTags`) write sidecars after DB updates for hdd-ext videos.

**Tech Stack:** Node.js `fs/promises`, path resolution via existing `MEDIA_ROOT` env var, JSON serialization.

---

### Task 1: Create `server/lib/sidecar.ts` — Core Read/Write Utilities

**Files:**
- Create: `server/lib/sidecar.ts`
- Test: `server/lib/sidecar.test.ts`

**Step 1: Write the failing test**

Create `server/lib/sidecar.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readSidecar, writeSidecar, SIDECAR_FILENAME } from './sidecar';

describe('sidecar', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sidecar-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('readSidecar', () => {
    it('returns null when no metadata.json exists', async () => {
      const result = await readSidecar(tmpDir);
      expect(result).toBeNull();
    });

    it('reads and parses valid metadata.json', async () => {
      const data = { version: 1, categories: { age: ['teen'] }, customCategories: {} };
      await fs.writeFile(path.join(tmpDir, 'metadata.json'), JSON.stringify(data));
      const result = await readSidecar(tmpDir);
      expect(result).toEqual(data);
    });

    it('returns null for malformed JSON and logs warning', async () => {
      await fs.writeFile(path.join(tmpDir, 'metadata.json'), '{bad json');
      const result = await readSidecar(tmpDir);
      expect(result).toBeNull();
    });
  });

  describe('writeSidecar', () => {
    it('writes metadata.json with formatted JSON', async () => {
      const data = { version: 1, id: 'abc', categories: { age: [] }, customCategories: {} };
      await writeSidecar(tmpDir, data);
      const content = await fs.readFile(path.join(tmpDir, 'metadata.json'), 'utf-8');
      expect(JSON.parse(content)).toEqual(data);
      // Should be pretty-printed
      expect(content).toContain('\n');
    });

    it('does not throw when directory is missing', async () => {
      const missingDir = path.join(tmpDir, 'nonexistent');
      // Should not throw, just log warning
      await expect(writeSidecar(missingDir, { version: 1 })).resolves.not.toThrow();
    });

    it('overwrites existing metadata.json', async () => {
      await fs.writeFile(path.join(tmpDir, 'metadata.json'), '{"old": true}');
      const newData = { version: 1, id: 'new' };
      await writeSidecar(tmpDir, newData);
      const content = JSON.parse(await fs.readFile(path.join(tmpDir, 'metadata.json'), 'utf-8'));
      expect(content).toEqual(newData);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/patrick/projects/VideoVault && npx vitest run server/lib/sidecar.test.ts`
Expected: FAIL — module `./sidecar` not found.

**Step 3: Write minimal implementation**

Create `server/lib/sidecar.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';

export const SIDECAR_FILENAME = 'metadata.json';

export interface SidecarData {
  version: number;
  id?: string;
  filename?: string;
  displayName?: string;
  size?: number;
  lastModified?: string;
  metadata?: {
    duration: number;
    width: number;
    height: number;
    bitrate: number;
    codec: string;
    fps: number;
    aspectRatio: string;
  };
  categories?: Record<string, string[]>;
  customCategories?: Record<string, string[]>;
}

/**
 * Read metadata.json sidecar from a video directory.
 * Returns null if file doesn't exist or is malformed.
 */
export async function readSidecar(dirPath: string): Promise<SidecarData | null> {
  const filePath = path.join(dirPath, SIDECAR_FILENAME);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      logger.warn(`[Sidecar] Failed to read ${filePath}`, { error: err.message });
    }
    return null;
  }
}

/**
 * Write metadata.json sidecar to a video directory.
 * Non-fatal: logs warning on failure, never throws.
 */
export async function writeSidecar(dirPath: string, data: SidecarData): Promise<void> {
  const filePath = path.join(dirPath, SIDECAR_FILENAME);
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  } catch (err: any) {
    logger.warn(`[Sidecar] Failed to write ${filePath}`, { error: err.message });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/patrick/projects/VideoVault && npx vitest run server/lib/sidecar.test.ts`
Expected: PASS (all 5 tests).

**Step 5: Commit**

```bash
cd /home/patrick/projects/VideoVault
git add server/lib/sidecar.ts server/lib/sidecar.test.ts
git commit -m "feat(videovault): add sidecar metadata read/write utilities"
```

---

### Task 2: Integrate Sidecar into `/hdd-ext/index` — Read Before Insert, Write After

**Files:**
- Modify: `server/routes/processing.ts:986-1139` (the `/hdd-ext/index` handler)

**Step 1: Add import**

At top of `server/routes/processing.ts` (after line 12), add:

```typescript
import { readSidecar, writeSidecar } from '../lib/sidecar';
```

**Step 2: Read sidecar and merge categories into the index loop**

Inside the `batch.map(async ({ videoPath, dir, videoFileName }) => { ... })` block (around lines 1036-1122), after the ffprobe extraction (line 1083) and before the DB insert (line 1085), add sidecar reading:

```typescript
          // Read sidecar metadata.json if it exists (disk is source of truth for categories)
          const sidecar = await readSidecar(dir);
          const defaultCategories = { age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] };
          const categories = sidecar?.categories || defaultCategories;
          const customCategories = sidecar?.customCategories || {};
```

**Step 3: Update the DB insert to use sidecar categories**

Replace the hardcoded empty categories in the `.values({...})` block (line 1096-1097):

Before:
```typescript
                categories: { age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] },
                customCategories: {},
```

After:
```typescript
                categories,
                customCategories,
```

Also update the `.onConflictDoUpdate` set block (around lines 1102-1113) to include categories from sidecar:

Before (the set block has no categories/customCategories):
```typescript
                set: {
                  filename: videoFileName,
                  displayName: baseName,
                  path: relVideoPath,
                  size: stat.size,
                  lastModified: stat.mtime,
                  metadata,
                  thumbnail: { generated: true, dataUrl: thumbUrl, timestamp: new Date().toISOString() },
                  processingStatus: 'completed',
                },
```

After:
```typescript
                set: {
                  filename: videoFileName,
                  displayName: baseName,
                  path: relVideoPath,
                  size: stat.size,
                  lastModified: stat.mtime,
                  metadata,
                  categories,
                  customCategories,
                  thumbnail: { generated: true, dataUrl: thumbUrl, timestamp: new Date().toISOString() },
                  processingStatus: 'completed',
                },
```

**Step 4: Write sidecar after successful DB insert**

After the DB insert block (after `indexed++;` on line 1116), add:

```typescript
            // Write merged metadata back to sidecar
            await writeSidecar(dir, {
              version: 1,
              id,
              filename: videoFileName,
              displayName: baseName,
              size: stat.size,
              lastModified: stat.mtime.toISOString(),
              metadata,
              categories,
              customCategories,
            });
```

**Step 5: Run existing tests**

Run: `cd /home/patrick/projects/VideoVault && npx vitest run server/lib/sidecar.test.ts`
Expected: PASS (sidecar module still works).

**Step 6: Commit**

```bash
cd /home/patrick/projects/VideoVault
git add server/routes/processing.ts
git commit -m "feat(videovault): read/write sidecar metadata during hdd-ext indexing"
```

---

### Task 3: Integrate Sidecar into `patchVideo` — Write to Disk on Category Updates

**Files:**
- Modify: `server/routes/persistence.ts:1-14` (imports) and `server/routes/persistence.ts:93-118` (`patchVideo`)

**Step 1: Add imports to persistence.ts**

After line 13 (`import { resolveInputPath } from '../lib/path-resolver';`), add:

```typescript
import { readSidecar, writeSidecar } from '../lib/sidecar';
import path from 'path';
```

**Step 2: Add sidecar write after DB update in patchVideo**

After the successful DB update and before `res.json(result[0])` (line 117), add logic to write sidecar for hdd-ext videos:

```typescript
  // Write sidecar for hdd-ext videos
  const updated = result[0];
  if (updated.rootKey === 'hdd-ext') {
    const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
    const videoDir = path.dirname(path.join(MEDIA_ROOT, updated.path));
    const existing = await readSidecar(videoDir);
    await writeSidecar(videoDir, {
      ...existing,
      version: 1,
      id: updated.id,
      filename: updated.filename,
      displayName: updated.displayName,
      size: Number(updated.size),
      lastModified: updated.lastModified instanceof Date ? updated.lastModified.toISOString() : String(updated.lastModified),
      metadata: updated.metadata as any,
      categories: updated.categories as any,
      customCategories: updated.customCategories as any,
    });
  }
```

**Step 3: Run tests**

Run: `cd /home/patrick/projects/VideoVault && npx vitest run server/lib/sidecar.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
cd /home/patrick/projects/VideoVault
git add server/routes/persistence.ts
git commit -m "feat(videovault): write sidecar on video patch for hdd-ext videos"
```

---

### Task 4: Integrate Sidecar into `bulkUpsertVideos` — Write to Disk on Bulk Updates

**Files:**
- Modify: `server/routes/persistence.ts:45-91` (`bulkUpsertVideos`)

**Step 1: Add sidecar write loop after DB upsert**

After `res.json({ upserted: rows.length })` on line 90, but before the closing brace, replace:

Before:
```typescript
  res.json({ upserted: rows.length });
}
```

After:
```typescript
  // Write sidecars for hdd-ext videos (non-blocking, fire-and-forget)
  const hddExtRows = rows.filter((r) => r.rootKey === 'hdd-ext');
  if (hddExtRows.length > 0) {
    const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
    Promise.all(
      hddExtRows.map(async (row) => {
        const videoDir = path.dirname(path.join(MEDIA_ROOT, row.path));
        const existing = await readSidecar(videoDir);
        await writeSidecar(videoDir, {
          ...existing,
          version: 1,
          id: row.id,
          filename: row.filename,
          displayName: row.displayName,
          size: Number(row.size),
          lastModified: row.lastModified instanceof Date ? row.lastModified.toISOString() : String(row.lastModified),
          metadata: row.metadata as any,
          categories: row.categories as any,
          customCategories: row.customCategories as any,
        });
      }),
    ).catch((err) => {
      // Non-fatal — response already sent
    });
  }

  res.json({ upserted: rows.length });
}
```

Note: The `res.json()` call must come before the sidecar writes since they're fire-and-forget. Move `res.json` above the sidecar block, or keep the sidecar writes truly async. The simplest approach: send response first, then write sidecars.

Actually, to keep it simple and correct, restructure as:

```typescript
  res.json({ upserted: rows.length });

  // Write sidecars for hdd-ext videos after response (non-blocking)
  const hddExtRows = rows.filter((r) => r.rootKey === 'hdd-ext');
  if (hddExtRows.length > 0) {
    const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
    for (const row of hddExtRows) {
      const videoDir = path.dirname(path.join(MEDIA_ROOT, row.path));
      const existing = await readSidecar(videoDir);
      await writeSidecar(videoDir, {
        ...existing,
        version: 1,
        id: row.id,
        filename: row.filename,
        displayName: row.displayName,
        size: Number(row.size),
        lastModified: row.lastModified instanceof Date ? row.lastModified.toISOString() : String(row.lastModified),
        metadata: row.metadata as any,
        categories: row.categories as any,
        customCategories: row.customCategories as any,
      });
    }
  }
```

Wait — after `res.json()` the function still runs but this is an Express handler. We cannot `await` after sending response in the same function reliably. Better approach: use `setImmediate` or just inline the await before `res.json`:

Final approach — write sidecars before sending response:

```typescript
  // Write sidecars for hdd-ext videos
  const hddExtRows = rows.filter((r) => r.rootKey === 'hdd-ext');
  if (hddExtRows.length > 0) {
    const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
    await Promise.all(
      hddExtRows.map(async (row) => {
        try {
          const videoDir = path.dirname(path.join(MEDIA_ROOT, row.path));
          const existing = await readSidecar(videoDir);
          await writeSidecar(videoDir, {
            ...existing,
            version: 1,
            id: row.id,
            filename: row.filename,
            displayName: row.displayName,
            size: Number(row.size),
            lastModified: row.lastModified instanceof Date ? row.lastModified.toISOString() : String(row.lastModified),
            metadata: row.metadata as any,
            categories: row.categories as any,
            customCategories: row.customCategories as any,
          });
        } catch { /* writeSidecar already handles errors */ }
      }),
    );
  }

  res.json({ upserted: rows.length });
```

**Step 2: Run tests**

Run: `cd /home/patrick/projects/VideoVault && npx vitest run server/lib/sidecar.test.ts`
Expected: PASS.

**Step 3: Commit**

```bash
cd /home/patrick/projects/VideoVault
git add server/routes/persistence.ts
git commit -m "feat(videovault): write sidecars on bulk upsert for hdd-ext videos"
```

---

### Task 5: Integrate Sidecar into Tag Operations — Rename and Merge

**Files:**
- Modify: `server/routes/tag-ops.ts:1-6` (imports) and functions `renameTagRoute`, `mergeTagsRoute`

**Step 1: Add imports**

After line 4 (`import { eq } from 'drizzle-orm';`), add:

```typescript
import { readSidecar, writeSidecar } from '../lib/sidecar';
import path from 'path';
```

**Step 2: Add sidecar write helper**

Add a helper function after the imports (before `renameTagRoute`):

```typescript
async function syncHddExtSidecars(updatedVideos: Array<{ id: string; path: string; rootKey: string | null; categories: any; customCategories: any; metadata: any; filename: string; displayName: string; size: any; lastModified: any }>): Promise<void> {
  const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
  for (const video of updatedVideos) {
    if (video.rootKey !== 'hdd-ext') continue;
    const videoDir = path.dirname(path.join(MEDIA_ROOT, video.path));
    const existing = await readSidecar(videoDir);
    await writeSidecar(videoDir, {
      ...existing,
      version: 1,
      id: video.id,
      filename: video.filename,
      displayName: video.displayName,
      size: Number(video.size),
      lastModified: video.lastModified instanceof Date ? video.lastModified.toISOString() : String(video.lastModified),
      metadata: video.metadata as any,
      categories: video.categories as any,
      customCategories: video.customCategories as any,
    });
  }
}
```

**Step 3: Call helper in renameTagRoute**

In `renameTagRoute`, after the for-loop that updates videos (after line 54), before `res.json(...)`:

```typescript
  // Sync sidecars for affected hdd-ext videos
  const affectedVideos = allVideos.filter((v) => v.rootKey === 'hdd-ext');
  await syncHddExtSidecars(affectedVideos as any);
```

Note: We sync all hdd-ext videos that were iterated (since we already modified `cats`/`customCats` in-place during the loop, all hdd-ext videos now have current data regardless of whether `changed` was true for them specifically). Actually, to be precise, only write sidecars for videos that were actually changed:

Better approach — collect changed hdd-ext videos during the loop:

Add before the for-loop: `const changedHddExt: typeof allVideos = [];`

Inside the `if (changed) { ... }` block, after the DB update: `if (video.rootKey === 'hdd-ext') changedHddExt.push(video);`

After the loop: `await syncHddExtSidecars(changedHddExt as any);`

**Step 4: Same pattern in mergeTagsRoute**

Same approach: collect changed hdd-ext videos, call `syncHddExtSidecars` after the loop.

**Step 5: Run tests**

Run: `cd /home/patrick/projects/VideoVault && npx vitest run server/lib/sidecar.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
cd /home/patrick/projects/VideoVault
git add server/routes/tag-ops.ts
git commit -m "feat(videovault): sync sidecars on tag rename and merge for hdd-ext videos"
```

---

### Task 6: Extract Sidecar Build Helper to Avoid Duplication

**Files:**
- Modify: `server/lib/sidecar.ts` — add `buildSidecarFromVideo()` helper
- Modify: `server/routes/persistence.ts`, `server/routes/processing.ts`, `server/routes/tag-ops.ts` — use the helper

**Step 1: Add helper to sidecar.ts**

```typescript
/**
 * Build a SidecarData object from a video DB row.
 * Reads existing sidecar to preserve any fields not in the DB row.
 */
export async function syncVideoSidecar(videoDir: string, video: {
  id: string;
  filename: string;
  displayName: string;
  size: number | bigint;
  lastModified: Date | string;
  metadata: any;
  categories: any;
  customCategories: any;
}): Promise<void> {
  const existing = await readSidecar(videoDir);
  await writeSidecar(videoDir, {
    ...existing,
    version: 1,
    id: video.id,
    filename: video.filename,
    displayName: video.displayName,
    size: Number(video.size),
    lastModified: video.lastModified instanceof Date ? video.lastModified.toISOString() : String(video.lastModified),
    metadata: video.metadata,
    categories: video.categories,
    customCategories: video.customCategories,
  });
}
```

**Step 2: Replace inline sidecar-building code in persistence.ts, tag-ops.ts with `syncVideoSidecar` calls**

Each call site becomes:
```typescript
const videoDir = path.dirname(path.join(MEDIA_ROOT, video.path));
await syncVideoSidecar(videoDir, video);
```

**Step 3: Run all tests**

Run: `cd /home/patrick/projects/VideoVault && npx vitest run server/lib/sidecar.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
cd /home/patrick/projects/VideoVault
git add server/lib/sidecar.ts server/routes/persistence.ts server/routes/tag-ops.ts server/routes/processing.ts
git commit -m "refactor(videovault): extract syncVideoSidecar helper to deduplicate sidecar writes"
```

---

### Task 7: Manual Integration Test

**Step 1: Start VideoVault locally**

Run: `cd /home/patrick/projects/VideoVault && npm run dev`

**Step 2: Trigger hdd-ext index**

```bash
curl -X POST http://localhost:5100/api/processing/hdd-ext/index -H 'Content-Type: application/json' -d '{"forceReindex": true}'
```

**Step 3: Verify sidecar files were created**

```bash
find /home/patrick/projects/shared-infrastructure/HDD-ext/3_complete -name "metadata.json" | head -5
cat "$(find /home/patrick/projects/shared-infrastructure/HDD-ext/3_complete -name 'metadata.json' -print -quit)"
```

Expected: `metadata.json` files in each video directory with all fields populated, categories initially empty.

**Step 4: Test category persistence survives re-index**

1. Manually edit one `metadata.json` to add a category: `"age": ["teen"]`
2. Re-run index: `curl -X POST http://localhost:5100/api/processing/hdd-ext/index -H 'Content-Type: application/json' -d '{"forceReindex": true}'`
3. Verify the `metadata.json` still has `"age": ["teen"]` (not reset to empty)

**Step 5: Commit final state if any adjustments needed**
