import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@/test/renderWithProviders';
import { Video } from '@/types/video';

vi.mock('@/hooks/use-toast', () => {
  const toast = vi.fn();
  const toastWithUndo = vi.fn();
  return {
    toast,
    toastWithUndo,
    useToast: () => ({ toast, toastWithUndo, dismiss: vi.fn(), toasts: [] }),
  };
});

import { toast, toastWithUndo } from '@/hooks/use-toast';
import { useVideoManager } from './use-video-manager';

// Mock video-splitter to avoid ffmpeg import issues
vi.mock('@/services/video-splitter', () => ({
  VideoSplitter: {
    splitVideo: vi.fn(),
  },
}));

// Mocks
vi.mock('@/services/server-health', () => {
  return {
    serverHealth: {
      isHealthy: vi.fn(() => Promise.resolve(true)),
      markUnhealthy: vi.fn(),
    },
  };
});

vi.mock('@/services/enhanced-filter-engine', () => ({
  EnhancedFilterEngine: {
    addVideosToSearchIndex: vi.fn() as unknown,
    updateVideoInSearchIndex: vi.fn() as unknown,
    removeVideoFromSearchIndex: vi.fn() as unknown,
    updateSearchIndex: vi.fn() as unknown,
    initializeSearchIndex: vi.fn() as unknown,
    addVideoToSearchIndex: vi.fn() as unknown,
    applyFiltersWithSearch: vi.fn((videos: any[]) => videos as unknown) as unknown,
    updateFilterCountsWithSearch: vi.fn(() => []) as unknown,
  },
}));

const baseCategories: Video['categories'] = {
  age: [],
  physical: [],
  ethnicity: [],
  relationship: [],
  acts: [],
  setting: [],
  quality: [],
  performer: [],
};

const baseMetadata: Video['metadata'] = {
  duration: 0,
  width: 0,
  height: 0,
  bitrate: 0,
  codec: '',
  fps: 0,
  aspectRatio: '',
};

const baseThumbnail: Video['thumbnail'] = {
  dataUrl: '',
  generated: false,
  timestamp: '',
};

const buildVideo = (overrides: Partial<Video>): Video => {
  const { metadata, categories, thumbnail, customCategories, ...rest } = overrides;
  return {
    id: 'video-id',
    filename: 'video.mp4',
    displayName: 'Video',
    path: '/video.mp4',
    size: 0,
    lastModified: new Date().toISOString(),
    metadata: { ...baseMetadata, ...(metadata ?? {}) },
    categories: { ...baseCategories, ...(categories ?? {}) },
    customCategories: { ...(customCategories ?? {}) },
    thumbnail: { ...baseThumbnail, ...(thumbnail ?? {}) },
    rootKey: 'root',
    ...rest,
  };
};

const initialVideos: Video[] = [
  buildVideo({
    id: '1',
    filename: 'a.mp4',
    displayName: 'A',
    path: 'root/a.mp4',
  }),
  buildVideo({
    id: '2',
    filename: 'b.mp4',
    displayName: 'B',
    path: 'root/b.mp4',
  }),
];

vi.mock('@/services/video-database', () => {
  return {
    VideoDatabase: class {
      static load() {
        return Promise.resolve(initialVideos.map((v) => ({ ...v })));
      }
      static loadTags() {
        return Promise.resolve([]);
      }
      static renameVideoInDb(
        videos: Video[],
        videoId: string,
        newDisplayName: string,
        newFilename?: string,
      ): Video[] {
        return videos.map((v) =>
          v.id === videoId
            ? { ...v, displayName: newDisplayName, filename: newFilename ?? v.filename }
            : v,
        );
      }
      static batchRenameInDb(
        videos: Video[],
        renames: Array<{ id: string; displayName: string; filename?: string }>,
      ): Video[] {
        const map = new Map(renames.map((r) => [r.id, r]));
        return videos.map((v) => {
          const rename = map.get(v.id);
          if (!rename) return v;
          return {
            ...v,
            displayName: rename.displayName,
            filename: rename.filename ?? v.filename,
          };
        });
      }
      static updateVideoPath(
        videos: Video[],
        id: string,
        newPath: string,
        rootKey?: string,
      ): Video[] {
        return videos.map((v) =>
          v.id === id ? { ...v, path: newPath, rootKey: rootKey ?? v.rootKey } : v,
        );
      }
      static removeVideosByIds(videos: Video[], ids: string[]): Video[] {
        const set = new Set(ids);

        return videos.filter((v) => !set.has(v.id));
      }
      static removeVideo(videos: Video[], id: string): Video[] {
        return videos.filter((v) => v.id !== id);
      }
      static addVideos(existing: Video[], newOnes: Video[]): Video[] {
        const map = new Map(existing.map((v) => [v.id, v]));
        newOnes.forEach((v) => map.set(v.id, v));

        return Array.from(map.values());
      }
      static addVideo(videos: Video[], video: Video): Video[] {
        const others = videos.filter((v) => v.id !== video.id);
        return [...others, video];
      }
    },
  };
});

