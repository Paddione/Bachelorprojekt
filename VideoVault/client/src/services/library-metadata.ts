import { z } from 'zod';
import { Video, FilterPreset } from '@/types/video';
import { VideoDatabase } from './video-database';
import { DirectoryDatabase, type DirectoryRootsState } from './directory-database';
import { FilterPresetsService } from './filter-presets';
import { WatchStateService, type WatchStatesByRoot } from './watch-state-service';

const defaultMetadata = {
  duration: 0,
  width: 0,
  height: 0,
  bitrate: 0,
  codec: '',
  fps: 0,
  aspectRatio: '',
};

const coerceNonNegative = () => z.coerce.number().nonnegative().optional();

const videoMetadataSchema = z
  .object({
    duration: coerceNonNegative(),
    width: coerceNonNegative(),
    height: coerceNonNegative(),
    bitrate: coerceNonNegative(),
    codec: z.string().optional(),
    fps: coerceNonNegative(),
    aspectRatio: z.string().optional(),
  })
  .partial()
  .transform((value) => ({ ...defaultMetadata, ...value }));

const defaultCategories = {
  age: [] as string[],
  physical: [] as string[],
  ethnicity: [] as string[],
  relationship: [] as string[],
  acts: [] as string[],
  setting: [] as string[],
  quality: [] as string[],
  performer: [] as string[],
};

const videoCategoriesSchema = z
  .object({
    age: z.array(z.string()).optional(),
    physical: z.array(z.string()).optional(),
    ethnicity: z.array(z.string()).optional(),
    relationship: z.array(z.string()).optional(),
    acts: z.array(z.string()).optional(),
    setting: z.array(z.string()).optional(),
    quality: z.array(z.string()).optional(),
    performer: z.array(z.string()).optional(),
  })
  .partial()
  .transform((value) => ({ ...defaultCategories, ...value }));

const thumbnailSchema = z
  .object({
    dataUrl: z.string().optional(),
    generated: z.boolean().optional(),
    timestamp: z.string().optional(),
  })
  .partial()
  .transform((value) => ({
    dataUrl: value.dataUrl ?? '',
    generated: value.generated ?? false,
    timestamp: value.timestamp ?? '',
  }));

const videoSchema = z
  .object({
    id: z.string(),
    filename: z.string(),
    displayName: z.string(),
    path: z.string(),
    size: z.coerce.number().nonnegative(),
    lastModified: z.string(),
    categories: videoCategoriesSchema.default(defaultCategories),
    customCategories: z.record(z.string(), z.array(z.string())).default({}),
    metadata: videoMetadataSchema.default(defaultMetadata),
    thumbnail: thumbnailSchema.default({ dataUrl: '', generated: false, timestamp: '' }),
    rootKey: z.string().nullable().optional(),
  })
  .passthrough();

const filterPresetSchema = z
  .object({
    name: z.string(),
    categories: z.array(z.string()).default([]),
    searchQuery: z.string().default(''),
    dateRange: z
      .object({
        startDate: z.string().default(''),
        endDate: z.string().default(''),
      })
      .default({ startDate: '', endDate: '' }),
    fileSizeRange: z
      .object({
        min: z.coerce.number().nonnegative().default(0),
        max: z.coerce.number().nonnegative().default(0),
      })
      .default({ min: 0, max: 0 }),
    durationRange: z
      .object({
        min: z.coerce.number().nonnegative().default(0),
        max: z.coerce.number().nonnegative().default(0),
      })
      .default({ min: 0, max: 0 }),
    createdAt: z.string().default(() => new Date().toISOString()),
    updatedAt: z.string().default(() => new Date().toISOString()),
  })
  .passthrough();

const directoryRootsSchema = z
  .object({
    lastRootKey: z.string().nullable().optional(),
    roots: z
      .record(
        z.object({
          name: z.string().optional(),
          directories: z.array(z.string()).default([]),
        }),
      )
      .default({}),
  })
  .default({ lastRootKey: null, roots: {} });

const watchStatesSchema = z
  .record(
    z.record(
      z.object({
        position: z.coerce.number().nonnegative(),
        duration: z.coerce.number().nonnegative().optional(),
        completed: z.boolean().optional(),
        updatedAt: z.string().optional(),
      }),
    ),
  )
  .default({});

const libraryExportSchema = z
  .object({
    version: z.string().default('2.0'),
    exportDate: z.string(),
    videos: z.array(videoSchema),
    totalVideos: z.number().optional(),
    directoryRoots: directoryRootsSchema.default({ lastRootKey: null, roots: {} }),
    filterPresets: z.array(filterPresetSchema).default([]),
    watchStates: watchStatesSchema.default({}),
  })
  .passthrough();

export type LibraryExportSnapshot = z.infer<typeof libraryExportSchema>;

export interface LibraryExportResult {
  snapshot: LibraryExportSnapshot;
  fileName: string;
  mode: 'streamed' | 'blob';
  bytesWritten: number;
  blob?: Blob;
}

export interface LibraryImportResult {
  videos: Video[];
  presets: FilterPreset[];
  directoryRoots: DirectoryRootsState;
  watchStates: WatchStatesByRoot;
}

export class LibraryMetadataService {
  static buildSnapshot(input: {
    videos: Video[];
    directoryState: DirectoryRootsState;
    filterPresets: FilterPreset[];
    watchStates: WatchStatesByRoot;
    version?: string;
  }): LibraryExportSnapshot {
    const sanitizedVideos = VideoDatabase.prepareVideosForExport(input.videos);
    const snapshot = {
      version: input.version || '2.0',
      exportDate: new Date().toISOString(),
      videos: sanitizedVideos,
      totalVideos: sanitizedVideos.length,
      directoryRoots: input.directoryState || { lastRootKey: null, roots: {} },
      filterPresets: input.filterPresets || [],
      watchStates: input.watchStates || {},
    };
    return this.validateSnapshot(snapshot);
  }

