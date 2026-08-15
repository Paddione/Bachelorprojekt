import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LibraryMetadataService } from './library-metadata';
import { Video } from '@/types/video';
import { MockFileSystem } from '@/test/fs-api-mock';
import { VideoDatabase } from './video-database';
import { DirectoryDatabase } from './directory-database';
import { FilterPresetsService } from './filter-presets';
import { WatchStateService } from './watch-state-service';

vi.mock('./server-health', () => ({
  serverHealth: {
    isHealthy: vi.fn().mockResolvedValue(false),
    markUnhealthy: vi.fn(),
  },
}));

vi.mock('./api-client', () => ({
  ApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./app-settings', () => ({
  AppSettingsService: {
    setJson: vi.fn(),
    getJson: vi.fn(),
    remove: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
  },
}));

const sampleVideo: Video = {
  id: 'v1',
  filename: 'video.mp4',
  displayName: 'Sample',
  path: 'movies/video.mp4',
  size: 1000,
  lastModified: '2024-01-01T00:00:00Z',
  categories: {
    age: [],
    physical: [],
    ethnicity: [],
    relationship: [],
    acts: [],
    setting: [],
    quality: [],
    performer: [],
  },
  customCategories: {},
  metadata: {
    duration: 10,
    width: 1920,
    height: 1080,
    bitrate: 1000,
    codec: 'h264',
    fps: 30,
    aspectRatio: '16:9',
  },
  thumbnail: { dataUrl: 'base64', generated: true, timestamp: '2024-01-01T00:00:00Z' },
  rootKey: 'root1',
};