vi.mock('@/services/filesystem-rename', () => {
  return {
    attemptDiskRename: vi.fn(() => Promise.resolve({ success: true })),
  };
});

vi.mock('@/services/filesystem-ops', () => {
  return {
    FilesystemOps: {
      moveFile: vi.fn(() => Promise.resolve({ success: true })),
      deleteFile: vi.fn(() => Promise.resolve({ success: true })),
    },
  };
});

function Harness() {
  const vm = useVideoManager();
  useEffect(() => {
    (window as any).__vm = vm;
  }, [vm]);
  return null;
}

async function nextTick() {
  await new Promise((r) => setTimeout(r, 0));
}

async function loadVm() {
  await act(async () => {
    render(<Harness />);
    await new Promise((r) => setTimeout(r, 120));
  });
  await waitFor(() => {
    const vmLatest: any = (window as any).__vm;
    expect(vmLatest?.state?.videos?.length).toBeGreaterThan(0);
  });
  return (window as any).__vm as ReturnType<typeof useVideoManager>;
}

describe('useVideoManager batch operations (optimistic with rollback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('vv.simulateFail');
    vi.useRealTimers();
  });

  it('batchRename succeeds and updates state', async () => {
    await act(async () => {
      render(<Harness />);
      await nextTick();
      await new Promise((r) => setTimeout(r, 100));
    });
    await waitFor(() => {
      const vmLatest: any = (window as any).__vm;
      expect(vmLatest.state.videos.length).toBe(2);
    });
    let vm: any = (window as any).__vm; // Get fresh reference after state update

    let res: any;
    await act(async () => {
      res = await vm.actions.batchRename(['1', '2'], {
        prefix: 'X',
        startIndex: 1,
        padDigits: 2,
        transform: 'none',
        applyTo: 'both',
      });
    });

    // Wait for state update and get fresh reference
    await new Promise((r) => setTimeout(r, 50));
    vm = (window as any).__vm;

    expect(res.success).toBe(2);
    expect(res.failed).toBe(0);
    // Names should be updated
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const names = vm.state.videos.map((v: any) => v.displayName);
    expect(names.length).toBe(2);
    expect(names[0].toLowerCase()).toContain('x');
    expect(names[1].toLowerCase()).toContain('x');
  });

  it('batchRename simulates failure and rolls back', async () => {
    localStorage.setItem('vv.simulateFail', '1');
    await act(async () => {
      render(<Harness />);
      await new Promise((r) => setTimeout(r, 100));
    });
    await waitFor(() => {
      const vmLatest: any = (window as any).__vm;
      expect(vmLatest.state.videos.length).toBe(2);
    });
    let vm: any = (window as any).__vm;
    const original = vm.state.videos.map((v: any) => ({
      id: v.id,
      name: v.displayName,
      file: v.filename,
    }));

    let res: any;
    await act(async () => {
      res = await vm.actions.batchRename(['1', '2'], {
        prefix: 'Y',
        startIndex: 1,
        padDigits: 2,
        transform: 'none',
        applyTo: 'both',
      });
    });

    // Wait for rollback to complete
    await new Promise((r) => setTimeout(r, 50));
    vm = (window as any).__vm;

    expect(res.success).toBe(0);
    expect(res.failed).toBe(2);
    const after = vm.state.videos.map((v: any) => ({
      id: v.id,
      name: v.displayName,
      file: v.filename,
    }));
    expect(after).toEqual(original);
  });

  it('emits undo toast for single rename', async () => {
    const vm = await loadVm();
    vi.clearAllMocks();

    await act(async () => {
      await vm.actions.renameVideo('1', 'Renamed');
    });

    expect(toastWithUndo).toHaveBeenCalledWith(
      expect.objectContaining({
        undoType: 'rename',
        undoDescription: 'Revert rename',
      }),
    );
  });

  it('emits undo toast for move', async () => {
    const vm = await loadVm();
    vi.clearAllMocks();

    await act(async () => {
      await vm.actions.moveFileToDirectory('1', 'dest/');
    });

    expect(toastWithUndo).toHaveBeenCalledWith(
      expect.objectContaining({
        undoType: 'move',
        undoDescription: 'Move video',
      }),
    );
  });

  it('emits undo toast for delete', async () => {
    const vm = await loadVm();
    vi.clearAllMocks();

    await act(async () => {
      await vm.actions.deleteFile('1');
    });

    expect(toastWithUndo).toHaveBeenCalledWith(
      expect.objectContaining({
        undoType: 'delete',
        undoDescription: 'Delete video',
      }),
    );
  });
});
