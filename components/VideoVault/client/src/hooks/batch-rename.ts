import { useCallback } from 'react';
import type { VideoManagerState } from '../types/video';
import { VideoDatabase } from '@/services/video-database';
import { EnhancedFilterEngine } from '@/services/enhanced-filter-engine';
import { attemptDiskRename } from '@/services/filesystem-rename';
import { BatchRenameOptions, buildBatchName, getFilenameWithOriginalExt } from '@/services/rename-engine';
import { toastWithUndo } from '@/hooks/use-toast';

export const BATCH_UNDO_WINDOW_MS = 8000;

export function getSimulatedFailureRate(): number {
  const raw = typeof window !== 'undefined' ? window.localStorage.getItem('vv.simulateFail') : null;
  const n = raw ? Number(raw) : 0;
  return isNaN(n) ? 0 : Math.min(1, Math.max(0, n));
}

export function useBatchRename(
  state: VideoManagerState,
  setState: React.Dispatch<React.SetStateAction<VideoManagerState>>,
) {
  return useCallback(
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
            if (getSimulatedFailureRate() > 0 && Math.random() < getSimulatedFailureRate())
              return { id: i.id, success: false, error: 'Simulated failure' };
            if (!res.success) return { id: i.id, success: false, error: res.message || 'Rename failed', code: res.code };
            return { id: i.id, success: true };
          } catch (e) {
            return { id: i.id, success: false, error: (e as Error)?.message || 'Rename failed' };
          }
        }),
      );
      const perItem = results.map((r, idx) =>
        r.status === 'fulfilled'
          ? { ...(r.value as object), id: intents[idx].id, requestedFilename: intents[idx].next.filename }
          : { id: intents[idx].id, success: false, error: (r as { reason?: Error }).reason?.message || 'Rename failed', requestedFilename: intents[idx].next.filename },
      );
      const failedIds = new Set(perItem.filter((r) => !(r as { success?: boolean }).success).map((r) => r.id));
      const succeeded = intents.filter((i) => !failedIds.has(i.id));
      if (failedIds.size > 0) {
        const rolledBack = optimistic.map((v) => {
          if (!failedIds.has(v.id)) return v;
          const orig = intents.find((i) => i.id === v.id)!.original;
          return { ...v, displayName: orig.displayName, filename: orig.filename };
        });
        setState((prev) => ({ ...prev, videos: rolledBack }));
        rolledBack.forEach((vid) => EnhancedFilterEngine.updateVideoInSearchIndex(vid));
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
          undoId, undoType: 'rename', undoDescription: 'Batch rename', timeout: BATCH_UNDO_WINDOW_MS,
          undoCallback: async () => {
            const revertable = new Set<string>();
            const errors: string[] = [];
            for (const original of originalsForUndo) {
              const next = succeededMap.get(original.id)?.next;
              if ((next?.filename ?? original.filename) !== original.filename) {
                const revert = await attemptDiskRename(original.id, original.filename);
                if (!revert.success) { errors.push(original.id); continue; }
              }
              revertable.add(original.id);
            }
            setState((prev) => {
              const undoPayload = originalsForUndo.filter((o) => revertable.has(o.id));
              if (undoPayload.length === 0) return prev;
              const restored = VideoDatabase.batchRenameInDb(prev.videos, undoPayload);
              undoPayload.forEach((p) => {
                const vid = restored.find((v) => v.id === p.id);
                if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
              });
              return { ...prev, videos: restored };
            });
            if (errors.length > 0) throw new Error(`Failed to undo ${errors.length} rename${errors.length === 1 ? '' : 's'}.`);
          },
        });
      }
      return { total: intents.length, success: succeeded.length, failed: failedIds.size, results: perItem };
    },
    [state.videos, setState],
  );
}