describe('LibraryMetadataService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports metadata with roots, presets, and watch states', async () => {
    const result = await LibraryMetadataService.exportLibrary({
      videos: [sampleVideo],
      directoryState: {
        lastRootKey: 'root1',
        roots: { root1: { name: 'Root 1', directories: ['movies/'] } },
      },
      filterPresets: [
        {
          name: 'preset-1',
          categories: ['age:teen'],
          searchQuery: 'foo',
          dateRange: { startDate: '', endDate: '' },
          fileSizeRange: { min: 0, max: 0 },
          durationRange: { min: 0, max: 0 },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
      watchStates: { root1: { v1: { position: 5, updatedAt: '2024-01-01T00:00:00Z' } } },
      fileName: 'export.json',
    });

    expect(result.mode).toBe('blob');
    expect(result.blob).toBeInstanceOf(Blob);
    const serialized = LibraryMetadataService.serializeSnapshot(result.snapshot);
    expect(result.bytesWritten).toBe(new TextEncoder().encode(serialized).byteLength);
    expect((result.blob as Blob).size).toBe(result.bytesWritten);
    expect(result.snapshot.totalVideos).toBe(1);
    const parsed = JSON.parse(LibraryMetadataService.serializeSnapshot(result.snapshot));
    expect(parsed.directoryRoots.roots.root1.directories).toContain('movies/');
    expect(parsed.filterPresets[0].name).toBe('preset-1');
    expect(parsed.watchStates.root1.v1.position).toBe(5);
    expect(parsed.videos[0].thumbnail.dataUrl).toBe('');
  });

  it('streams export to a writable file handle', async () => {
    const fs = new MockFileSystem();
    fs.addFile('export.json');
    const handle = fs.createHandle(
      'export.json',
      (fs.root.children as any)['export.json'],
    ) as FileSystemFileHandle;
    const snapshot = LibraryMetadataService.buildSnapshot({
      videos: [sampleVideo],
      directoryState: { lastRootKey: null, roots: {} },
      filterPresets: [],
      watchStates: {},
    });

    const bytes = await LibraryMetadataService.streamSnapshotToHandle(snapshot, handle);
    const content = (fs.root.children as any)['export.json'].content as string;
    const parsed = JSON.parse(content);

    expect(bytes).toBe(new TextEncoder().encode(content).byteLength);
    expect(parsed.videos).toHaveLength(1);
    expect(parsed.totalVideos).toBe(1);
  });

  it('validates and applies imports via underlying services', async () => {
    const importSpy = vi.spyOn(VideoDatabase, 'importFromParsed').mockReturnValue([sampleVideo]);
    const rootsSpy = vi.spyOn(DirectoryDatabase, 'replaceState').mockResolvedValue();
    const presetsSpy = vi.spyOn(FilterPresetsService, 'replaceAll').mockResolvedValue();
    const watchSpy = vi.spyOn(WatchStateService, 'replaceAll').mockResolvedValue();

    const payload = {
      version: '2.0',
      exportDate: '2024-01-01T00:00:00Z',
      videos: [{ ...sampleVideo, thumbnail: { dataUrl: '', generated: false, timestamp: '' } }],
      directoryRoots: { lastRootKey: 'root1', roots: { root1: { directories: ['videos'] } } },
      filterPresets: [
        {
          name: 'preset',
          categories: [],
          searchQuery: '',
          dateRange: { startDate: '', endDate: '' },
          fileSizeRange: { min: '10', max: '20' },
          durationRange: { min: '5', max: '25' },
        },
      ],
      watchStates: { root1: { v1: { position: '1', duration: '9' } } },
    };

    const result = await LibraryMetadataService.importFromJson(JSON.stringify(payload));

    expect(importSpy).toHaveBeenCalled();
    expect(rootsSpy).toHaveBeenCalledWith({
      lastRootKey: 'root1',
      roots: { root1: { name: 'root1', directories: ['videos/'] } },
    });
    expect(presetsSpy).toHaveBeenCalled();
    expect(watchSpy).toHaveBeenCalled();
    expect(result.videos).toHaveLength(1);
    expect(result.presets[0].name).toBe('preset');
    expect(result.presets[0].fileSizeRange.min).toBe(10);
    expect(result.watchStates.root1.v1.position).toBe(1);
  });

  it('round-trips categories, custom categories, presets, and watch states', async () => {
    const complexVideo: Video = {
      ...sampleVideo,
      id: 'v-rich',
      categories: {
        age: ['Teen', 'teen'],
        physical: ['fit'],
        ethnicity: ['Asian'],
        relationship: [],
        acts: ['BJ', 'bj'],
        setting: ['studio'],
        quality: ['4k'],
        performer: ['Alex'],
      },
      customCategories: { Studio: ['Acme', 'acme '], mood: ['Chill'] },
      metadata: {
        ...sampleVideo.metadata,
        duration: 321,
        width: 3840,
        height: 2160,
      },
      rootKey: 'rootA',
    };

    const exportResult = await LibraryMetadataService.exportLibrary({
      videos: [complexVideo],
      directoryState: {
        lastRootKey: 'rootA',
        roots: { rootA: { name: 'Root A', directories: ['videos', 'extras/'] } },
      },
      filterPresets: [
        {
          name: 'long-cuts',
          categories: ['acts:bj'],
          searchQuery: 'scene',
          dateRange: { startDate: '2024-01-01', endDate: '' },
          fileSizeRange: { min: 0, max: 50000000 },
          durationRange: { min: 60, max: 3600 },
          createdAt: '2024-03-01T00:00:00Z',
          updatedAt: '2024-03-02T00:00:00Z',
        },
      ],
      watchStates: {
        rootA: {
          'v-rich': {
            position: 42,
            duration: 4200,
            completed: false,
            updatedAt: '2024-02-01T00:00:00Z',
          },
        },
      },
      fileName: 'export.json',
    });

    const importSpy = vi.spyOn(VideoDatabase, 'importFromParsed');
    const rootsSpy = vi.spyOn(DirectoryDatabase, 'replaceState');
    const presetsSpy = vi.spyOn(FilterPresetsService, 'replaceAll');
    const watchSpy = vi.spyOn(WatchStateService, 'replaceAll');

    const roundTripJson = LibraryMetadataService.serializeSnapshot(exportResult.snapshot);
    const result = await LibraryMetadataService.importFromJson(roundTripJson);

    expect(importSpy).toHaveBeenCalled();
    const importedVideo = result.videos[0];
    expect(importedVideo.categories.age).toContain('teen');
    expect(importedVideo.customCategories).toEqual({ studio: ['acme'], mood: ['chill'] });
    expect(rootsSpy).toHaveBeenCalledWith({
      lastRootKey: 'rootA',
      roots: { rootA: { name: 'Root A', directories: ['videos/', 'extras/'] } },
    });
    expect(presetsSpy).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'long-cuts' })]),
    );
    expect(result.watchStates.rootA['v-rich']).toMatchObject({
      position: 42,
      duration: 4200,
      completed: false,
    });
    expect(watchSpy).toHaveBeenCalledWith(expect.objectContaining({ rootA: expect.any(Object) }));
  });

  it('throws on invalid import payload', async () => {
    await expect(
      LibraryMetadataService.importFromJson(JSON.stringify({ invalid: true })),
    ).rejects.toThrow();
  });

  it('rejects invalid watch states', async () => {
    const payload = {
      version: '2.0',
      exportDate: '2024-01-01T00:00:00Z',
      videos: [{ ...sampleVideo, thumbnail: { dataUrl: '', generated: false, timestamp: '' } }],
      directoryRoots: { lastRootKey: null, roots: {} },
      filterPresets: [],
      watchStates: { root1: { v1: { position: -5 } } },
    };

    await expect(LibraryMetadataService.importFromJson(JSON.stringify(payload))).rejects.toThrow(
      'Invalid library export format',
    );
  });
});
