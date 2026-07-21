import { useCallback, Dispatch, SetStateAction } from 'react';
import { VideoManagerState } from '../types/video';
import { VideoDatabase } from '@/services/video-database';
import { EnhancedFilterEngine } from '@/services/enhanced-filter-engine';
import { attemptDiskRename } from '@/services/filesystem-rename';
import { FilesystemOps } from '@/services/filesystem-ops';
import { DirectoryDatabase } from '@/services/directory-database';
import {
  type SplitVideoOptions,
  type SplitVideoResult,
} from '@/services/video-splitter';
import { selectSplitterBackend } from '@/services/video-splitter-backend';
import { toast, toastWithUndo } from '@/hooks/use-toast';

const UNDO_WINDOW_MS = 8000;

export const getDirectoryFromPath = (path: string): string => {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx === -1) return '';
  const dir = normalized.slice(0, idx);
  return DirectoryDatabase.normalizeDir(dir);
};

export function useVideoCrud(
  state: VideoManagerState,
  setState: Dispatch<SetStateAction<VideoManagerState>>,
  pendingDeleteFinalizers: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>
) {
  const applyToVisible = useCallback(
    (categoryType: string, categoryValue: string, mode: 'add' | 'remove') => {
      const targetVideos = state.filteredVideos;
      if (targetVideos.length === 0) return;

      const normalizedValue = categoryValue.trim().toLowerCase();
      const targetIds = new Set(targetVideos.map((v) => v.id));

      const updatedVideos = state.videos.map((video) => {
        if (!targetIds.has(video.id)) return video;

        const updatedVideo = { ...video };
        const currentValues = [...(updatedVideo.categories[categoryType as keyof typeof updatedVideo.categories] || [])];

        if (mode === 'add') {
          if (!currentValues.includes(normalizedValue)) {
            currentValues.push(normalizedValue);
          }
        } else {
          const idx = currentValues.indexOf(normalizedValue);
          if (idx >= 0) currentValues.splice(idx, 1);
        }

        updatedVideo.categories = {
          ...updatedVideo.categories,
          [categoryType]: currentValues,
        };
        return updatedVideo;
      });

      for (const id of targetIds) {
        const updated = updatedVideos.find((v) => v.id === id);
        if (updated) EnhancedFilterEngine.updateVideoInSearchIndex(updated);
      }

      VideoDatabase.saveToStorage(updatedVideos);
      const affectedVideos = updatedVideos.filter((v) => targetIds.has(v.id));
      void VideoDatabase.syncAllToServer(affectedVideos);
      setState((prev) => ({ ...prev, videos: updatedVideos }));
    },
    [state.videos, state.filteredVideos, setState],
  );

  const updateVideoCategories = useCallback(
    (videoId: string, categories: Partial<{ categories: any; customCategories: any }>) => {
      const updatedVideos = VideoDatabase.updateVideoCategories(state.videos, videoId, categories);
      const updatedVideo = updatedVideos.find((v) => v.id === videoId);
      if (updatedVideo) {
        EnhancedFilterEngine.updateVideoInSearchIndex(updatedVideo);
      }
      setState((prev) => ({ ...prev, videos: updatedVideos }));
    },
    [state.videos, setState],
  );

  const removeVideoCategory = useCallback(
    (videoId: string, categoryType: string, categoryValue: string) => {
      const originalVideo = state.videos.find((v) => v.id === videoId);
      if (!originalVideo) return;

      const originalVideos = state.videos;
      const updatedVideos = VideoDatabase.removeCategory(
        state.videos,
        videoId,
        categoryType,
        categoryValue,
      );

      const updatedVideo = updatedVideos.find((v) => v.id === videoId);
      if (updatedVideo) {
        EnhancedFilterEngine.updateVideoInSearchIndex(updatedVideo);
      }
      setState((prev) => ({ ...prev, videos: updatedVideos }));

      const displayName = originalVideo.displayName || originalVideo.filename;
      const categoryLabel =
        categoryType === 'custom' ? categoryValue : `${categoryType}: ${categoryValue}`;

      toastWithUndo({
        title: 'Category removed',
        description: `Removed "${categoryLabel}" from ${displayName}`,
        undoId: `remove-category-${videoId}-${Date.now()}`,
        undoType: 'delete',
        undoDescription: 'Remove category',
        undoCallback: async () => {
          setState((prev) => ({ ...prev, videos: originalVideos }));
          EnhancedFilterEngine.updateVideoInSearchIndex(originalVideo);
        },
        timeout: 10000,
      });
    },
    [state.videos, setState],
  );

  const renameVideo = useCallback(
    async (
      videoId: string,
      newBaseName: string,
      applyTo: 'displayName' | 'filename' | 'both' = 'both',
      opts?: { overwrite?: boolean; conflictStrategy?: 'keep_both' },
    ) => {
      const target = state.videos.find((v) => v.id === videoId);
      if (!target) return { success: false, message: 'Video not found' };
      const original = { displayName: target.displayName, filename: target.filename };
      const dir = getDirectoryFromPath(target.path);

      const newDisplayName = applyTo === 'filename' ? target.displayName : newBaseName;

      const newFilenameBase =
        applyTo === 'displayName' ? target.filename.replace(/\.[^./\\]+$/, '') : newBaseName;

      const requestedFilename =
        applyTo === 'displayName'
          ? target.filename
          : `${newFilenameBase}${target.filename.match(/\.[^./\\]+$/)?.[0] ?? ''}`;

      const shouldRenameFile = applyTo !== 'displayName' && requestedFilename !== target.filename;
      const disk = shouldRenameFile
        ? await attemptDiskRename(videoId, requestedFilename, opts)
        : { success: true, resolvedName: requestedFilename };
      const appliedFilename =
        applyTo === 'displayName' ? target.filename : disk.resolvedName ?? requestedFilename;
      const updatedPath = dir ? `${dir}${appliedFilename}` : target.path;

      let updatedVideos = VideoDatabase.renameVideoInDb(
        state.videos,
        videoId,
        newDisplayName,
        applyTo === 'displayName' ? undefined : appliedFilename,
      );
      if (applyTo !== 'displayName' && updatedPath) {
        updatedVideos = VideoDatabase.updateVideoPath(
          updatedVideos,
          videoId,
          updatedPath,
          target.rootKey,
        );
      }
      const renamedVideo = updatedVideos.find((v) => v.id === videoId);
      if (renamedVideo) {
        EnhancedFilterEngine.updateVideoInSearchIndex(renamedVideo);
      }
      setState((prev) => ({ ...prev, videos: updatedVideos }));

      if (disk.success) {
        const undoId = `rename-${videoId}-${Date.now()}`;
        const updatedName = renamedVideo?.displayName || newDisplayName;
        toastWithUndo({
          title: 'Renamed',
          description: `Renamed "${original.displayName}" to "${updatedName}"`,
          undoId,
          undoType: 'rename',
          undoDescription: 'Revert rename',
          timeout: UNDO_WINDOW_MS,
          undoCallback: async () => {
            if (original.filename !== appliedFilename) {
              const revertDisk = await attemptDiskRename(videoId, original.filename, {
                overwrite: true,
              });
              if (!revertDisk.success) {
                throw new Error(revertDisk.message || 'Failed to revert filename on disk');
              }
            }
            setState((prev) => {
              let restored = VideoDatabase.renameVideoInDb(prev.videos, videoId, original.displayName, original.filename);
              if (dir) {
                restored = VideoDatabase.updateVideoPath(
                  restored,
                  videoId,
                  `${dir}${original.filename}`,
                  target.rootKey,
                );
              }
              const restoredVideo = restored.find((v) => v.id === videoId);
              if (restoredVideo) {
                EnhancedFilterEngine.updateVideoInSearchIndex(restoredVideo);
              }
              return { ...prev, videos: restored };
            });
          },
        });
      }
      return disk;
    },
    [state.videos, setState],
  );

  const moveFileToDirectory = useCallback(
    async (
      videoId: string,
      targetRelativeDirPath: string,
      opts?: { overwrite?: boolean; conflictStrategy?: 'keep_both' },
    ) => {
      const vid = state.videos.find((v) => v.id === videoId);
      if (!vid) return { success: false, message: 'Video not found' };
      const originalPath = vid.path;
      const originalRootKey = vid.rootKey;
      const res = await FilesystemOps.moveFile(videoId, targetRelativeDirPath, opts);
      if (res.success) {
        const finalName = res.resolvedName ?? vid.filename;
        const newPath = `${DirectoryDatabase.normalizeDir(targetRelativeDirPath)}${finalName}`;
        let updated = VideoDatabase.updateVideoPath(state.videos, videoId, newPath, vid.rootKey);
        if (finalName !== vid.filename) {
          updated = VideoDatabase.renameVideoInDb(updated, videoId, vid.displayName, finalName);
        }
        const updatedVideo = updated.find((v) => v.id === videoId);
        if (updatedVideo) {
          EnhancedFilterEngine.updateVideoInSearchIndex(updatedVideo);
        }
        setState((prev) => ({ ...prev, videos: updated }));

        const undoId = `move-${videoId}-${Date.now()}`;
        toastWithUndo({
          title: 'Moved',
          description: `${vid.displayName || vid.filename} moved. Undo?`,
          undoId,
          undoType: 'move',
          undoDescription: 'Move video',
          timeout: UNDO_WINDOW_MS,
          undoCallback: async () => {
            const revertDir = getDirectoryFromPath(originalPath);
            const revert = await FilesystemOps.moveFile(videoId, revertDir, {
              overwrite: true,
              preferredName: vid.filename,
            });
            if (!revert.success) {
              throw new Error(revert.message || 'Failed to move file back to original location');
            }
            setState((prev) => {
              let restored = VideoDatabase.updateVideoPath(
                prev.videos,
                videoId,
                originalPath,
                originalRootKey,
              );
              restored = VideoDatabase.renameVideoInDb(
                restored,
                videoId,
                vid.displayName,
                vid.filename,
              );
              const restoredVideo = restored.find((v) => v.id === videoId);
              if (restoredVideo) {
                EnhancedFilterEngine.updateVideoInSearchIndex(restoredVideo);
              }
              return { ...prev, videos: restored };
            });
          },
        });
      }
      return res;
    },
    [state.videos, setState],
  );

  const deleteFile = useCallback(
    async (videoId: string) => {
      const video = state.videos.find((v) => v.id === videoId);
      if (!video) return { success: false, message: 'Video not found' };

      EnhancedFilterEngine.removeVideoFromSearchIndex(videoId);
      const updated = VideoDatabase.removeVideo(state.videos, videoId);
      setState((prev) => ({ ...prev, videos: updated }));

      const undoId = `delete-${videoId}-${Date.now()}`;

      const finalize = async () => {
        pendingDeleteFinalizers.current.delete(undoId);
        const res = await FilesystemOps.deleteFile(videoId);
        if (!res.success) {
          setState((prev) => {
            const restored = VideoDatabase.addVideos(prev.videos, [video]);
            EnhancedFilterEngine.addVideoToSearchIndex(video);
            return { ...prev, videos: restored };
          });
          toast({
            title: 'Delete failed',
            description: res.message || 'Unable to delete file from disk.',
            variant: 'destructive',
          });
        }
      };

      pendingDeleteFinalizers.current.set(
        undoId,
        setTimeout(() => void finalize(), UNDO_WINDOW_MS),
      );

      toastWithUndo({
        title: 'Deleted',
        description: `${video.displayName || video.filename} deleted. Undo available for ${Math.floor(UNDO_WINDOW_MS / 1000)}s.`,
        variant: 'destructive',
        undoId,
        undoType: 'delete',
        undoDescription: 'Delete video',
        timeout: UNDO_WINDOW_MS,
        undoCallback: async () => {
          const timer = pendingDeleteFinalizers.current.get(undoId);
          if (timer) {
            clearTimeout(timer);
            pendingDeleteFinalizers.current.delete(undoId);
          }
          setState((prev) => {
            const restored = VideoDatabase.addVideos(prev.videos, [video]);
            EnhancedFilterEngine.addVideoToSearchIndex(video);
            return { ...prev, videos: restored };
          });
        },
      });

      return { success: true, message: 'Delete scheduled', deferred: true };
    },
    [state.videos, pendingDeleteFinalizers, setState],
  );

  const createDirectory = useCallback(async (relativeDirPath: string) => {
    const rootKey = DirectoryDatabase.getLastRootKey();
    if (!rootKey)
      return {
        success: false,
        message: 'No scanned root in this session. Scan a directory first.',
      };
    const res = await FilesystemOps.createDirectory(rootKey, relativeDirPath);
    return res;
  }, []);

  const deleteDirectory = useCallback(
    async (relativeDirPath: string) => {
      const rootKey = DirectoryDatabase.getLastRootKey();
      if (!rootKey)
        return {
          success: false,
          message: 'No scanned root in this session. Scan a directory first.',
        };
      const res = await FilesystemOps.deleteDirectory(rootKey, relativeDirPath);
      if (res.success) {
        const updated = VideoDatabase.removeVideosByDirectory(
          state.videos,
          rootKey,
          relativeDirPath,
        );
        setState((prev) => ({ ...prev, videos: updated }));
      }
      return res;
    },
    [state.videos, setState],
  );

  const splitVideo = useCallback(
    async (videoId: string, options: SplitVideoOptions): Promise<SplitVideoResult> => {
      const source = state.videos.find((v) => v.id === videoId);
      if (!source) {
        return { success: false, message: 'Video not found' };
      }
      const result = await selectSplitterBackend(source).split(source, options);
      if (result.success) {
        setState((prev) => {
          const updated = VideoDatabase.addVideos(prev.videos, result.segments);
          result.segments.forEach((seg) => void EnhancedFilterEngine.addVideoToSearchIndex(seg));
          return { ...prev, videos: updated };
        });
      }
      return result;
    },
    [state.videos, setState],
  );

  return {
    applyToVisible,
    updateVideoCategories,
    removeVideoCategory,
    renameVideo,
    moveFileToDirectory,
    deleteFile,
    createDirectory,
    deleteDirectory,
    splitVideo,
  };
}
