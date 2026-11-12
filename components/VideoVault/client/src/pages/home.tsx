import { useState } from 'react';
import { useLocation } from 'wouter';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { useVideoManager } from '@/hooks/use-video-manager';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/components/ui/error-toast';
import type { Video } from '@/types/video';
import { DirectoryDatabase } from '@/services/directory-database';
import { useHomePlaylist } from './use-home-playlist';
import { useHomeOperations } from './use-home-operations';
import { activeFilterCount, buildAdvancedFilters } from './home-queries';
import { FilterSheet, HomeWorkspace } from './home-layout';
import { HomeMediaDialogs } from './home-media-dialogs';
import { HomeFileDialogs } from './home-file-dialogs';

export default function Home() {
  const [, setLocation] = useLocation();
  const { state, actions } = useVideoManager();
  const { toast } = useToast();
  const { showError, showSuccess } = useErrorToast();
  const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const ops = useHomeOperations({ state, actions, toast, showError, showSuccess, setLocation });
  const playlist = useHomePlaylist(state.filteredVideos, state.currentVideo,
    (v) => actions.setCurrentVideo(v) as void);
  const m = ops.modals;

  const filtersActiveCount = activeFilterCount(state);
  const advancedFilters = buildAdvancedFilters(state);

  const playVideo = (video: Video) => {
    actions.setCurrentVideo(video);
    setIsVideoPlayerOpen(true);
  };

  const rescanCurrent = () => void (async () => {
    const res = await actions.rescanLastRoot();
    const removed = res.removed ?? 0;
    toast({
      title: res.success ? 'Rescan complete' : 'Rescan failed',
      description: res.success ? `Reattached ${res.reattached}. Removed ${removed} missing.` : res.message || 'Failed',
    });
    if (res.success && res.missingIds && state.currentVideo && res.missingIds.includes(state.currentVideo.id)) {
      setIsVideoPlayerOpen(false);
      actions.setCurrentVideo(null);
    }
  })();

  const sidebar = (extraClass = '', onClose?: () => void) => (
    <Sidebar searchQuery={state.searchQuery} selectedCategories={state.selectedCategories}
      dateRange={state.dateRange} availableCategories={state.availableCategories}
      onSearchChange={actions.setSearchQuery} onCategoryToggle={actions.toggleCategoryFilter}
      onDateRangeChange={actions.setDateRange} onClearAllFilters={actions.clearAllFilters}
      onSavePreset={ops.savePreset} onLoadPreset={ops.openPresetManager}
      className={extraClass} variant={onClose ? 'sheet' : 'sidebar'} onClose={onClose} />
  );

  const closePlayer = () => { setIsVideoPlayerOpen(false); actions.setCurrentVideo(null); };
  const deleteFile = (video: Video) => void (async () => {
    const res = await actions.deleteFile(video.id);
    if (!res.success) toast({ title: 'Delete', description: res.message || 'Delete failed.', variant: 'destructive' });
  })();
  const batchDelete = (ids: string[]) => void (async () => {
    const res = await actions.batchDelete(ids);
    if (res.failed > 0) toast({ title: 'Batch Delete', description: `Deleted ${res.success}, ${res.failed} failed.`, variant: 'destructive' });
  })();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header isScanning={state.isScanning} scanProgress={state.scanProgress}
        onScanDirectory={() => void ops.handleScanDirectory()}
        onCreateDirectory={() => void ops.promptCreateDirectory()}
        onDeleteDirectory={() => void ops.promptDeleteDirectory()}
        onCancelScan={actions.cancelScan} onRescanLastRoot={DirectoryDatabase.getLastRootKey() ? rescanCurrent : undefined}
        onOpenSettings={() => m.setIsSettingsOpen(true)}
        onToggleFilters={() => setIsFiltersOpen((p) => !p)}
        activeFilterCount={filtersActiveCount} isFiltersOpen={isFiltersOpen} />
      <HomeWorkspace
        ws={{
          videos: state.videos, filteredVideos: state.filteredVideos,
          selectedCategories: state.selectedCategories, isScanning: state.isScanning,
          searchQuery: state.searchQuery, dateRange: state.dateRange,
          availableCategories: state.availableCategories, sort: state.sort ?? { field: 'displayName', direction: 'asc' },
          advancedFilters, filtersActiveCount, isFiltersOpen, pinnedVideoId: state.pinnedVideoId,
        }}
        cb={{
          onVideoPlay: playVideo, onVideoEditTags: ops.openVideo.editTags,
          onVideoRename: ops.openVideo.rename, onVideoSplit: ops.openVideo.split,
          onFocusMode: ops.openVideo.focus, onCategorize: ops.openVideo.categorize,
          onPin: (id) => actions.pinVideo(id) as void, onSelectDirectory: () => void ops.handleScanDirectory(),
          onFileDrop: (f) => void ops.handleFileDrop(f), onDeleteFile: deleteFile,
          onChangeSort: (f, d) => actions.setSort(f, d) as void, onRequestMove: ops.openVideo.move,
          onRemoveCategory: (id, t, v) => actions.removeVideoCategory(id, t, v) as void,
          onUpdateCategories: actions.updateVideoCategories,
          onOpenBatchRename: (ids) => { m.setBatchSelection(ids); m.setIsBatchRenameOpen(true); },
          onBulkMoveRequest: (ids) => { m.setBatchSelection(ids); m.setIsDirPickerOpen(true); },
          onBulkDeleteRequest: batchDelete, onAdvancedFiltersChange: actions.setAdvancedFilters,
          onToggleFiltersPanel: () => setIsFiltersOpen(true),
        }}
        sidebarProps={{
          onSearchChange: actions.setSearchQuery, onCategoryToggle: actions.toggleCategoryFilter,
          onDateRangeChange: actions.setDateRange, onClearAllFilters: actions.clearAllFilters,
          onSavePreset: ops.savePreset, onLoadPreset: ops.openPresetManager,
        }}
        onUnpin={() => actions.unpinVideo()}
        onPinVideo={(id) => actions.pinVideo(id)} />
      <FilterSheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}
        sidebar={sidebar('h-full', () => setIsFiltersOpen(false))} />
      <HomeMediaDialogs currentVideo={state.currentVideo} playerOpen={isVideoPlayerOpen}
        onClosePlayer={closePlayer} categories={state.availableCategories}
        onUpdateVideo={actions.updateVideoCategories} onRemoveCategory={actions.removeVideoCategory}
        onSubmitSplit={ops.handleSubmitSplit} onFocusMode={ops.openVideo.focus} onRescan={rescanCurrent}
        playlist={playlist} onToggleShuffle={playlist.toggleShuffle}
        editingVideo={m.editingVideo} editOpen={m.isEditTagsOpen}
        onCloseEdit={() => { m.setIsEditTagsOpen(false); m.setEditingVideo(null); }}
        onSaveTags={actions.updateVideoCategories}
        splitTarget={m.splitTarget} splitOpen={m.isSplitOpen}
        onCloseSplit={() => { m.setIsSplitOpen(false); ops.modals.setIsSplitOpen(false); }} />
      <HomeFileDialogs videos={state.videos} categories={state.availableCategories}
        m={{
          isRenameOpen: m.isRenameOpen, renameTarget: m.renameTarget,
          isBatchRenameOpen: m.isBatchRenameOpen, batchSelection: m.batchSelection,
          isPresetManagerOpen: m.isPresetManagerOpen, isDirPickerOpen: m.isDirPickerOpen,
          isSettingsOpen: m.isSettingsOpen, conflictDialog: m.conflictDialog,
        }}
        cb={{
          submitRename: ops.submitRename, submitBatchRename: ops.submitBatchRename,
          selectDirectory: (d) => void ops.selectDirectory(d),
          resolveConflicts: (d) => void ops.handleResolveConflicts(d),
          loadPreset: (p) => {
            actions.loadFilterPreset(p.name);
            toast({ title: 'Preset Loaded', description: `Filter preset "${p.name}" applied.` });
          },
          onSettingsChange: () => toast({ title: 'Settings Updated', description: 'Your preferences have been saved successfully.' }),
          closeRename: () => { m.setIsRenameOpen(false); m.setRenameTarget(null); },
          closeBatchRename: () => m.setIsBatchRenameOpen(false),
          closePresetManager: () => m.setIsPresetManagerOpen(false),
          closeDirPicker: () => m.setIsDirPickerOpen(false),
          closeSettings: () => m.setIsSettingsOpen(false),
          closeConflicts: () => m.setConflictDialog(null),
        }} />
    </div>
  );
}
