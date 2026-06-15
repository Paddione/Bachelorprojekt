import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { MainContent } from '@/components/layout/main-content';
import { VideoPlayerModal } from '@/components/video/video-player-modal';
import { lazy, Suspense } from 'react';
import { useVideoManager } from '@/hooks/use-video-manager';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/components/ui/error-toast';
import { Video, type AdvancedFilters } from '@/types/video';
import { RenameModal } from '@/components/video/rename-modal';
import { BatchRenameModal } from '@/components/video/batch-rename-modal';
import { buildBatchName, getFilenameWithOriginalExt } from '@/services/rename-engine';
const EditTagsModal = lazy(() =>
  import('@/components/video/edit-tags-modal').then((m) => ({ default: m.EditTagsModal })),
);
const PresetManagerModal = lazy(() =>
  import('@/components/preset-manager-modal').then((m) => ({ default: m.PresetManagerModal })),
);
import { DirectoryPickerModal } from '@/components/directory-picker-modal';
import { SettingsModal } from '@/components/settings-modal';
import { DirectoryDatabase } from '@/services/directory-database';
import { AppSettingsService } from '@/services/app-settings';
import { SplitVideoModal, type SplitVideoFormValues } from '@/components/video/split-video-modal';
import { SplitPaneEditor } from '@/components/video/split-pane-editor';
import { ApplyToVisible } from '@/components/bulk/apply-to-visible';
import type { SplitVideoResult } from '@/services/video-splitter';
import { splitFormToOptions } from '@/lib/split-form-mapping';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ConflictResolutionDialog,
  type ConflictItem,
  type ConflictStrategy,
} from '@/components/conflict/conflict-resolution-dialog';

type ConflictDialogState = {
  operation: 'rename' | 'batch-rename' | 'move' | 'batch-move';
  items: ConflictItem[];
  applyTo?: 'displayName' | 'filename' | 'both';
  desiredBaseById?: Record<string, string>;
  targetDir?: string;
};

interface BatchResult {
  success: number;
  failed: number;
  results?: Array<{
    id: string;
    success: boolean;
    code?: string;
    error?: string;
  }>;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { state, actions } = useVideoManager();
  const { toast } = useToast();
  const { showError, showSuccess } = useErrorToast();
  const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState(false);
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
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState | null>(null);
  const filtersActiveCount =
    state.selectedCategories.length +
    (state.searchQuery.trim() ? 1 : 0) +
    (state.dateRange.startDate || state.dateRange.endDate ? 1 : 0) +
    (state.fileSizeRange.min > 0 || state.fileSizeRange.max > 0 ? 1 : 0) +
    (state.durationRange.min > 0 || state.durationRange.max > 0 ? 1 : 0);
  const advancedFilters: AdvancedFilters = {
    dateRange: state.dateRange,
    fileSizeRange: state.fileSizeRange,
    durationRange: state.durationRange,
  };

