import { Dispatch, SetStateAction } from 'react';
import type { VideoManagerState } from '../types/video';
import { useLibraryIo } from './library-io';
import { useBatchRename } from './batch-rename';
import { useBatchMove } from './batch-move';
import { useBatchDelete } from './batch-delete';

export { BATCH_UNDO_WINDOW_MS, getSimulatedFailureRate } from './batch-rename';
export { getDirectoryFromPath } from './batch-move';

export function useVideoBatch(
  state: VideoManagerState,
  setState: Dispatch<SetStateAction<VideoManagerState>>,
  pendingDeleteFinalizers: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>
) {
  const { exportData, importData, createBackup, saveFilterPreset, loadFilterPreset } = useLibraryIo(state, setState);
  const batchRename = useBatchRename(state, setState);
  const batchMove = useBatchMove(state, setState);
  const batchDelete = useBatchDelete(state, setState, pendingDeleteFinalizers);

  return { exportData, importData, createBackup, saveFilterPreset, loadFilterPreset, batchRename, batchMove, batchDelete };
}
