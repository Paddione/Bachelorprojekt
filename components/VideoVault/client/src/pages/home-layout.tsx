import { Sidebar } from '@/components/layout/sidebar';
import { MainContent } from '@/components/layout/main-content';
import { SplitPaneEditor } from '@/components/video/split-pane-editor';
import { ApplyToVisible } from '@/components/bulk/apply-to-visible';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Video, AdvancedFilters, Category, SortField, SortDirection } from '@/types/video';

export interface WorkspaceCallbacks {
  onVideoPlay: (v: Video) => void;
  onVideoEditTags: (v: Video) => void;
  onVideoRename: (v: Video) => void;
  onVideoSplit: (v: Video) => void;
  onFocusMode: (v: Video) => void;
  onCategorize: (v: Video) => void;
  onPin: (id: string) => void;
  onSelectDirectory: () => void;
  onFileDrop: (f: FileList) => void;
  onDeleteFile: (v: Video) => void;
  onChangeSort: (field: SortField, dir: SortDirection) => void;
  onRequestMove: (v: Video) => void;
  onRemoveCategory: (id: string, type: string, value: string) => void;
  onUpdateCategories: (id: string, cats: Partial<{ categories: any; customCategories: any }>) => void;
  onOpenBatchRename: (ids: string[]) => void;
  onBulkMoveRequest: (ids: string[]) => void;
  onBulkDeleteRequest: (ids: string[]) => void;
  onAdvancedFiltersChange: (f: AdvancedFilters) => void;
  onToggleFiltersPanel: () => void;
}

export interface WorkspaceState {
  videos: Video[];
  filteredVideos: Video[];
  selectedCategories: string[];
  isScanning: boolean;
  searchQuery: string;
  dateRange: { startDate: string; endDate: string };
  availableCategories: Category[];
  sort: { field: SortField; direction: SortDirection };
  advancedFilters: AdvancedFilters;
  filtersActiveCount: number;
  isFiltersOpen: boolean;
  pinnedVideoId: string | null;
}

export function VisibleToolbar({ count, available, onApply }: {
  count: number; available: Category[]; onApply: (type: string, value: string, mode: string) => void;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-1 border-b bg-card/50">
      <ApplyToVisible filteredCount={count} onApply={onApply} availableCategories={available} />
    </div>
  );
}

export function HomeWorkspace({ ws, cb, sidebarProps, onUnpin, onPinVideo }: {
  ws: WorkspaceState;
  cb: WorkspaceCallbacks;
  sidebarProps: {
    onSearchChange: (q: string) => void; onCategoryToggle: (c: string) => void;
    onDateRangeChange: (r: { startDate: string; endDate: string }) => void;
    onClearAllFilters: () => void; onSavePreset: () => void; onLoadPreset: () => void;
  };
  onUnpin: () => void;
  onPinVideo: (id: string) => void;
}) {
  return (
    <div className="flex flex-1 min-h-0">
      <Sidebar searchQuery={ws.searchQuery} selectedCategories={ws.selectedCategories}
        dateRange={ws.dateRange} availableCategories={ws.availableCategories}
        onSearchChange={sidebarProps.onSearchChange} onCategoryToggle={sidebarProps.onCategoryToggle}
        onDateRangeChange={sidebarProps.onDateRangeChange} onClearAllFilters={sidebarProps.onClearAllFilters}
        onSavePreset={sidebarProps.onSavePreset} onLoadPreset={sidebarProps.onLoadPreset}
        className="hidden lg:flex w-[22rem] flex-shrink-0" variant="sidebar" />
      <MainContent videos={ws.videos} filteredVideos={ws.filteredVideos}
        selectedCategories={ws.selectedCategories} isScanning={ws.isScanning}
        onVideoPlay={cb.onVideoPlay} onVideoEditTags={cb.onVideoEditTags}
        onVideoRename={cb.onVideoRename} onVideoSplit={cb.onVideoSplit}
        onFocusMode={cb.onFocusMode} onCategorize={cb.onCategorize}
        onPin={(v) => cb.onPin(v.id)} onSelectDirectory={cb.onSelectDirectory}
        onFileDrop={cb.onFileDrop} onDeleteFile={cb.onDeleteFile}
        sort={ws.sort} onChangeSort={(s) => cb.onChangeSort(s.field, s.direction)}
        onRequestMove={cb.onRequestMove} onRemoveCategory={cb.onRemoveCategory}
        onUpdateCategories={cb.onUpdateCategories} onOpenBatchRename={cb.onOpenBatchRename}
        onBulkMoveRequest={cb.onBulkMoveRequest} onBulkDeleteRequest={cb.onBulkDeleteRequest}
        onAdvancedFiltersChange={cb.onAdvancedFiltersChange} advancedFilters={ws.advancedFilters}
        onToggleFiltersPanel={cb.onToggleFiltersPanel} filtersActiveCount={ws.filtersActiveCount}
        searchQuery={ws.searchQuery} isFiltersOpen={ws.isFiltersOpen} />
      {ws.pinnedVideoId && (
        <SplitPaneEditor videos={ws.videos} filteredVideos={ws.filteredVideos}
          pinnedVideoId={ws.pinnedVideoId} availableCategories={ws.availableCategories}
          onUpdateCategories={cb.onUpdateCategories} onRemoveCategory={cb.onRemoveCategory}
          onClose={onUnpin} onPinVideo={onPinVideo} />
      )}
    </div>
  );
}

export function FilterSheet({ open, onOpenChange, sidebar }: {
  open: boolean; onOpenChange: (o: boolean) => void; sidebar: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:w-[420px] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Adjust filters and presets</SheetDescription>
        </SheetHeader>
        {sidebar}
      </SheetContent>
    </Sheet>
  );
}