  // Playlist state
  const [playlistIds, setPlaylistIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [shuffle, setShuffle] = useState<boolean>(false);
  useEffect(() => {
    void (async () => {
      const saved = await AppSettingsService.get<boolean>('vv.shuffle', (raw) => {
        if (raw === '1') return true;
        if (raw === '0') return false;
        if (raw === 'true') return true;
        if (raw === 'false') return false;
        return undefined;
      });
      if (typeof saved === 'boolean') setShuffle(saved);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      await AppSettingsService.set('vv.shuffle', shuffle);
    })();
  }, [shuffle]);

  // Keep playlist in sync with filtered videos and currentVideo
  useEffect(() => {
    const ids = state.filteredVideos.map((v) => v.id);
    if (shuffle) {
      // Keep current video at currentIndex where possible
      const currentId = state.currentVideo?.id;
      const shuffled = shuffleArray(ids);
      if (currentId) {
        const idx = shuffled.indexOf(currentId);
        if (idx > 0) {
          // rotate so currentId is at currentIndex
          const rotated = [shuffled[idx], ...shuffled.slice(idx + 1), ...shuffled.slice(0, idx)];
          setPlaylistIds(rotated);
          setCurrentIndex(0);
        } else {
          setPlaylistIds(shuffled);
          setCurrentIndex(currentId ? shuffled.indexOf(currentId) : -1);
        }
      } else {
        setPlaylistIds(shuffled);
        setCurrentIndex(-1);
      }
    } else {
      setPlaylistIds(ids);
      const idx = state.currentVideo ? ids.indexOf(state.currentVideo.id) : -1;
      setCurrentIndex(idx);
    }
  }, [state.filteredVideos, state.currentVideo, shuffle]);

  function shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const playVideo = (video: Video) => {
    actions.setCurrentVideo(video);
    setIsVideoPlayerOpen(true);
    // Playlist will sync via effect
  };

  const goPrev = () => {
    if (playlistIds.length === 0 || currentIndex < 0) return;
    const nextIndex = (currentIndex - 1 + playlistIds.length) % playlistIds.length;
    const id = playlistIds[nextIndex];
    const vid = state.filteredVideos.find((v) => v.id === id);
    if (vid) {
      actions.setCurrentVideo(vid);
      setCurrentIndex(nextIndex);
    }
  };

  const goNext = () => {
    if (playlistIds.length === 0 || currentIndex < 0) return;
    const nextIndex = (currentIndex + 1) % playlistIds.length;
    const id = playlistIds[nextIndex];
    const vid = state.filteredVideos.find((v) => v.id === id);
    if (vid) {
      actions.setCurrentVideo(vid);
      setCurrentIndex(nextIndex);
    }
  };

  const toggleShuffle = () => {
    setShuffle((prev) => !prev);
  };

  const handleScanDirectory = async () => {
    try {
      const count = await actions.scanDirectory();
      showSuccess('Directory Scanned', `Found and processed ${count} video files.`);
    } catch (error) {
      showError(error instanceof Error ? error : new Error('Failed to scan directory'), {
        context: { action: 'scanDirectory', component: 'home' },
        onRetry: () => void handleScanDirectory(),
        showDetails: true,
      });
    }
  };


  const handleSubmitSplit = async (form: SplitVideoFormValues): Promise<SplitVideoResult> => {
    const target = splitTarget || state.currentVideo;
    if (!target) return { success: false, message: 'No video selected', code: 'invalid_split' };
    const res = await actions.splitVideo(target.id, splitFormToOptions(form));
    if (res.success) {
      toast({
        title: 'Video split',
        description: 'Created two new files with your chosen names and tags.',
      });
    } else {
      showError(new Error(res.message || 'Unable to split video'), {
        context: { action: 'splitVideo', component: 'home', code: res.code },
        showDetails: false,
      });
    }
    return res;
  };

  const handleVideoPlay = (video: Video) => {
    playVideo(video);
  };

  const handleVideoEditTags = (video: Video) => {
    setEditingVideo(video);
    setIsEditTagsOpen(true);
  };

  const handleVideoRename = (video: Video) => {
    setRenameTarget(video);
    setIsRenameOpen(true);
  };

  const handleVideoSplit = (video: Video) => {
    setSplitTarget(video);
    setIsSplitOpen(true);
  };

  const handleFocusMode = (video: Video) => {
    setLocation(`/focus/${video.id}`);
  };

  const handleCategorize = (video: Video) => {
    setLocation(`/categorize/${video.id}`);
  };

  const handleFileDrop = async (files: FileList) => {
    try {
      const count = await actions.handleDroppedFiles(files);
      toast({
        title: 'Files Processed',
        description: `Successfully processed ${count} video files.`,
      });
    } catch (error) {
      toast({
        title: 'Processing Failed',
        description: 'Failed to process dropped files.',
        variant: 'destructive',
      });
    }
  };

  const handleResolveConflicts = async (decisions: Record<string, ConflictStrategy>) => {
    if (!conflictDialog) return;
    const tasks: Promise<unknown>[] = [];

    if (conflictDialog.operation === 'rename' || conflictDialog.operation === 'batch-rename') {
      const applyTo = conflictDialog.applyTo ?? 'both';
      conflictDialog.items.forEach((item) => {
        const strategy = decisions[item.id] ?? 'keep_both';
        if (strategy === 'skip') return;
        const baseName =
          conflictDialog.desiredBaseById?.[item.id] ??
          item.desiredFileName.replace(/\.[^./]+$/, '');
        tasks.push(
          actions
            .renameVideo(item.id, baseName, applyTo, {
              overwrite: strategy === 'overwrite',
              conflictStrategy: strategy === 'keep_both' ? 'keep_both' : undefined,
            })
            .then((res: { success: boolean; message?: string }) => {
              if (!res.success) {
                toast({
                  title: 'Rename failed',
                  description: res.message || 'Unable to rename file.',
                  variant: 'destructive',
                });
              }
            }),
        );
      });
    } else if (conflictDialog.operation === 'move' || conflictDialog.operation === 'batch-move') {
      const targetDir = conflictDialog.targetDir;
      conflictDialog.items.forEach((item) => {
        const strategy = decisions[item.id] ?? 'keep_both';
        if (strategy === 'skip' || !targetDir) return;
        tasks.push(
          actions
            .moveFileToDirectory(item.id, targetDir, {
              overwrite: strategy === 'overwrite',
              conflictStrategy: strategy === 'keep_both' ? 'keep_both' : undefined,
            })
            .then((res: { success: boolean; message?: string }) => {
              if (!res.success) {
                toast({
                  title: 'Move failed',
                  description: res.message || 'Unable to move file.',
                  variant: 'destructive',
                });
              }
            }),
        );
      });
    }

    await Promise.all(tasks);
    setConflictDialog(null);
  };

  const handleSavePreset = () => {
    const name = prompt('Enter preset name:');
    if (name?.trim()) {
      try {
        actions.saveFilterPreset(name.trim());
        toast({
          title: 'Preset Saved',
          description: `Filter preset "${name}" has been saved.`,
        });
      } catch (error) {
        toast({
          title: 'Save Failed',
          description: error instanceof Error ? error.message : 'Failed to save preset',
          variant: 'destructive',
        });
      }
    }
  };

  const handleLoadPreset = () => {
    setIsPresetManagerOpen(true);
  };

  const promptCreateDirectory = async () => {
    const input = prompt('New directory (relative to scanned root), e.g. "sub/folder"');
    if (input && input.trim()) {
      const res = await actions.createDirectory(input.trim());
      toast({
        title: res.success ? 'Directory Created' : 'Create Directory',
        description: res.message || (res.success ? 'Success' : 'Failed'),
      });
    }
  };

  const promptDeleteDirectory = async () => {
    const input = prompt('Delete directory (relative to scanned root), e.g. "sub/folder"');
    if (input && input.trim()) {
      const res = await actions.deleteDirectory(input.trim());
      toast({
        title: res.success ? 'Directory Deleted' : 'Delete Directory',
        description: res.message || (res.success ? 'Success' : 'Failed'),
      });
    }
  };

  const handleSettingsChange = () => {
    toast({
      title: 'Settings Updated',
      description: 'Your preferences have been saved successfully.',
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        isScanning={state.isScanning}
        scanProgress={state.scanProgress}
        onScanDirectory={() => void handleScanDirectory()}
        onCreateDirectory={() => void promptCreateDirectory()}
        onDeleteDirectory={() => void promptDeleteDirectory()}
        onCancelScan={actions.cancelScan}
        onRescanLastRoot={
          DirectoryDatabase.getLastRootKey()
            ? () =>
                void (async () => {
                  const res = await actions.rescanLastRoot();
                  const removed = res.removed ?? 0;
                  toast({
                    title: res.success ? 'Rescan complete' : 'Rescan failed',
                    description: res.success
                      ? `Reattached ${res.reattached}. Removed ${removed} missing.`
                      : res.message || 'Failed',
                  });
                  if (
                    res.success &&
                    res.missingIds &&
                    state.currentVideo &&
                    res.missingIds.includes(state.currentVideo.id)
                  ) {
                    setIsVideoPlayerOpen(false);
                    actions.setCurrentVideo(null);
                  }
                })()
            : undefined
        }
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleFilters={() => setIsFiltersOpen((prev) => !prev)}
        activeFilterCount={filtersActiveCount}
        isFiltersOpen={isFiltersOpen}
      />

      {state.filteredVideos.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1 border-b bg-card/50">
          <ApplyToVisible
            filteredCount={state.filteredVideos.length}
            onApply={(type, value, mode) => actions.applyToVisible(type, value, mode)}
            availableCategories={state.availableCategories}
          />
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <Sidebar
          searchQuery={state.searchQuery}
          selectedCategories={state.selectedCategories}
          dateRange={state.dateRange}
          availableCategories={state.availableCategories}
          onSearchChange={actions.setSearchQuery}
          onCategoryToggle={actions.toggleCategoryFilter}
          onDateRangeChange={actions.setDateRange}
          onClearAllFilters={actions.clearAllFilters}
          onSavePreset={handleSavePreset}
          onLoadPreset={handleLoadPreset}
          className="hidden lg:flex w-[22rem] flex-shrink-0"
          variant="sidebar"
        />

        <MainContent
          videos={state.videos}
          filteredVideos={state.filteredVideos}
          selectedCategories={state.selectedCategories}
          isScanning={state.isScanning}
          onVideoPlay={handleVideoPlay}
          onVideoEditTags={handleVideoEditTags}
          onVideoRename={handleVideoRename}
          onVideoSplit={handleVideoSplit}
          onFocusMode={handleFocusMode}
          onCategorize={handleCategorize}
          onPin={(video) => actions.pinVideo(video.id)}
          onSelectDirectory={() => void handleScanDirectory()}
          onFileDrop={(files) => void handleFileDrop(files)}
          onDeleteFile={(video) =>
            void (async () => {
              const res = await actions.deleteFile(video.id);
              if (!res.success) {
                toast({
                  title: 'Delete',
                  description: res.message || 'Delete failed.',
                  variant: 'destructive',
                });
              }
            })()
          }
          sort={state.sort}
          onChangeSort={(s) => actions.setSort(s.field, s.direction) as void}
          onRequestMove={(video) => {
            setMoveTarget(video);
            setIsDirPickerOpen(true);
          }}
          onRemoveCategory={(videoId, type, value) =>
            actions.removeVideoCategory(videoId, type, value) as void
          }
          onUpdateCategories={actions.updateVideoCategories}
          onOpenBatchRename={(ids) => {
            setBatchSelection(ids);
            setIsBatchRenameOpen(true);
          }}
          onBulkMoveRequest={(ids) =>
            void (async () => {
              // Reuse directory picker; stash IDs in ref via state
              setBatchSelection(ids);
              setIsDirPickerOpen(true);
            })()
          }
          onBulkDeleteRequest={(ids) =>
            void (async () => {
              const res = await actions.batchDelete(ids);
              if (res.failed > 0) {
                toast({
                  title: 'Batch Delete',
                  description: `Deleted ${res.success}, ${res.failed} failed.`,
                  variant: 'destructive',
                });
              }
            })()
          }
          onAdvancedFiltersChange={actions.setAdvancedFilters}
          advancedFilters={advancedFilters}
          onToggleFiltersPanel={() => setIsFiltersOpen(true)}
          filtersActiveCount={filtersActiveCount}
          searchQuery={state.searchQuery}
          isFiltersOpen={isFiltersOpen}
        />

        {state.pinnedVideoId && (
          <SplitPaneEditor
            videos={state.videos}
            filteredVideos={state.filteredVideos}
            pinnedVideoId={state.pinnedVideoId}
            availableCategories={state.availableCategories}
            onUpdateCategories={actions.updateVideoCategories}
            onRemoveCategory={(videoId, type, value) =>
              actions.removeVideoCategory(videoId, type, value) as void
            }
            onClose={() => actions.unpinVideo()}
            onPinVideo={(id) => actions.pinVideo(id)}
          />
        )}
      </div>

      <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
        <SheetContent side="left" className="w-full sm:w-[420px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Adjust filters and presets</SheetDescription>
          </SheetHeader>
          <Sidebar
            searchQuery={state.searchQuery}
            selectedCategories={state.selectedCategories}
            dateRange={state.dateRange}
            availableCategories={state.availableCategories}
            onSearchChange={actions.setSearchQuery}
            onCategoryToggle={actions.toggleCategoryFilter}
            onDateRangeChange={actions.setDateRange}
            onClearAllFilters={actions.clearAllFilters}
            onSavePreset={handleSavePreset}
            onLoadPreset={handleLoadPreset}
            variant="sheet"
            className="h-full"
            onClose={() => setIsFiltersOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <ConflictResolutionDialog
        open={Boolean(conflictDialog)}
        items={conflictDialog?.items ?? []}
        onClose={() => setConflictDialog(null)}
        onResolve={(decisions) => void handleResolveConflicts(decisions)}
      />

      <VideoPlayerModal
        video={state.currentVideo}
        isOpen={isVideoPlayerOpen}
        onClose={() => {
          setIsVideoPlayerOpen(false);
          actions.setCurrentVideo(null);
        }}
        availableCategories={state.availableCategories}
        onUpdateVideo={actions.updateVideoCategories}
        onRemoveCategory={actions.removeVideoCategory}
        onSplitVideo={handleSubmitSplit}
        onFocusMode={handleFocusMode}
        onRescan={() =>
          void (async () => {
            const res = await actions.rescanLastRoot();
            const removed = res.removed ?? 0;
            toast({
              title: res.success ? 'Rescan complete' : 'Rescan failed',
              description: res.success
                ? `Reattached ${res.reattached}. Removed ${removed} missing.`
                : res.message || 'Failed',
            });
            if (
              res.success &&
              res.missingIds &&
              state.currentVideo &&
              res.missingIds.includes(state.currentVideo.id)
            ) {
              setIsVideoPlayerOpen(false);
              actions.setCurrentVideo(null);
            }
          })()
        }
        onPrev={goPrev}
        onNext={goNext}
        shuffleEnabled={shuffle}
        onToggleShuffle={toggleShuffle}
      />

      <Suspense fallback={null}>
        <EditTagsModal
          video={editingVideo}
          isOpen={isEditTagsOpen}
          onClose={() => {
            setIsEditTagsOpen(false);
            setEditingVideo(null);
          }}
          onSave={actions.updateVideoCategories}
          onRemoveCategory={actions.removeVideoCategory}
          availableCategories={state.availableCategories}
        />
      </Suspense>

      <SplitVideoModal
        video={splitTarget}
        isOpen={isSplitOpen}
        availableCategories={state.availableCategories}
        onClose={() => {
          setIsSplitOpen(false);
          setSplitTarget(null);
        }}
        onSubmit={handleSubmitSplit}
      />

      <RenameModal
        video={renameTarget}
        isOpen={isRenameOpen}
        onClose={() => {
          setIsRenameOpen(false);
          setRenameTarget(null);
        }}
        onSubmit={async (
          id,
          name,
          applyTo,
        ): Promise<{ success: boolean; message?: string; code?: string }> => {
          const res = await actions.renameVideo(id, name, applyTo);
          if (!res.success && res.code === 'conflict') {
            setConflictDialog({
              operation: 'rename',
              applyTo,
              items: [
                {
                  id,
                  currentName: renameTarget?.displayName ?? name,
                  desiredFileName: getFilenameWithOriginalExt(name, renameTarget?.filename ?? name),
                  location: renameTarget?.path,
                  operation: 'rename',
                },
              ],
              desiredBaseById: { [id]: name },
            });
            setIsRenameOpen(false);
            setRenameTarget(null);
            return { success: true };
          }
          if (!res.success) {
            toast({
              title: 'Rename failed',
              description: res.message || 'Unable to rename file.',
              variant: 'destructive',
            });
          }
          return res as { success: boolean; message?: string; code?: string };
        }}
      />

      <BatchRenameModal
        videos={state.videos}
        selectedIds={batchSelection}
        isOpen={isBatchRenameOpen}
        onClose={() => setIsBatchRenameOpen(false)}
        onSubmit={async (ids, opts): Promise<number> => {
          const res = (await actions.batchRename(ids, opts)) as BatchResult | number;
          if (typeof res === 'number') return res;

          const conflictResults = res.results?.filter((r) => r && r.code === 'conflict') ?? [];

          if (conflictResults.length > 0) {
            const desiredBaseMap: Record<string, string> = {};
            const items: ConflictItem[] = [];
            ids.forEach((id, index) => {
              const video = state.videos.find((v) => v.id === id);
              if (!video) return;
              const baseName = buildBatchName(video, index, opts);
              desiredBaseMap[id] = baseName;
              if (conflictResults.some((r) => r.id === id)) {
                const desiredFileName =
                  opts.applyTo === 'displayName'
                    ? video.filename
                    : getFilenameWithOriginalExt(baseName, video.filename);
                items.push({
                  id,
                  currentName: video.displayName,
                  desiredFileName,
                  location: video.path,
                  operation: 'rename',
                });
              }
            });
            if (items.length) {
              setConflictDialog({
                operation: 'batch-rename',
                applyTo: opts.applyTo ?? 'both',
                items,
                desiredBaseById: desiredBaseMap,
              });
            }
          }
          const { success, failed } = res || { success: 0, failed: 0 };
          if (failed > 0) {
            toast({
              title: 'Batch Rename',
              description: `Renamed ${success}, ${failed} failed (rolled back).`,
              variant: 'destructive',
            });
          }
          if (!failed && success === 0) {
            toast({
              title: 'Batch Rename',
              description: 'No files were renamed.',
              variant: 'destructive',
            });
          }
          return success;
        }}
      />

      <Suspense fallback={null}>
        <PresetManagerModal
          isOpen={isPresetManagerOpen}
          onClose={() => setIsPresetManagerOpen(false)}
          onLoadPreset={(preset) => {
            actions.loadFilterPreset(preset.name);
            toast({
              title: 'Preset Loaded',
              description: `Filter preset "${preset.name}" applied.`,
            });
          }}
        />
      </Suspense>


      <DirectoryPickerModal
        isOpen={isDirPickerOpen}
        onClose={() => {
          setIsDirPickerOpen(false);
          setMoveTarget(null);
        }}
        onSelect={(dir) =>
          void (async () => {
            if (moveTarget) {
              let notifyFailure = true;
              let res = await actions.moveFileToDirectory(moveTarget.id, dir);
              if (!res.success && res.code === 'conflict') {
                setConflictDialog({
                  operation: 'move',
                  targetDir: dir,
                  items: [
                    {
                      id: moveTarget.id,
                      currentName: moveTarget.displayName,
                      desiredFileName: moveTarget.filename,
                      location: dir,
                      operation: 'move',
                    },
                  ],
                });
                notifyFailure = false;
              }
              if (!res.success && notifyFailure) {
                toast({
                  title: 'Move failed',
                  description: res.message || 'Unable to move file.',
                  variant: 'destructive',
                });
              }
            } else if (batchSelection.length > 0) {
              const res = (await actions.batchMove(batchSelection, dir)) as BatchResult;
              const conflictIds =
                res.results?.filter((r) => r && r.code === 'conflict').map((r) => r.id) ?? [];
              if (conflictIds.length > 0) {
                const items = conflictIds
                  .map((id: string) => {
                    const video = state.videos.find((v) => v.id === id);
                    if (!video) return null;
                    return {
                      id,
                      currentName: video.displayName,
                      desiredFileName: video.filename,
                      location: dir,
                      operation: 'move' as const,
                    };
                  })
                  .filter(Boolean) as ConflictItem[];
                if (items.length) {
                  setConflictDialog({
                    operation: 'batch-move',
                    targetDir: dir,
                    items,
                  });
                }
              }
              if (res.failed > 0) {
                toast({
                  title: 'Batch Move',
                  description: `Moved ${res.success}, ${res.failed} failed (rolled back).`,
                  variant: 'destructive',
                });
              }
            }
            setIsDirPickerOpen(false);
            setMoveTarget(null);
            setBatchSelection([]);
          })()
        }
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
}
