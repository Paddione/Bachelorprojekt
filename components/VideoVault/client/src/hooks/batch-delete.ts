import { useCallback } from 'react';
import type { VideoManagerState } from '../types/video';
import { VideoDatabase } from '@/services/video-database';
import { EnhancedFilterEngine } from '@/services/enhanced-filter-engine';
import { FilesystemOps } from '@/services/filesystem-ops';
import { toast, toastWithUndo } from '@/hooks/use-toast';
import { BATCH_UNDO_WINDOW_MS } from './batch-rename';

export function useBatchDelete(
  state: VideoManagerState,
  setState: React.Dispatch<React.SetStateAction<VideoManagerState>>,
  pendingDeleteFinalizers: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>,
) {
  return useCallback(
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
          failed.push({ video: originals[idx], message: r.status === 'fulfilled' ? r.value?.message : (r as { reason?: Error }).reason?.message });
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
      pendingDeleteFinalizers.current.set(undoId, setTimeout(() => void finalize(), BATCH_UNDO_WINDOW_MS));
      toastWithUndo({
        title: 'Deleted', description: `Deleted ${originals.length} item${originals.length === 1 ? '' : 's'}. Undo available for ${Math.floor(BATCH_UNDO_WINDOW_MS / 1000)}s.`,
        variant: 'destructive', undoId, undoType: 'delete', undoDescription: 'Batch delete', timeout: BATCH_UNDO_WINDOW_MS,
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
}