  static serializeSnapshot(snapshot: LibraryExportSnapshot): string {
    const normalized = this.validateSnapshot(snapshot);
    return JSON.stringify(normalized, null, 2);
  }

  private static normalizeDirectoryRoots(
    raw: LibraryExportSnapshot['directoryRoots'],
  ): DirectoryRootsState {
    const incoming = raw || { lastRootKey: null, roots: {} };
    const roots: DirectoryRootsState['roots'] = {};
    Object.entries(incoming.roots || {}).forEach(([rootKey, value]) => {
      const dirs = Array.from(
        new Set((value?.directories || []).map((d) => DirectoryDatabase.normalizeDir(d))),
      );
      roots[rootKey] = { name: value?.name || rootKey, directories: dirs };
    });
    return { lastRootKey: incoming.lastRootKey ?? null, roots };
  }

  private static validateSnapshot(input: any): LibraryExportSnapshot {
    const validated = libraryExportSchema.parse(input);
    return {
      ...validated,
      totalVideos: validated.totalVideos ?? validated.videos.length,
      directoryRoots: this.normalizeDirectoryRoots(validated.directoryRoots),
      filterPresets: validated.filterPresets || [],
      watchStates: validated.watchStates || {},
    };
  }

  static parse(jsonData: string): LibraryExportSnapshot {
    let parsed: any;
    try {
      parsed = JSON.parse(jsonData);
    } catch (err) {
      throw new Error('Invalid JSON payload');
    }

    const normalizedInput = Array.isArray(parsed)
      ? { version: '1.0', exportDate: new Date().toISOString(), videos: parsed }
      : {
          version: typeof parsed?.version === 'string' ? parsed.version : '1.0',
          exportDate: parsed?.exportDate || new Date().toISOString(),
          ...parsed,
        };

    try {
      return this.validateSnapshot(normalizedInput);
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new Error('Invalid library export format');
      }
      throw err;
    }
  }

  private static async writeSnapshotChunks(
    snapshot: LibraryExportSnapshot,
    write: (chunk: string) => Promise<void>,
  ): Promise<number> {
    const encoder = new TextEncoder();
    let bytesWritten = 0;
    const push = async (text: string) => {
      bytesWritten += encoder.encode(text).byteLength;
      await write(text);
    };

    await push('{');
    await push(`"version":${JSON.stringify(snapshot.version)},`);
    await push(`"exportDate":${JSON.stringify(snapshot.exportDate)},`);
    await push(`"directoryRoots":${JSON.stringify(snapshot.directoryRoots)},`);
    await push(`"filterPresets":${JSON.stringify(snapshot.filterPresets)},`);
    await push(`"watchStates":${JSON.stringify(snapshot.watchStates)},`);
    await push(`"videos":[`);
    for (let i = 0; i < snapshot.videos.length; i++) {
      await push(JSON.stringify(snapshot.videos[i]));
      if (i < snapshot.videos.length - 1) {
        await push(',');
      }
    }
    await push(`],"totalVideos":${snapshot.videos.length}}`);

    return bytesWritten;
  }

  static async streamSnapshotToHandle(
    snapshot: LibraryExportSnapshot,
    fileHandle: FileSystemFileHandle,
  ): Promise<number> {
    const writable = await fileHandle.createWritable();
    try {
      const bytes = await this.writeSnapshotChunks(snapshot, async (chunk) =>
        writable.write(chunk),
      );
      await writable.close();
      return bytes;
    } catch (err) {
      try {
        await writable.abort();
      } catch (_e) {
        // ignore
      }
      throw err;
    }
  }

  static async exportLibrary(input: {
    videos: Video[];
    directoryState: DirectoryRootsState;
    filterPresets: FilterPreset[];
    watchStates: WatchStatesByRoot;
    fileHandle?: FileSystemFileHandle;
    fileName?: string;
  }): Promise<LibraryExportResult> {
    const snapshot = this.buildSnapshot(input);
    const fileName =
      input.fileName || `videovault-library-${new Date().toISOString().split('T')[0]}.json`;

    if (input.fileHandle) {
      const bytesWritten = await this.streamSnapshotToHandle(snapshot, input.fileHandle);
      return {
        snapshot,
        fileName: (input.fileHandle as any).name || fileName,
        mode: 'streamed',
        bytesWritten,
      };
    }

    const serialized = this.serializeSnapshot(snapshot);
    const bytesWritten = new TextEncoder().encode(serialized).byteLength;
    return {
      snapshot,
      fileName,
      mode: 'blob',
      blob: new Blob([serialized], { type: 'application/json' }),
      bytesWritten,
    };
  }

  static async importFromJson(jsonData: string): Promise<LibraryImportResult> {
    const parsed = this.parse(jsonData);

    const videos = VideoDatabase.importFromParsed(parsed.videos);
    await DirectoryDatabase.replaceState(this.normalizeDirectoryRoots(parsed.directoryRoots));
    await FilterPresetsService.replaceAll(parsed.filterPresets || []);
    await WatchStateService.replaceAll(parsed.watchStates || {});

    return {
      videos,
      presets: parsed.filterPresets,
      directoryRoots: this.normalizeDirectoryRoots(parsed.directoryRoots),
      watchStates: parsed.watchStates,
    };
  }
}
