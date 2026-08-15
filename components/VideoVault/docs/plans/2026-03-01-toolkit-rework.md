# VideoVault Toolkit Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the VideoVault toolkit to support decoupled editing (split-pane), universal sidecars via a roots registry, "apply to visible" bulk action, and smart category suggestions with enriched filter values.

**Architecture:** Four independent workstreams that build on a shared foundation. The roots registry (Task 1-2) is the backend foundation — universal sidecars depend on it. The enriched category extractor (Task 3) is standalone. The split-pane editor (Task 5-6) and "apply to visible" (Task 7) are frontend features that plug into existing `useVideoManager` state. Smart suggestions (Task 8) wires the extractor into the editor UI.

**Tech Stack:** React 18, TypeScript, Vite, Express, Drizzle ORM, Tailwind CSS, shadcn/ui, vitest

**Design doc:** `VideoVault/docs/plans/2026-03-01-toolkit-rework-design.md`

---

## Task 1: Roots Registry — Server Module

**Files:**
- Create: `VideoVault/server/lib/roots-registry.ts`
- Create: `VideoVault/server/lib/roots-registry.test.ts`

**Context:** This module maps `rootKey → absolutePath` for sidecar file resolution. It reads from env vars (`MEDIA_ROOTS`, `HDD_EXT_DIR`, `MEDIA_ROOT`) and optionally from the DB `directory_roots` table. The existing `syncVideoSidecar` in `sidecar.ts` hardcodes `MEDIA_ROOT` — this replaces that with a registry lookup.

**Step 1: Write the failing test**

```typescript
// server/lib/roots-registry.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RootsRegistry } from './roots-registry';

describe('RootsRegistry', () => {
  beforeEach(() => {
    // Clear env between tests
    delete process.env.MEDIA_ROOTS;
    delete process.env.HDD_EXT_DIR;
    delete process.env.MEDIA_ROOT;
    RootsRegistry.reset();
  });

  describe('resolveVideoDir', () => {
    it('resolves hdd-ext via HDD_EXT_DIR', () => {
      process.env.HDD_EXT_DIR = '/mnt/hdd-ext';
      RootsRegistry.init();
      const dir = RootsRegistry.resolveVideoDir({ rootKey: 'hdd-ext', path: 'clips/scene.mp4' });
      expect(dir).toBe('/mnt/hdd-ext/clips');
    });

    it('resolves via MEDIA_ROOTS env', () => {
      process.env.MEDIA_ROOTS = 'movies:/mnt/media/movies,hdd-ext:/mnt/hdd-ext';
      RootsRegistry.init();
      const dir = RootsRegistry.resolveVideoDir({ rootKey: 'movies', path: 'action/film.mp4' });
      expect(dir).toBe('/mnt/media/movies/action');
    });

    it('falls back to MEDIA_ROOT for videos without rootKey', () => {
      process.env.MEDIA_ROOT = '/mnt/media';
      RootsRegistry.init();
      const dir = RootsRegistry.resolveVideoDir({ path: 'scenes/video.mp4' });
      expect(dir).toBe('/mnt/media/scenes');
    });

    it('returns null for unresolvable root', () => {
      RootsRegistry.init();
      const dir = RootsRegistry.resolveVideoDir({ rootKey: 'unknown', path: 'video.mp4' });
      expect(dir).toBeNull();
    });

    it('MEDIA_ROOTS takes priority over HDD_EXT_DIR', () => {
      process.env.MEDIA_ROOTS = 'hdd-ext:/custom/path';
      process.env.HDD_EXT_DIR = '/default/hdd-ext';
      RootsRegistry.init();
      const dir = RootsRegistry.resolveVideoDir({ rootKey: 'hdd-ext', path: 'video.mp4' });
      expect(dir).toBe('/custom/path');
    });

    it('handles video in root directory (no subdirectory)', () => {
      process.env.MEDIA_ROOTS = 'movies:/mnt/movies';
      RootsRegistry.init();
      const dir = RootsRegistry.resolveVideoDir({ rootKey: 'movies', path: 'video.mp4' });
      expect(dir).toBe('/mnt/movies');
    });
  });

  describe('registerRoot', () => {
    it('allows dynamic root registration', () => {
      RootsRegistry.init();
      RootsRegistry.registerRoot('custom', '/mnt/custom');
      const dir = RootsRegistry.resolveVideoDir({ rootKey: 'custom', path: 'sub/file.mp4' });
      expect(dir).toBe('/mnt/custom/sub');
    });
  });

  describe('listRoots', () => {
    it('returns all registered roots', () => {
      process.env.MEDIA_ROOTS = 'a:/path/a,b:/path/b';
      RootsRegistry.init();
      expect(RootsRegistry.listRoots()).toEqual({ a: '/path/a', b: '/path/b' });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd VideoVault && npx vitest run server/lib/roots-registry.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Write minimal implementation**

```typescript
// server/lib/roots-registry.ts
import path from 'path';
import { logger } from './logger';

