import { useCallback } from 'react';
import type { VideoManagerState } from '../types/video';
import { VideoDatabase } from '@/services/video-database';
import { EnhancedFilterEngine } from '@/services/enhanced-filter-engine';
import { FilesystemOps } from '@/services/filesystem-ops';
import { DirectoryDatabase } from '@/services/directory-database';
import { toastWithUndo } from '@/hooks/use-toast';
import { BATCH_UNDO_WINDOW_MS, getSimulatedFailureRate } from './batch-rename';

export function getDirectoryFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx === -1) return '';
  return DirectoryDatabase.normalizeDir(normalized.slice(0, idx));
}

export function useBatchMove(
  state: VideoManagerState,
  setState: React.Dispatch<React.SetStateAction<VideoManagerState>>,
) {
  return useCallback(
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
      working.forEach((vid) => EnhancedFilterEngine.updateVideoInSearchIndex(vid));
      const results = await Promise.allSettled(
        intents.map(async (i) => {
          try {
            const res = await FilesystemOps.moveFile(i.id, targetRelativeDirPath, opts);
            if (getSimulatedFailureRate() > 0 && Math.random() < getSimulatedFailureRate())
              return { id: i.id, success: false, error: 'Simulated failure' };
            if (!res.success) return { id: i.id, success: false, error: res.message || 'Move failed', code: res.code };
            return { id: i.id, success: true };
          } catch (e) {
            return { id: i.id, success: false, error: (e as Error)?.message || 'Move failed' };
          }
        }),
      );
      const perItem = results.map((r, idx) =>
        r.status === 'fulfilled'
          ? { ...(r.value as object), id: intents[idx].id }
          : { id: intents[idx].id, success: false, error: (r as { reason?: Error }).reason?.message || 'Move failed' },
      );
      const resolvedNameMap = new Map<string, string>();
      perItem.forEach((result, idx) => {
        const resolved = (result as { resolvedName?: string }).resolvedName;
        if ((result as { success?: boolean }).success && resolved) {
          resolvedNameMap.set(result.id, resolved);
          intents[idx].next.path = `${DirectoryDatabase.normalizeDir(targetRelativeDirPath)}${resolved}`;
        }
      });
      const failedIds = new Set(perItem.filter((r) => !(r as { success?: boolean }).success).map((r) => r.id));
      const succeeded = intents.filter((i) => !failedIds.has(i.id));
      if (failedIds.size > 0) {
        const rolledBack = working.map((v) => {
          if (!failedIds.has(v.id)) return v;
          const orig = intents.find((i) => i.id === v.id)!.original;
          return { ...v, path: orig.path };
        });
        setState((prev) => ({ ...prev, videos: rolledBack }));
        rolledBack.forEach((vid) => EnhancedFilterEngine.updateVideoInSearchIndex(vid));
        working = rolledBack;
      }
      const renamePayload: Array<{ id: string; displayName: string; filename: string }> = [];
      for (const s of succeeded) {
        working = VideoDatabase.updateVideoPath(working, s.id, s.next.path, s.next.rootKey);
        const resolvedName = resolvedNameMap.get(s.id);
        if (resolvedName) {
          const vidAfterPath = working.find((v) => v.id === s.id);
          if (vidAfterPath) renamePayload.push({ id: s.id, displayName: vidAfterPath.displayName, filename: resolvedName });
        }
      }
      if (renamePayload.length > 0) working = VideoDatabase.batchRenameInDb(working, renamePayload);
      if (succeeded.length > 0) {
        working.forEach((vid) => EnhancedFilterEngine.updateVideoInSearchIndex(vid));
        const snapshot = working;
        setState((prev) => ({ ...prev, videos: snapshot }));
        const undoId = `batch-move-${Date.now()}`;
        toastWithUndo({
          title: 'Batch move', description: `Moved ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}. Undo?`,
          undoId, undoType: 'move', undoDescription: 'Batch move', timeout: BATCH_UNDO_WINDOW_MS,
          undoCallback: async () => {
            const revertedIds: string[] = [];
            const errors: string[] = [];
            for (const mv of succeeded) {
              const revertDir = getDirectoryFromPath(mv.original.path);
              const originalFileName = mv.original.path.split('/').pop();
              const revert = await FilesystemOps.moveFile(mv.id, revertDir, { overwrite: true, preferredName: originalFileName });
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
            if (errors.length > 0) throw new Error(`Failed to undo move for ${errors.length} item${errors.length === 1 ? '' : 's'}.`);
          },
        });
      }
      return { total: intents.length, success: succeeded.length, failed: failedIds.size, results: perItem };
    },
    [state.videos, setState],
  );
}
