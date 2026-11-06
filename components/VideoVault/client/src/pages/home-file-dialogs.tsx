import { Suspense, lazy } from 'react';
import { Video, Category } from '@/types/video';
import { RenameModal } from '@/components/video/rename-modal';
import { BatchRenameModal } from '@/components/video/batch-rename-modal';
import { DirectoryPickerModal } from '@/components/directory-picker-modal';
import { SettingsModal } from '@/components/settings-modal';
import { ConflictResolutionDialog } from '@/components/conflict/conflict-resolution-dialog';
import { ConflictDialogState, ResolveDecisions } from './home-queries';
import { SplitVideoFormValues } from '@/components/video/split-video-modal';

const PresetManagerModal = lazy(() =>
  import('@/components/preset-manager-modal').then((m) => ({ default: m.PresetManagerModal })),
);

export interface FileDialogCallbacks {
  submitRename: (id: string, name: string, applyTo: 'displayName' | 'filename' | 'both') => Promise<{ success: boolean; message?: string; code?: string }>;
  submitBatchRename: (ids: string[], opts: { applyTo?: 'displayName' | 'filename' | 'both' }) => Promise<number>;
  selectDirectory: (dir: string) => void;
  resolveConflicts: (d: ResolveDecisions) => void;
  loadPreset: (preset: { name: string }) => void;
  onSettingsChange: () => void;
}

export function HomeFileDialogs({ videos, categories, m, cb }: {
  videos: Video[]; categories: Category[];
  m: {
    isRenameOpen: boolean; renameTarget: Video | null;
    isBatchRenameOpen: boolean; batchSelection: string[];
    isPresetManagerOpen: boolean; isDirPickerOpen: boolean;
    isSettingsOpen: boolean; conflictDialog: ConflictDialogState | null;
  };
  cb: FileDialogCallbacks & {
    closeRename: () => void; closeBatchRename: () => void;
    closePresetManager: () => void; closeDirPicker: () => void;
    closeSettings: () => void; closeConflicts: () => void;
  };
}) {
  return (
    <>
      <RenameModal video={m.renameTarget} isOpen={m.isRenameOpen} onClose={cb.closeRename} onSubmit={cb.submitRename} />
      <BatchRenameModal videos={videos} selectedIds={m.batchSelection} isOpen={m.isBatchRenameOpen}
        onClose={cb.closeBatchRename} onSubmit={cb.submitBatchRename} />
      <Suspense fallback={null}>
        <PresetManagerModal isOpen={m.isPresetManagerOpen} onClose={cb.closePresetManager} onLoadPreset={cb.loadPreset} />
      </Suspense>
      <DirectoryPickerModal isOpen={m.isDirPickerOpen} onClose={cb.closeDirPicker} onSelect={(d) => void cb.selectDirectory(d)} />
      <SettingsModal isOpen={m.isSettingsOpen} onClose={cb.closeSettings} onSettingsChange={cb.onSettingsChange} />
      <ConflictResolutionDialog open={Boolean(m.conflictDialog)} items={m.conflictDialog?.items ?? []}
        onClose={cb.closeConflicts} onResolve={(d) => void cb.resolveConflicts(d)} />
    </>
  );
}

export type { SplitVideoFormValues };