/**
 * Maps rootKey → absolute base path for sidecar file resolution.
 * Reads from env vars on init; supports dynamic registration from DB roots.
 */
export class RootsRegistry {
  private static roots = new Map<string, string>();
  private static fallbackRoot: string | null = null;

  static init(): void {
    this.roots.clear();
    this.fallbackRoot = null;

    // 1. MEDIA_ROOTS env: "movies:/mnt/movies,hdd-ext:/mnt/hdd"
    const mediaRoots = process.env.MEDIA_ROOTS;
    if (mediaRoots) {
      for (const entry of mediaRoots.split(',')) {
        const colonIdx = entry.indexOf(':');
        if (colonIdx > 0) {
          const key = entry.slice(0, colonIdx).trim();
          const absPath = entry.slice(colonIdx + 1).trim();
          if (key && absPath) {
            this.roots.set(key, absPath);
          }
        }
      }
    }

    // 2. HDD_EXT_DIR (only if not already set by MEDIA_ROOTS)
    const hddExtDir = process.env.HDD_EXT_DIR;
    if (hddExtDir && !this.roots.has('hdd-ext')) {
      this.roots.set('hdd-ext', hddExtDir);
    }

    // 3. MEDIA_ROOT as fallback for rootKey-less videos
    const mediaRoot = process.env.MEDIA_ROOT;
    if (mediaRoot) {
      this.fallbackRoot = mediaRoot;
    }

    if (this.roots.size > 0 || this.fallbackRoot) {
      logger.info('[RootsRegistry] Initialized', {
        roots: Object.fromEntries(this.roots),
        fallback: this.fallbackRoot,
      });
    }
  }

  static registerRoot(rootKey: string, absPath: string): void {
    this.roots.set(rootKey, absPath);
  }

  /**
   * Resolve the absolute directory path for a video's sidecar file.
   * Returns null if the root is not registered and no fallback applies.
   */
  static resolveVideoDir(video: { rootKey?: string | null; path: string }): string | null {
    let basePath: string | null = null;

    if (video.rootKey && this.roots.has(video.rootKey)) {
      basePath = this.roots.get(video.rootKey)!;
    } else if (!video.rootKey && this.fallbackRoot) {
      basePath = this.fallbackRoot;
    }

    if (!basePath) return null;

    const videoDir = path.dirname(path.join(basePath, video.path));
    return videoDir;
  }

  static listRoots(): Record<string, string> {
    return Object.fromEntries(this.roots);
  }

  /** Register roots from DB directory_roots table entries */
  static registerFromDb(dbRoots: Array<{ rootKey: string; directories: string[] }>): void {
    for (const root of dbRoots) {
      if (!this.roots.has(root.rootKey) && root.directories.length > 0) {
        this.roots.set(root.rootKey, root.directories[0]);
      }
    }
  }

