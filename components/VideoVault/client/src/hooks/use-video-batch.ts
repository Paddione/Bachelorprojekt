import { useCallback, Dispatch, SetStateAction } from 'react';
import { VideoManagerState, Video, AdvancedFilters } from '../types/video';
import { VideoDatabase } from '@/services/video-database';
import { FilterEngine } from '@/services/filter-engine';
import { EnhancedFilterEngine } from '@/services/enhanced-filter-engine';
import { FilterPresetsService } from '@/services/filter-presets';
import { attemptDiskRename } from '@/services/filesystem-rename';
import { BatchRenameOptions, buildBatchName, getFilenameWithOriginalExt } from '@/services/rename-engine';
import { FilesystemOps } from '@/services/filesystem-ops';
import { DirectoryDatabase } from '@/services/directory-database';
import { LibraryMetadataService } from '@/services/library-metadata';
import { WatchStateService, type WatchStatesByRoot } from '@/services/watch-state-service';
import { toast, toastWithUndo } from '@/hooks/use-toast';

const UNDO_WINDOW_MS = 8000;

const getDirectoryFromPath = (path: string): string => {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx === -1) return '';
  return DirectoryDatabase.normalizeDir(normalized.slice(0, idx));
};

const getSimulatedFailureRate = () => {
  const raw = typeof window !== 'undefined' ? window.localStorage.getItem('vv.simulateFail') : null;
  const n = raw ? Number(raw) : 0;
  return isNaN(n) ? 0 : Math.min(1, Math.max(0, n));
};

