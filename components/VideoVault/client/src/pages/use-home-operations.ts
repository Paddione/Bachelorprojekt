import { useCallback, useState } from 'react';
import type { Video } from '@/types/video';
import { SplitVideoFormValues } from '@/components/video/split-video-modal';
import { SplitVideoResult } from '@/services/video-splitter';
import { splitFormToOptions } from '@/lib/split-form-mapping';
import { buildBatchName, getFilenameWithOriginalExt } from '@/services/rename-engine';
import { BatchResult, ConflictDialogState, ResolveDecisions } from './home-queries';
import { ConflictItem } from '@/components/conflict/conflict-resolution-dialog';

import { HomeOpsContext, resolveMoveItems, resolveRenameItems } from './home-conflicts';
export function useHomeOperations(ctx: HomeOpsContext) {
  const { state, actions, toast, showError, showSuccess, setLocation } = ctx;
  const [isEditTagsOpen, setIsEditTagsOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Video | null>(null);
  const [isBatchRenameOpen, setIsBatchRenameOpen] = useState(false);
  const [batchSelection, setBatchSelection] = useState<string[]>([]);
  const [isPresetManagerOpen, setIsPresetManagerOpen] = useState(false);
  const [isDirPickerOpen, setIsDirPickerOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Video | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const [splitTarget, setSplitTarget] = useState<Video | null>(null);
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState | null>(null);

  const closeModals = () => {
    setIsEditTagsOpen(false); setEditingVideo(null);
    setIsRenameOpen(false); setRenameTarget(null);
    setIsSplitOpen(false); setSplitTarget(null);
    setIsDirPickerOpen(false); setMoveTarget(null);
  };

  const handleScanDirectory = useCallback(async () => {
    try {
      const count = await (actions.scanDirectory as () => Promise<number>)();
      showSuccess('Directory Scanned', `Found and processed ${count} video files.`);
    } catch (error) {
      showError(error instanceof Error ? error : new Error('Failed to scan directory'),
        { context: { action: 'scanDirectory', component: 'home' }, onRetry: () => void handleScanDirectory(), showDetails: true });
    }
  }, [actions, showError, showSuccess]);

  const handleSubmitSplit = useCallback(async (form: SplitVideoFormValues): Promise<SplitVideoResult> => {
    const target = splitTarget || state.currentVideo;
    if (!target) return { success: false, message: 'No video selected', code: 'invalid_split' };
    const res = await (actions.splitVideo as (id: string, o: unknown) => Promise<SplitVideoResult>)(target.id, splitFormToOptions(form));
    if (res.success) toast({ title: 'Video split', description: 'Created two new files with your chosen names and tags.' });
    else showError(new Error(res.message || 'Unable to split video'), { context: { action: 'splitVideo', component: 'home', code: res.code }, showDetails: false });
    return res;
  }, [splitTarget, state.currentVideo, actions, toast, showError]);

  const handleFileDrop = useCallback(async (files: FileList) => {
    try {
      const count = await (actions.handleDroppedFiles as (f: FileList) => Promise<number>)(files);
      toast({ title: 'Files Processed', description: `Successfully processed ${count} video files.` });
    } catch {
      toast({ title: 'Processing Failed', description: 'Failed to process dropped files.', variant: 'destructive' });
    }
  }, [actions, toast]);

  const handleResolveConflicts = useCallback(async (decisions: ResolveDecisions) => {
    if (!conflictDialog) return;
    if (conflictDialog.operation === 'rename' || conflictDialog.operation === 'batch-rename') {
      await resolveRenameItems(ctx, conflictDialog, decisions);
    } else {
      await resolveMoveItems(ctx, conflictDialog, decisions);
    }
    setConflictDialog(null);
  }, [conflictDialog, ctx]);

  const submitRename = useCallback(async (id: string, name: string, applyTo: 'displayName' | 'filename' | 'both') => {
    const res = await (actions.renameVideo as (id: string, n: string, a: string) => Promise<{ success: boolean; message?: string; code?: string }>)(id, name, applyTo);
    if (!res.success && res.code === 'conflict') {
      setConflictDialog({
        operation: 'rename', applyTo,
        items: [{
          id, currentName: renameTarget?.displayName ?? name,
          desiredFileName: getFilenameWithOriginalExt(name, renameTarget?.filename ?? name),
          location: renameTarget?.path, operation: 'rename',
        }],
        desiredBaseById: { [id]: name },
      });
      setIsRenameOpen(false);
      setRenameTarget(null);
      return { success: true };
    }
    if (!res.success) toast({ title: 'Rename failed', description: res.message || 'Unable to rename file.', variant: 'destructive' });
    return res;
  }, [actions, renameTarget, toast]);

  const submitBatchRename = useCallback(async (ids: string[], opts: { applyTo?: 'displayName' | 'filename' | 'both' }): Promise<number> => {
    const res = await (actions.batchRename as (ids: string[], o: unknown) => Promise<BatchResult | number>)(ids, opts);
    if (typeof res === 'number') return res;
    const conflicts = res.results?.filter((r) => r && r.code === 'conflict') ?? [];
    if (conflicts.length > 0) {
      const desiredBaseById: Record<string, string> = {};
      const items: ConflictItem[] = [];
      ids.forEach((id, index) => {
        const v = state.videos.find((x) => x.id === id);
        if (!v) return;
        desiredBaseById[id] = buildBatchName(v, index, opts as never);
        if (conflicts.some((r) => r.id === id)) {
          items.push({
            id, currentName: v.displayName,
            desiredFileName: opts.applyTo === 'displayName' ? v.filename : getFilenameWithOriginalExt(desiredBaseById[id], v.filename),
            location: v.path, operation: 'rename',
          });
        }
      });
      if (items.length) setConflictDialog({ operation: 'batch-rename', applyTo: opts.applyTo ?? 'both', items, desiredBaseById });
    }
    if (res.failed > 0) toast({ title: 'Batch Rename', description: `Renamed ${res.success}, ${res.failed} failed (rolled back).`, variant: 'destructive' });
    if (!res.failed && res.success === 0) toast({ title: 'Batch Rename', description: 'No files were renamed.', variant: 'destructive' });
    return res.success;
  }, [actions, state.videos, toast]);

  const selectDirectory = useCallback(async (dir: string) => {
    if (moveTarget) {
      const res = await (actions.moveFileToDirectory as (id: string, d: string) => Promise<{ success: boolean; message?: string; code?: string }>)(moveTarget.id, dir);
      if (!res.success && res.code === 'conflict') {
        setConflictDialog({
          operation: 'move', targetDir: dir,
          items: [{ id: moveTarget.id, currentName: moveTarget.displayName, desiredFileName: moveTarget.filename, location: dir, operation: 'move' }],
        });
      } else if (!res.success) {
        toast({ title: 'Move failed', description: res.message || 'Unable to move file.', variant: 'destructive' });
      }
    } else if (batchSelection.length > 0) {
      const res = await (actions.batchMove as (ids: string[], d: string) => Promise<BatchResult>)(batchSelection, dir);
      const ids = res.results?.filter((r) => r && r.code === 'conflict').map((r) => r.id) ?? [];
      if (ids.length > 0) {
        const items = ids.map((id: string) => {
          const v = state.videos.find((x) => x.id === id);
          return v ? { id, currentName: v.displayName, desiredFileName: v.filename, location: dir, operation: 'move' as const } : null;
        }).filter(Boolean) as ConflictItem[];
        if (items.length) setConflictDialog({ operation: 'batch-move', targetDir: dir, items });
      }
      if (res.failed > 0) toast({ title: 'Batch Move', description: `Moved ${res.success}, ${res.failed} failed (rolled back).`, variant: 'destructive' });
    }
    setIsDirPickerOpen(false);
    setMoveTarget(null);
    setBatchSelection([]);
  }, [moveTarget, batchSelection, actions, state.videos, toast]);

  const openVideo = {
    editTags: (v: Video) => { setEditingVideo(v); setIsEditTagsOpen(true); },
    rename: (v: Video) => { setRenameTarget(v); setIsRenameOpen(true); },
    split: (v: Video) => { setSplitTarget(v); setIsSplitOpen(true); },
    focus: (v: Video) => setLocation(`/focus/${v.id}`),
    categorize: (v: Video) => setLocation(`/categorize/${v.id}`),
    move: (v: Video) => { setMoveTarget(v); setIsDirPickerOpen(true); },
  };

  const promptCreateDirectory = async () => {
    const input = prompt('New directory (relative to scanned root), e.g. "sub/folder"');
    if (input?.trim()) {
      const res = await (actions.createDirectory as (d: string) => Promise<{ success: boolean; message: string }>)(input.trim());
      toast({ title: res.success ? 'Directory Created' : 'Create Directory', description: res.message });
    }
  };

  const promptDeleteDirectory = async () => {
    const input = prompt('Delete directory (relative to scanned root), e.g. "sub/folder"');
    if (input?.trim()) {
      const res = await (actions.deleteDirectory as (d: string) => Promise<{ success: boolean; message: string }>)(input.trim());
      toast({ title: res.success ? 'Directory Deleted' : 'Delete Directory', description: res.message });
    }
  };

  const savePreset = () => {
    const name = prompt('Enter preset name:');
    if (!name?.trim()) return;
    try {
      (actions.saveFilterPreset as (n: string) => void)(name.trim());
      toast({ title: 'Preset Saved', description: `Filter preset "${name}" has been saved.` });
    } catch (error) {
      toast({ title: 'Save Failed', description: error instanceof Error ? error.message : 'Failed to save preset', variant: 'destructive' });
    }
  };

  return {
    modals: {
      isEditTagsOpen, editingVideo, isRenameOpen, renameTarget, isBatchRenameOpen, batchSelection,
      isPresetManagerOpen, isDirPickerOpen, moveTarget, isSettingsOpen, isSplitOpen, splitTarget, conflictDialog,
      setIsEditTagsOpen, setEditingVideo, setIsRenameOpen, setRenameTarget, setIsBatchRenameOpen,
      setBatchSelection, setIsPresetManagerOpen, setIsDirPickerOpen, setIsSettingsOpen, setIsSplitOpen,
      setConflictDialog,
    },
    handleScanDirectory, handleSubmitSplit, handleFileDrop, handleResolveConflicts,
    submitRename, submitBatchRename, selectDirectory, openVideo, closeModals,
    promptCreateDirectory, promptDeleteDirectory, savePreset,
    openPresetManager: () => setIsPresetManagerOpen(true),
  };
}

export type HomeOperations = ReturnType<typeof useHomeOperations>;