  static reset(): void {
    this.roots.clear();
    this.fallbackRoot = null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd VideoVault && npx vitest run server/lib/roots-registry.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add VideoVault/server/lib/roots-registry.ts VideoVault/server/lib/roots-registry.test.ts
git commit -m "feat(videovault): add roots registry for universal sidecar resolution"
```

---

## Task 2: Integrate Roots Registry into Sidecar System

**Files:**
- Modify: `VideoVault/server/lib/sidecar.ts:61-87` (refactor `syncVideoSidecar`)
- Modify: `VideoVault/server/routes/persistence.ts:91-97` (extend sidecar writes beyond hdd-ext)
- Modify: `VideoVault/server/routes/persistence.ts:127-131` (extend `patchVideo` sidecar writes)
- Modify: `VideoVault/server/index.ts` (init registry on startup)

**Context:** Currently `syncVideoSidecar` hardcodes `MEDIA_ROOT`, and `bulkUpsertVideos` only writes sidecars for `rootKey === 'hdd-ext'`. We need to use the registry for path resolution and write sidecars for ALL videos with a resolvable root.

**Step 1: Write the failing test**

Add to existing `VideoVault/server/lib/sidecar.test.ts`:

```typescript
import { RootsRegistry } from './roots-registry';

describe('syncVideoSidecar with RootsRegistry', () => {
  beforeEach(() => {
    RootsRegistry.reset();
  });

  it('writes sidecar using registry resolution', async () => {
    RootsRegistry.init();
    RootsRegistry.registerRoot('movies', '/tmp/test-movies');

    // Create the target directory
    await fs.mkdir('/tmp/test-movies/scene', { recursive: true });

    await syncVideoSidecar({
      id: 'test-1',
      filename: 'test.mp4',
      displayName: 'Test Video',
      path: 'scene/test.mp4',
      rootKey: 'movies',
      size: 1000,
      lastModified: new Date(),
      metadata: { duration: 60, width: 1920, height: 1080, bitrate: 5000, codec: 'h264', fps: 30, aspectRatio: '16:9' },
      categories: { age: ['milf'], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: ['1080p'], performer: [] },
      customCategories: {},
    });

    const written = await fs.readFile('/tmp/test-movies/scene/metadata.json', 'utf-8');
    const data = JSON.parse(written);
    expect(data.categories.age).toEqual(['milf']);

    // Cleanup
    await fs.rm('/tmp/test-movies', { recursive: true });
  });

  it('silently skips when root is unresolvable', async () => {
    RootsRegistry.init(); // No roots registered

    // Should not throw
    await syncVideoSidecar({
      id: 'test-2',
      filename: 'test.mp4',
      displayName: 'Test',
      path: 'unknown/test.mp4',
      rootKey: 'nonexistent',
      size: 1000,
      lastModified: new Date(),
      metadata: {},
      categories: {},
      customCategories: {},
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd VideoVault && npx vitest run server/lib/sidecar.test.ts`
Expected: FAIL — `syncVideoSidecar` doesn't accept `rootKey`, still uses `MEDIA_ROOT`

**Step 3: Refactor `syncVideoSidecar` to use roots registry**

In `sidecar.ts`, change `syncVideoSidecar` to:

```typescript
export async function syncVideoSidecar(video: {
  id: string;
  filename: string;
  displayName: string;
  path: string;
  rootKey?: string | null;
  size: number | bigint;
  lastModified: Date | string;
  metadata: any;
  categories: any;
  customCategories: any;
}): Promise<void> {
  const videoDir = RootsRegistry.resolveVideoDir({ rootKey: video.rootKey, path: video.path });
  if (!videoDir) {
    // Fallback: try legacy MEDIA_ROOT approach
    const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
    const legacyDir = path.dirname(path.join(MEDIA_ROOT, video.path));
    // Only use legacy if video has no rootKey (backwards compat)
    if (!video.rootKey) {
      const existing = await readSidecar(legacyDir);
      await writeSidecar(legacyDir, {
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
      return;
    }
    // Unresolvable root — skip silently
    logger.debug(`[Sidecar] Skipping unresolvable root: ${video.rootKey} for ${video.path}`);
    return;
  }

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

Add import at top of `sidecar.ts`:
```typescript
import { RootsRegistry } from './roots-registry';
```

**Step 4: Update `bulkUpsertVideos` in `persistence.ts`**

Replace lines 91-97:
```typescript
// OLD: Only hdd-ext
const hddExtRows = rows.filter((r) => r.rootKey === 'hdd-ext');

// NEW: All videos with any rootKey (registry handles resolution + graceful skip)
const sidecarRows = rows.filter((r) => r.rootKey);
if (sidecarRows.length > 0) {
  await Promise.all(
    sidecarRows.map((row) => syncVideoSidecar(row as any)),
  );
}
```

Similarly update `patchVideo` (line 129):
```typescript
// OLD: if (updated.rootKey === 'hdd-ext')
// NEW: write sidecar for any video with a rootKey
if (updated.rootKey) {
  await syncVideoSidecar(updated as any);
}
```

**Step 5: Init registry on server startup**

In `VideoVault/server/index.ts`, add near the top (after imports):
```typescript
import { RootsRegistry } from './lib/roots-registry';
RootsRegistry.init();
```

And after DB is available, hydrate from DB roots:
```typescript
// After db is initialized
if (db) {
  const dbRoots = await db.select().from(directoryRoots);
  RootsRegistry.registerFromDb(dbRoots);
}
```

**Step 6: Run tests**

Run: `cd VideoVault && npx vitest run server/lib/sidecar.test.ts server/lib/roots-registry.test.ts`
Expected: All PASS

**Step 7: Commit**

```bash
git add VideoVault/server/lib/sidecar.ts VideoVault/server/routes/persistence.ts VideoVault/server/index.ts
git commit -m "feat(videovault): integrate roots registry into sidecar system for universal metadata.json"
```

---

## Task 3: Enrich CategoryExtractor Patterns

**Files:**
- Modify: `VideoVault/client/src/services/category-extractor.ts:7-88`
- Create method: `CategoryExtractor.extractFromPath()`
- Test: `VideoVault/client/src/services/category-extractor.test.ts` (create if not exists)

**Context:** The current `CATEGORY_PATTERNS` has ~80 values across 8 types. We're roughly tripling the vocabulary and adding directory-path extraction.

**Step 1: Write failing tests for new patterns**

```typescript
// category-extractor.test.ts
import { describe, it, expect } from 'vitest';
import { CategoryExtractor } from './category-extractor';

describe('CategoryExtractor', () => {
  describe('enriched patterns', () => {
    it('detects new age values', () => {
      const cats = CategoryExtractor.extractCategories('granny teaches college student.mp4');
      expect(cats.age).toContain('granny');
      expect(cats.age).toContain('college');
    });

    it('detects new physical values', () => {
      const cats = CategoryExtractor.extractCategories('tattooed pierced girl scene.mp4');
      expect(cats.physical).toContain('tattooed');
      expect(cats.physical).toContain('pierced');
    });

    it('detects new ethnicity values', () => {
      const cats = CategoryExtractor.extractCategories('thai-brazilian-mixed-beauty.mp4');
      expect(cats.ethnicity).toContain('thai');
      expect(cats.ethnicity).toContain('brazilian');
      expect(cats.ethnicity).toContain('mixed');
    });

    it('detects new relationship values', () => {
      const cats = CategoryExtractor.extractCategories('boss and secretary roommate.mp4');
      expect(cats.relationship).toContain('boss');
      expect(cats.relationship).toContain('roommate');
    });

    it('detects new acts values', () => {
      const cats = CategoryExtractor.extractCategories('deepthroat-bdsm-bondage-roleplay.mp4');
      expect(cats.acts).toContain('deepthroat');
      expect(cats.acts).toContain('bdsm');
      expect(cats.acts).toContain('bondage');
      expect(cats.acts).toContain('roleplay');
    });

    it('detects new setting values', () => {
      const cats = CategoryExtractor.extractCategories('gym sauna jacuzzi scene.mp4');
      expect(cats.setting).toContain('gym');
      expect(cats.setting).toContain('sauna');
      expect(cats.setting).toContain('jacuzzi');
    });

    it('detects new quality values', () => {
      const cats = CategoryExtractor.extractCategories('scene 8k 60fps hdr.mp4');
      expect(cats.quality).toContain('8k');
      expect(cats.quality).toContain('60fps');
      expect(cats.quality).toContain('hdr');
    });
  });

  describe('extractFromPath', () => {
    it('extracts categories from directory path segments', () => {
      const cats = CategoryExtractor.extractFromPath('/hdd-ext/outdoor/blonde-milf/scene.mp4');
      expect(cats.setting).toContain('outdoor');
      expect(cats.physical).toContain('blonde');
      expect(cats.age).toContain('milf');
    });

    it('extracts performer names from path', () => {
      const cats = CategoryExtractor.extractFromPath('/hdd-ext/Performers/Jane Doe/scene.mp4');
      expect(cats.performer).toContain('jane doe');
    });

    it('returns empty categories for root-level files', () => {
      const cats = CategoryExtractor.extractFromPath('scene.mp4');
      const allValues = Object.values(cats).flat();
      expect(allValues).toHaveLength(0);
    });
  });

  describe('getSuggestions', () => {
    it('combines filename and path extraction', () => {
      const suggestions = CategoryExtractor.getSuggestions(
        'deepthroat scene.mp4',
        '/hdd-ext/outdoor/video/',
      );
      expect(suggestions.acts).toContain('deepthroat');
      expect(suggestions.setting).toContain('outdoor');
    });

    it('deduplicates across sources', () => {
      const suggestions = CategoryExtractor.getSuggestions(
        'outdoor scene.mp4',
        '/hdd-ext/outdoor/',
      );
      // 'outdoor' should appear only once
      expect(suggestions.setting.filter((v: string) => v === 'outdoor')).toHaveLength(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd VideoVault && npx vitest run client/src/services/category-extractor.test.ts`
Expected: FAIL — new patterns not recognized, `extractFromPath`/`getSuggestions` don't exist

**Step 3: Implement enriched patterns and new methods**

Update `CATEGORY_PATTERNS` in `category-extractor.ts` with all new values from the design doc. Add `extractFromPath()` and `getSuggestions()` static methods.

Key implementation details:
- `extractFromPath` splits the path by `/` and `\`, then runs each segment through the same pattern matching
- For performer extraction from paths: look for segments that are 2+ words with capitalized first letters (e.g., "Jane Doe")
- `getSuggestions(filename, dirPath)` calls both `extractCategories` and `extractFromPath`, then merges + deduplicates

**Step 4: Run test to verify it passes**

Run: `cd VideoVault && npx vitest run client/src/services/category-extractor.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add VideoVault/client/src/services/category-extractor.ts VideoVault/client/src/services/category-extractor.test.ts
git commit -m "feat(videovault): enrich category patterns and add path-based extraction"
```

---

## Task 4: ffprobe Quality Auto-Detection

**Files:**
- Modify: `VideoVault/server/handlers/movie-handler.ts:109-160` (after `extractMovieMetadata`)
- Test: Add to existing movie-handler tests or inline test

**Context:** After ffprobe extracts resolution/fps, we should auto-populate quality categories. This runs server-side during indexing/processing.

**Step 1: Add quality detection function**

```typescript
// In movie-handler.ts, after extractMovieMetadata function
export function detectQualityCategories(metadata: { width: number; height: number; fps: number }): string[] {
  const qualities: string[] = [];
  const { width, height, fps } = metadata;
  const maxDim = Math.max(width, height);

  if (maxDim >= 7680) qualities.push('8k');
  else if (maxDim >= 3840) qualities.push('4k');
  else if (maxDim >= 2560) qualities.push('2k');
  else if (maxDim >= 1920) qualities.push('1080p');
  else if (maxDim >= 1280) qualities.push('720p');
  else if (maxDim > 0) qualities.push('480p');

  if (fps >= 50) qualities.push('60fps');

  return qualities;
}
```

**Step 2: Wire into hdd-ext/index route**

In `VideoVault/server/routes/processing.ts`, after ffprobe metadata extraction during indexing, merge quality categories:

```typescript
// After: const metadata = await extractMovieMetadata(videoPath);
const autoQualities = detectQualityCategories(metadata);
const mergedCategories = {
  ...(sidecarData?.categories || {}),
  quality: [...new Set([...(sidecarData?.categories?.quality || []), ...autoQualities])],
};
```

**Step 3: Test manually or add unit test**

```typescript
import { detectQualityCategories } from './movie-handler';

describe('detectQualityCategories', () => {
  it('detects 4k', () => {
    expect(detectQualityCategories({ width: 3840, height: 2160, fps: 30 })).toContain('4k');
  });
  it('detects 1080p + 60fps', () => {
    const q = detectQualityCategories({ width: 1920, height: 1080, fps: 60 });
    expect(q).toContain('1080p');
    expect(q).toContain('60fps');
  });
  it('handles zero dimensions', () => {
    expect(detectQualityCategories({ width: 0, height: 0, fps: 0 })).toEqual([]);
  });
});
```

**Step 4: Run test**

Run: `cd VideoVault && npx vitest run server/handlers/movie-handler.test.ts` (or whichever test file)
Expected: PASS

**Step 5: Commit**

```bash
git add VideoVault/server/handlers/movie-handler.ts VideoVault/server/routes/processing.ts
git commit -m "feat(videovault): auto-detect quality categories from ffprobe metadata"
```

---

## Task 5: Split-Pane Editor — State & Hook

**Files:**
- Modify: `VideoVault/client/src/types/video.ts:79-104` (add `pinnedVideoId` to `VideoManagerState`)
- Modify: `VideoVault/client/src/hooks/use-video-manager.ts:59-74` (add initial state)
- Modify: `VideoVault/client/src/hooks/use-video-manager.ts:1660-1700` (add pin/unpin actions)

**Context:** The split-pane editor needs `pinnedVideoId` in state and `pinVideo`/`unpinVideo` actions. The `useFocusMode` hook will be reused by the `SplitPaneEditor` component for pending-edit state.

**Step 1: Add `pinnedVideoId` to state type**

In `video.ts`, add to the first `VideoManagerState` interface (after line 101, after `knownTags`):

```typescript
pinnedVideoId: string | null;
```

**Step 2: Add initial state value**

In `use-video-manager.ts`, add to `useState` initial value (after line 73, `knownTags: []`):

```typescript
pinnedVideoId: null,
```

**Step 3: Add pin/unpin actions**

In `use-video-manager.ts`, add two callbacks (near the other `useCallback` definitions, around line 524):

```typescript
const pinVideo = useCallback((videoId: string) => {
  setState((prev) => ({ ...prev, pinnedVideoId: videoId }));
}, []);

const unpinVideo = useCallback(() => {
  setState((prev) => ({ ...prev, pinnedVideoId: null }));
}, []);
```

**Step 4: Register actions in the actions object**

In `use-video-manager.ts` at the actions object (line 1660+), add:

```typescript
pinVideo,
unpinVideo,
```

**Step 5: Commit**

```bash
git add VideoVault/client/src/types/video.ts VideoVault/client/src/hooks/use-video-manager.ts
git commit -m "feat(videovault): add pinnedVideoId state and pin/unpin actions"
```

---

## Task 6: Split-Pane Editor — Component & Layout Integration

**Files:**
- Create: `VideoVault/client/src/components/video/split-pane-editor.tsx`
- Modify: `VideoVault/client/src/pages/home.tsx:478-602` (layout integration)
- Modify: `VideoVault/client/src/components/video/video-card.tsx:17-33` (add `onPin` prop)

**Context:** The `SplitPaneEditor` component renders in the home page beside `MainContent` when a video is pinned. It uses the `useFocusMode` hook for pending-edit state. The `VideoCard` gets a new "Pin" button.

**Step 1: Create `SplitPaneEditor` component**

```tsx
// client/src/components/video/split-pane-editor.tsx
import { useFocusMode } from '@/hooks/use-focus-mode';
import { Video, VideoCategories, CustomCategories, Category } from '@/types/video';
import { VideoTagsEditor } from './video-tags-editor';
import { Button } from '@/components/ui/button';
import { X, Save, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CategoryExtractor } from '@/services/category-extractor';
import { getThumbnailSrc } from '@/lib/video-urls';
import { cn } from '@/lib/utils';

interface SplitPaneEditorProps {
  videos: Video[];
  filteredVideos: Video[];
  pinnedVideoId: string;
  availableCategories: Category[];
  onUpdateCategories: (
    videoId: string,
    categories: Partial<{ categories: VideoCategories; customCategories: CustomCategories }>,
  ) => void;
  onRename: (
    videoId: string,
    newBaseName: string,
    applyTo: 'displayName' | 'filename' | 'both',
  ) => Promise<{ success: boolean; message?: string }>;
  onClose: () => void;
}

export function SplitPaneEditor({
  videos,
  filteredVideos,
  pinnedVideoId,
  availableCategories,
  onUpdateCategories,
  onRename,
  onClose,
}: SplitPaneEditorProps) {
  const focusMode = useFocusMode({
    videos,
    filteredVideos,
    availableCategories,
    initialVideoId: pinnedVideoId,
    onUpdateCategories,
    onRename,
  });

  const video = focusMode.state.video;
  if (!video) return null;

  // Generate suggestions from filename + path
  const suggestions = CategoryExtractor.getSuggestions(video.filename, video.path);

  const handleSave = async () => {
    await focusMode.save();
  };

  return (
    <div className="w-[350px] flex-shrink-0 border-l bg-card flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          {focusMode.state.isDirty && (
            <Badge variant="outline" className="text-xs text-amber-500 border-amber-500">
              Unsaved
            </Badge>
          )}
          <span className="text-sm font-medium truncate">{video.displayName}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Thumbnail */}
      <div className="px-3 pt-3">
        <img
          src={getThumbnailSrc(video)}
          alt={video.displayName}
          className="w-full aspect-video object-cover rounded-md bg-muted"
        />
      </div>

      {/* Tag Editor (scrollable) */}
      <div className="flex-1 overflow-y-auto p-3">
        <VideoTagsEditor
          video={{
            ...video,
            categories: focusMode.state.pendingCategories,
            customCategories: focusMode.state.pendingCustomCategories,
          }}
          availableCategories={availableCategories}
          onSave={(id, cats) => {
            // Apply categories via focus mode's pending state, then save
            if (cats.categories) {
              Object.entries(cats.categories).forEach(([type, values]) => {
                // Clear existing and re-add
                const existing = focusMode.state.pendingCategories[type as keyof VideoCategories] || [];
                existing.forEach((v) => focusMode.removeCategory(type, v));
                (values as string[]).forEach((v) => focusMode.addCategory(type, v));
              });
            }
            void handleSave();
          }}
          onRemoveCategory={(_, type, value) => focusMode.removeCategory(type, value)}
          onCancel={onClose}
          suggestions={suggestions}
        />
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 p-3 border-t">
        <Button
          variant="default"
          size="sm"
          onClick={() => void handleSave()}
          disabled={!focusMode.state.isDirty || focusMode.state.isLoading}
          className="flex-1"
        >
          <Save className="h-4 w-4 mr-1" /> Save
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={focusMode.discard}
          disabled={!focusMode.state.isDirty}
        >
          <Undo2 className="h-4 w-4 mr-1" /> Discard
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Update `home.tsx` layout**

In `home.tsx`, wrap `MainContent` and `SplitPaneEditor` in the flex container (around line 523):

```tsx
<div className="flex flex-1 min-h-0">
  <Sidebar ... />

  <MainContent ... />

  {/* Split-pane editor */}
  {state.pinnedVideoId && (
    <SplitPaneEditor
      videos={state.videos}
      filteredVideos={state.filteredVideos}
      pinnedVideoId={state.pinnedVideoId}
      availableCategories={state.availableCategories}
      onUpdateCategories={actions.updateVideoCategories}
      onRename={actions.renameVideo}
      onClose={() => actions.unpinVideo()}
    />
  )}
</div>
```

Import `SplitPaneEditor` at top of `home.tsx`:
```typescript
import { SplitPaneEditor } from '@/components/video/split-pane-editor';
```

**Step 3: Add `onPin` to `VideoCard`**

Add `onPin?: (video: Video) => void;` to `VideoCardProps` interface.

Add a pin button to the card's action buttons area (alongside Edit tags, Split, Rename, etc.):

```tsx
{onPin && (
  <Button variant="ghost" size="icon" onClick={() => onPin(video)} title="Pin to editor">
    <Pin className="h-4 w-4" />
  </Button>
)}
```

Import `Pin` from lucide-react.

**Step 4: Wire `onPin` in `home.tsx` `MainContent`**

Add to `MainContent` props:
```tsx
onPin={(video: Video) => actions.pinVideo(video.id)}
```

Note: `MainContent` needs to pass `onPin` through to `VideoCard`. Check `main-content.tsx` and update the prop drilling accordingly.

**Step 5: Commit**

```bash
git add VideoVault/client/src/components/video/split-pane-editor.tsx VideoVault/client/src/pages/home.tsx VideoVault/client/src/components/video/video-card.tsx VideoVault/client/src/components/layout/main-content.tsx
git commit -m "feat(videovault): add split-pane editor component with pin/unpin on video cards"
```

---

## Task 7: "Apply to Visible" Bulk Action

**Files:**
- Create: `VideoVault/client/src/components/bulk/apply-to-visible.tsx`
- Modify: `VideoVault/client/src/hooks/use-video-manager.ts` (add `applyToVisible` action)
- Modify: `VideoVault/client/src/pages/home.tsx` (wire into header)
- Modify: `VideoVault/client/src/components/layout/header.tsx` (add button + prop)

**Context:** A toolbar button in the header opens a popover where users pick a category type + value, then apply it to all currently filtered videos with a confirmation count.

**Step 1: Add `applyToVisible` action to `useVideoManager`**

```typescript
const applyToVisible = useCallback(
  (categoryType: string, categoryValue: string, mode: 'add' | 'remove', isCustom = false) => {
    const targetVideos = state.filteredVideos;
    if (targetVideos.length === 0) return;

    let updatedVideos = [...state.videos];

    for (const video of targetVideos) {
      if (mode === 'add') {
        updatedVideos = VideoDatabase.addCategoryToVideo(
          updatedVideos,
          video.id,
          categoryType,
          categoryValue,
          isCustom,
        );
      } else {
        updatedVideos = VideoDatabase.removeCategory(
          updatedVideos,
          video.id,
          categoryType,
          categoryValue,
        );
      }
    }

    // Update search index for all affected videos
    for (const video of targetVideos) {
      const updated = updatedVideos.find((v) => v.id === video.id);
      if (updated) EnhancedFilterEngine.updateVideoInSearchIndex(updated);
    }

    setState((prev) => ({ ...prev, videos: updatedVideos }));
  },
  [state.videos, state.filteredVideos],
);
```

Note: `VideoDatabase.addCategoryToVideo` may not exist — check if `updateVideoCategories` can be used instead. If not, this is a simple helper that adds a value to the category array with dedup + normalization.

**Step 2: Register in actions object**

Add `applyToVisible` to the actions map at line 1660+.

**Step 3: Create `ApplyToVisible` popover component**

```tsx
// client/src/components/bulk/apply-to-visible.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tags } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const CATEGORY_TYPES = ['age', 'physical', 'ethnicity', 'relationship', 'acts', 'setting', 'quality', 'performer'];

interface ApplyToVisibleProps {
  filteredCount: number;
  onApply: (type: string, value: string, mode: 'add' | 'remove') => void;
  availableCategories: Array<{ type: string; value: string; count: number; isCustom: boolean }>;
}

export function ApplyToVisible({ filteredCount, onApply, availableCategories }: ApplyToVisibleProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [type, setType] = useState('');
  const [value, setValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Get existing values for autocomplete
  const existingValues = availableCategories
    .filter((c) => c.type === type && !c.isCustom)
    .map((c) => c.value)
    .slice(0, 20);

  const handleApply = () => {
    if (!type || !value.trim()) return;
    if (filteredCount > 50) {
      setConfirmOpen(true);
    } else {
      doApply();
    }
  };

  const doApply = () => {
    onApply(type, value.trim().toLowerCase(), mode);
    setOpen(false);
    setType('');
    setValue('');
    setConfirmOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={filteredCount === 0}>
            <Tags className="h-4 w-4 mr-1" />
            Apply to Visible
            {filteredCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{filteredCount}</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3">
          {/* Mode toggle */}
          <div className="flex gap-1">
            <Button
              variant={mode === 'add' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('add')}
              className="flex-1"
            >
              Add
            </Button>
            <Button
              variant={mode === 'remove' ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => setMode('remove')}
              className="flex-1"
            >
              Remove
            </Button>
          </div>

          {/* Category type */}
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue placeholder="Category type..." />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Value input with datalist suggestions */}
          <div>
            <Input
              placeholder="Value..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              list="category-values"
            />
            <datalist id="category-values">
              {existingValues.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          {/* Apply button with count */}
          <Button
            onClick={handleApply}
            disabled={!type || !value.trim()}
            className="w-full"
          >
            {mode === 'add' ? 'Apply' : 'Remove from'} {filteredCount} videos
          </Button>
        </PopoverContent>
      </Popover>

      {/* Confirmation for large operations */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm bulk operation</AlertDialogTitle>
            <AlertDialogDescription>
              This will {mode === 'add' ? 'add' : 'remove'} "{type}: {value}" {mode === 'add' ? 'to' : 'from'}{' '}
              <strong>{filteredCount}</strong> videos. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doApply}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

**Step 4: Add to header**

In `header.tsx`, add `onApplyToVisible` and related props to `HeaderProps`:
```typescript
onApplyToVisible?: (type: string, value: string, mode: 'add' | 'remove') => void;
filteredCount?: number;
availableCategories?: Array<{ type: string; value: string; count: number; isCustom: boolean }>;
```

Render `ApplyToVisible` in the header next to existing buttons.

**Step 5: Wire in `home.tsx`**

Pass props to `Header`:
```tsx
onApplyToVisible={(type, value, mode) => actions.applyToVisible(type, value, mode)}
filteredCount={state.filteredVideos.length}
availableCategories={state.availableCategories}
```

**Step 6: Commit**

```bash
git add VideoVault/client/src/components/bulk/apply-to-visible.tsx VideoVault/client/src/hooks/use-video-manager.ts VideoVault/client/src/components/layout/header.tsx VideoVault/client/src/pages/home.tsx
git commit -m "feat(videovault): add 'Apply to Visible' bulk category action"
```

---

## Task 8: Smart Suggestions in Tag Editors

**Files:**
- Modify: `VideoVault/client/src/components/video/video-tags-editor.tsx` (add suggestions prop + UI)
- Modify: `VideoVault/client/src/components/video/edit-tags-modal.tsx` (pass suggestions)
- Already done: `split-pane-editor.tsx` passes suggestions (Task 6)

**Context:** The `VideoTagsEditor` component (used by both `EditTagsModal` and `SplitPaneEditor`) should accept an optional `suggestions` prop and render them as ghost chips that can be clicked to accept.

**Step 1: Read `video-tags-editor.tsx` to understand its interface**

Read the component to find where categories are rendered and identify the right insertion point for suggestion chips.

**Step 2: Add `suggestions` prop**

```typescript
interface VideoTagsEditorProps {
  // ... existing props
  suggestions?: Record<string, string[]>; // type -> suggested values
}
```

**Step 3: Render suggestion chips**

For each category type section, after the existing tag chips, render suggestions that aren't already applied:

```tsx
{/* Suggestions */}
{suggestions?.[type]?.filter(
  (s) => !currentValues.includes(s.toLowerCase())
).map((suggestion) => (
  <Badge
    key={`suggest-${suggestion}`}
    variant="outline"
    className="cursor-pointer opacity-50 hover:opacity-100 border-dashed"
    onClick={() => onAddCategory(type, suggestion)}
  >
    + {suggestion}
  </Badge>
))}
```

**Step 4: Wire suggestions in `EditTagsModal`**

```tsx
import { CategoryExtractor } from '@/services/category-extractor';

// Inside the component:
const suggestions = video ? CategoryExtractor.getSuggestions(video.filename, video.path) : {};

<VideoTagsEditor
  ...
  suggestions={suggestions}
/>
```

**Step 5: Commit**

```bash
git add VideoVault/client/src/components/video/video-tags-editor.tsx VideoVault/client/src/components/video/edit-tags-modal.tsx
git commit -m "feat(videovault): show smart category suggestions in tag editors"
```

---

## Task 9: Integration Testing & Cleanup

**Files:**
- Run all existing tests to ensure no regressions
- Manual testing checklist

**Step 1: Run type checking**

Run: `cd VideoVault && npm run check`
Expected: No type errors

**Step 2: Run unit tests**

Run: `cd VideoVault && npm run test:quick`
Expected: All pass

**Step 3: Run server tests**

Run: `cd VideoVault && npm run test:server`
Expected: All pass

**Step 4: Manual smoke test checklist**

- [ ] Pin a video from the grid → split pane opens
- [ ] Edit tags in split pane → save → verify sidecar written
- [ ] Unpin → split pane closes
- [ ] Filter grid → "Apply to Visible" → confirm → categories applied
- [ ] Check metadata.json written for non-hdd-ext videos (requires MEDIA_ROOTS configured)
- [ ] Suggestion chips appear in tag editors based on filename
- [ ] Focus mode still works independently

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore(videovault): integration fixes and cleanup for toolkit rework"
```