export function useVideoBatch(
  state: VideoManagerState,
  setState: Dispatch<SetStateAction<VideoManagerState>>,
  pendingDeleteFinalizers: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>
) {
  const exportData = useCallback(
    async (options?: { fileHandle?: FileSystemFileHandle; fileName?: string }) => {
      let presets = FilterPresetsService.loadAllPresets();
      try { presets = await FilterPresetsService.hydrateFromServer(); } catch {}
      let watchStates: WatchStatesByRoot = {};
      try { watchStates = await WatchStateService.ensureHydrated(); } catch { watchStates = WatchStateService.getSnapshot(); }

      return LibraryMetadataService.exportLibrary({
        videos: state.videos,
        directoryState: DirectoryDatabase.getState(),
        filterPresets: presets,
        watchStates,
        fileHandle: options?.fileHandle,
        fileName: options?.fileName,
      });
    },
    [state.videos],
  );

  const importData = useCallback(async (jsonData: string) => {
    const result = await LibraryMetadataService.importFromJson(jsonData);

    if (result.videos.length > 1000) {
      const { ProgressiveLoader } = await import('@/services/progressive-loader');
      setState((prev) => ({
        ...prev, videos: [], filteredVideos: [], selectedCategories: [],
        searchQuery: '', availableCategories: [], isProgressiveLoading: true,
      }));

      let loadedCount = 0;
      let allVideos: Video[] = [];

      await ProgressiveLoader.loadInChunks(result.videos, {
        chunkSize: 500,
        onProgress: (loaded, total) => { console.log(`Imported ${loaded}/${total} videos`); },
        onChunkLoaded: (chunk, totalLoaded) => {
          loadedCount = totalLoaded;
          allVideos = allVideos.concat(chunk);
          setState((prev) => ({ ...prev, videos: allVideos, filteredVideos: allVideos, isProgressiveLoading: true }));
          EnhancedFilterEngine.addVideosToSearchIndex(chunk);
        },
      });

      setState((prev) => ({
        ...prev,
        availableCategories: FilterEngine.getAvailableCategories(allVideos, prev.knownTags),
        isProgressiveLoading: false,
      }));
    } else {
      EnhancedFilterEngine.initializeSearchIndex(result.videos);
      setState((prev) => ({
        ...prev, videos: result.videos, filteredVideos: result.videos, selectedCategories: [],
        searchQuery: '', availableCategories: FilterEngine.getAvailableCategories(result.videos, state.knownTags),
      }));
    }

    return {
      videos: result.videos.length, presets: result.presets.length,
      roots: Object.keys(result.directoryRoots.roots || {}).length,
      watchStates: Object.values(result.watchStates || {}).reduce(
        (total, rootMap) => total + Object.keys(rootMap || {}).length, 0,
      ),
    };
  }, [state.knownTags, setState]);

  const createBackup = useCallback((description?: string) => {
    VideoDatabase.createBackup(description);
  }, []);

  const saveFilterPreset = useCallback(
    (name: string) => {
      const advancedFilters: AdvancedFilters = {
        dateRange: state.dateRange, fileSizeRange: state.fileSizeRange, durationRange: state.durationRange,
      };
      FilterPresetsService.savePreset(name, state.selectedCategories, state.searchQuery, advancedFilters);
    },
    [state.selectedCategories, state.searchQuery, state.dateRange, state.fileSizeRange, state.durationRange],
  );

  const loadFilterPreset = useCallback((name: string) => {
    const preset = FilterPresetsService.loadPreset(name);
    if (preset) {
      setState((prev) => ({
        ...prev, selectedCategories: preset.categories, searchQuery: preset.searchQuery,
        dateRange: preset.dateRange, fileSizeRange: preset.fileSizeRange, durationRange: preset.durationRange,
      }));
    }
  }, [setState]);

  const batchRename = useCallback(
    async (videoIds: string[], options: BatchRenameOptions) => {
      const intents = videoIds
        .map((id, index) => {
          const vid = state.videos.find((v) => v.id === id);
          if (!vid) return null;
          const baseName = buildBatchName(vid, index, options);
          const applyTo = options.applyTo ?? 'both';
          const newDisplayName = applyTo === 'filename' ? vid.displayName : baseName;
          const newFilename = applyTo === 'displayName' ? undefined : getFilenameWithOriginalExt(baseName, vid.filename);
          return {
            id,
            original: { displayName: vid.displayName, filename: vid.filename },
            next: { displayName: newDisplayName, filename: newFilename ?? vid.filename },
          };
        })
        .filter(Boolean) as Array<{
        id: string; original: { displayName: string; filename: string }; next: { displayName: string; filename: string };
      }>;

      if (intents.length === 0) return 0;

      let optimistic = state.videos.map((v) => {
        const intent = intents.find((i) => i.id === v.id);
        return intent ? { ...v, displayName: intent.next.displayName, filename: intent.next.filename } : v;
      });
      setState((prev) => ({ ...prev, videos: optimistic }));
      intents.forEach((i) => {
        const vid = optimistic.find((v) => v.id === i.id);
        if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
      });

      const results = await Promise.allSettled(
        intents.map(async (i) => {
          try {
            const res = await attemptDiskRename(i.id, i.next.filename);
            const rate = getSimulatedFailureRate();
            if (rate > 0 && Math.random() < rate) return { id: i.id, success: false, error: 'Simulated failure' };
            if (!res.success) return { id: i.id, success: false, error: res.message || 'Rename failed', code: res.code };
            return { id: i.id, success: true };
          } catch (e) {
            return { id: i.id, success: false, error: (e as Error)?.message || 'Rename failed' };
          }
        }),
      );

      const perItem = results.map((r, idx) =>
        r.status === 'fulfilled'
          ? { ...(r.value as any), id: intents[idx].id, requestedFilename: intents[idx].next.filename }
          : { id: intents[idx].id, success: false, error: (r as any).reason?.message || 'Rename failed', requestedFilename: intents[idx].next.filename },
      );
      const failedIds = new Set(perItem.filter((r) => !r.success).map((r) => r.id));
      const succeeded = intents.filter((i) => !failedIds.has(i.id));

      if (failedIds.size > 0) {
        const rolledBack = optimistic.map((v) => {
          if (!failedIds.has(v.id)) return v;
          const orig = intents.find((i) => i.id === v.id)!.original;
          return { ...v, displayName: orig.displayName, filename: orig.filename };
        });
        setState((prev) => ({ ...prev, videos: rolledBack }));
        intents.forEach((i) => {
          const vid = rolledBack.find((v) => v.id === i.id);
          if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
        });
        optimistic = rolledBack;
      }

      if (succeeded.length > 0) {
        const payload = succeeded.map((s) => ({ id: s.id, displayName: s.next.displayName, filename: s.next.filename }));
        const updated = VideoDatabase.batchRenameInDb(optimistic, payload);
        setState((prev) => ({ ...prev, videos: updated }));

        const undoId = `batch-rename-${Date.now()}`;
        const succeededMap = new Map(succeeded.map((s) => [s.id, s]));
        const originalsForUndo = succeeded.map((s) => ({ id: s.id, displayName: s.original.displayName, filename: s.original.filename }));

        toastWithUndo({
          title: 'Batch renamed',
          description: `Renamed ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}. Undo?`,
          undoId, undoType: 'rename', undoDescription: 'Batch rename', timeout: UNDO_WINDOW_MS,
          undoCallback: async () => {
            const revertable = new Set<string>();
            const errors: string[] = [];

            for (const original of originalsForUndo) {
              const next = succeededMap.get(original.id)?.next;
              const nextFilename = next?.filename ?? original.filename;
              if (nextFilename !== original.filename) {
                const revert = await attemptDiskRename(original.id, original.filename);
                if (!revert.success) { errors.push(original.id); continue; }
              }
              revertable.add(original.id);
            }

            setState((prev) => {
              const payloadUndo = originalsForUndo
                .filter((o) => revertable.has(o.id))
                .map((o) => ({ id: o.id, displayName: o.displayName, filename: o.filename }));
              if (payloadUndo.length === 0) return prev;
              const restored = VideoDatabase.batchRenameInDb(prev.videos, payloadUndo);
              payloadUndo.forEach((p) => {
                const vid = restored.find((v) => v.id === p.id);
                if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
              });
              return { ...prev, videos: restored };
            });

            if (errors.length > 0) {
              throw new Error(`Failed to undo ${errors.length} rename${errors.length === 1 ? '' : 's'}.`);
            }
          },
        });
      }

      return { total: intents.length, success: succeeded.length, failed: failedIds.size, results: perItem };
    },
    [state.videos, setState],
  );

  const batchMove = useCallback(
    async (videoIds: string[], targetRelativeDirPath: string, opts?: { overwrite?: boolean }) => {
      const intents = videoIds
        .map((id) => {
          const vid = state.videos.find((v) => v.id === id);
          if (!vid) return null;
          const newPath = `${DirectoryDatabase.normalizeDir(targetRelativeDirPath)}${vid.filename}`;
          return { id, original: { path: vid.path, rootKey: vid.rootKey }, next: { path: newPath, rootKey: vid.rootKey } };
        })
        .filter(Boolean) as Array<{
        id: string; original: { path: string; rootKey?: string }; next: { path: string; rootKey?: string };
      }>;
      if (intents.length === 0) return { total: 0, success: 0, failed: 0, results: [] };

      let working = state.videos.map((v) => {
        const i = intents.find((ii) => ii.id === v.id);
        return i ? { ...v, path: i.next.path } : v;
      });
      setState((prev) => ({ ...prev, videos: working }));
      intents.forEach((i) => {
        const vid = working.find((v) => v.id === i.id);
        if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
      });

      const results = await Promise.allSettled(
        intents.map(async (i) => {
          try {
            const res = await FilesystemOps.moveFile(i.id, targetRelativeDirPath, opts);
            const rate = getSimulatedFailureRate();
            if (rate > 0 && Math.random() < rate) return { id: i.id, success: false, error: 'Simulated failure' };
            if (!res.success) return { id: i.id, success: false, error: res.message || 'Move failed', code: res.code };
            return { id: i.id, success: true };
          } catch (e) {
            return { id: i.id, success: false, error: (e as Error)?.message || 'Move failed' };
          }
        }),
      );

      const perItem = results.map((r, idx) =>
        r.status === 'fulfilled'
          ? { ...(r.value as any), id: intents[idx].id }
          : { id: intents[idx].id, success: false, error: (r as any).reason?.message || 'Move failed' },
      );
      const resolvedNameMap = new Map<string, string>();
      perItem.forEach((result, idx) => {
        if (result.success && result.resolvedName) {
          resolvedNameMap.set(result.id, result.resolvedName);
          intents[idx].next.path = `${DirectoryDatabase.normalizeDir(targetRelativeDirPath)}${result.resolvedName}`;
        }
      });
      const failedIds = new Set(perItem.filter((r) => !r.success).map((r) => r.id));
      const succeeded = intents.filter((i) => !failedIds.has(i.id));

      if (failedIds.size > 0) {
        const rolledBack = working.map((v) => {
          if (!failedIds.has(v.id)) return v;
          const orig = intents.find((i) => i.id === v.id)!.original;
          return { ...v, path: orig.path };
        });
        setState((prev) => ({ ...prev, videos: rolledBack }));
        intents.forEach((i) => {
          const vid = rolledBack.find((v) => v.id === i.id);
          if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
        });
        working = rolledBack;
      }

      const renamePayload: Array<{ id: string; displayName: string; filename: string }> = [];
      for (const s of succeeded) {
        working = VideoDatabase.updateVideoPath(working, s.id, s.next.path, s.next.rootKey);
        const resolvedName = resolvedNameMap.get(s.id);
        if (resolvedName) {
          const vidAfterPath = working.find((v) => v.id === s.id);
          if (vidAfterPath) {
            renamePayload.push({ id: s.id, displayName: vidAfterPath.displayName, filename: resolvedName });
          }
        }
      }
      if (renamePayload.length > 0) working = VideoDatabase.batchRenameInDb(working, renamePayload);
      if (succeeded.length > 0) {
        succeeded.forEach((s) => {
          const vid = working.find((v) => v.id === s.id);
          if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
        });
        setState((prev) => ({ ...prev, videos: working }));

        const undoId = `batch-move-${Date.now()}`;
        toastWithUndo({
          title: 'Batch move', description: `Moved ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}. Undo?`,
          undoId, undoType: 'move', undoDescription: 'Batch move', timeout: UNDO_WINDOW_MS,
          undoCallback: async () => {
            const revertedIds: string[] = [];
            const errors: string[] = [];

            for (const mv of succeeded) {
              const revertDir = getDirectoryFromPath(mv.original.path);
              const originalFileName = mv.original.path.split('/').pop();
              const revert = await FilesystemOps.moveFile(mv.id, revertDir, {
                overwrite: true, preferredName: originalFileName,
              });
              if (!revert.success) { errors.push(mv.id); continue; }
              revertedIds.push(mv.id);
            }

            setState((prev) => {
              let next = prev.videos;
              revertedIds.forEach((id) => {
                const intent = succeeded.find((s) => s.id === id);
                if (!intent) return;
                next = VideoDatabase.updateVideoPath(next, id, intent.original.path, intent.original.rootKey);
                const originalFileName = intent.original.path.split('/').pop();
                if (originalFileName) {
                  const vidAfterPath = next.find((v) => v.id === id);
                  next = VideoDatabase.renameVideoInDb(next, id, vidAfterPath?.displayName ?? originalFileName, originalFileName);
                }
              });
              revertedIds.forEach((id) => {
                const vid = next.find((v) => v.id === id);
                if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
              });
              return { ...prev, videos: next };
            });

            if (errors.length > 0) {
              throw new Error(`Failed to undo move for ${errors.length} item${errors.length === 1 ? '' : 's'}.`);
            }
          },
        });
      }

      return { total: intents.length, success: succeeded.length, failed: failedIds.size, results: perItem };
    },
    [state.videos, setState],
  );

  const batchDelete = useCallback(
    async (videoIds: string[]) => {
      const idSet = new Set(videoIds);
      const originals = state.videos.filter((v) => idSet.has(v.id));
      if (originals.length === 0) return { total: 0, success: 0, failed: 0, results: [] };

      originals.forEach((v) => void EnhancedFilterEngine.removeVideoFromSearchIndex(v.id));
      const updated = VideoDatabase.removeVideosByIds(state.videos, videoIds);
      setState((prev) => ({ ...prev, videos: updated }));

      const undoId = `batch-delete-${Date.now()}`;

      const finalize = async () => {
        pendingDeleteFinalizers.current.delete(undoId);
        const results = await Promise.allSettled(originals.map(async (v) => FilesystemOps.deleteFile(v.id)));
        const failed: Array<{ video: (typeof originals)[number]; message?: string }> = [];
        results.forEach((r, idx) => {
          if (r.status === 'fulfilled' && r.value?.success) return;
          failed.push({
            video: originals[idx], message: r.status === 'fulfilled' ? r.value?.message : (r as any).reason?.message,
          });
        });

        if (failed.length > 0) {
          setState((prev) => {
            const restored = VideoDatabase.addVideos(prev.videos, failed.map((f) => f.video));
            failed.forEach((f) => void EnhancedFilterEngine.addVideoToSearchIndex(f.video));
            return { ...prev, videos: restored };
          });
          toast({ title: 'Delete failed', description: failed[0].message || 'One or more files could not be deleted.', variant: 'destructive' });
        }
      };

      pendingDeleteFinalizers.current.set(undoId, setTimeout(() => void finalize(), UNDO_WINDOW_MS));

      toastWithUndo({
        title: 'Deleted', description: `Deleted ${originals.length} item${originals.length === 1 ? '' : 's'}. Undo available for ${Math.floor(UNDO_WINDOW_MS / 1000)}s.`,
        variant: 'destructive', undoId, undoType: 'delete', undoDescription: 'Batch delete', timeout: UNDO_WINDOW_MS,
        undoCallback: async () => {
          const timer = pendingDeleteFinalizers.current.get(undoId);
          if (timer) { clearTimeout(timer); pendingDeleteFinalizers.current.delete(undoId); }
          setState((prev) => {
            const restored = VideoDatabase.addVideos(prev.videos, originals);
            originals.forEach((v) => void EnhancedFilterEngine.addVideoToSearchIndex(v));
            return { ...prev, videos: restored };
          });
        },
      });

      return { total: originals.length, success: originals.length, failed: 0, deferred: true, results: originals.map((v) => ({ id: v.id, success: true })) };
    },
    [state.videos, pendingDeleteFinalizers, setState],
  );

  return {
    exportData, importData, createBackup, saveFilterPreset, loadFilterPreset, batchRename, batchMove, batchDelete,
  };
}
