import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { VideoCard } from '@/components/video/video-card';
import { Video } from '@/types/video';
import {
  Grid3X3,
  List,
  SortDesc,
  CloudUpload,
  FolderOpen,
  ChevronDown,
  SlidersHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { SortDirection, SortField, AdvancedFilters } from '@/types/video';
import { FixedSizeList as VirtualList } from 'react-window';
import { AdvancedFiltersPanel } from '@/components/filters/advanced-filters';
import { BulkOperationsToolbar } from '@/components/bulk/bulk-operations-toolbar';
import { BulkOperationsService } from '@/services/bulk-operations';
import { OptimizedVirtualGrid } from '@/components/virtualization/optimized-virtual-grid';
import { usePerformanceMonitor } from '@/hooks/use-performance-monitor';

interface MainContentProps {
  videos: Video[];
  filteredVideos: Video[];
  selectedCategories: string[];
  isScanning: boolean;
  onVideoPlay: (video: Video) => void;
  onVideoEditTags: (video: Video) => void;
  onVideoRename: (video: Video) => void;
  onVideoSplit?: (video: Video) => void;
  onFocusMode?: (video: Video) => void;
  onCategorize?: (video: Video) => void;
  onPin?: (video: Video) => void;
  onSelectDirectory: () => void;
  onFileDrop: (files: FileList) => void;
  onDeleteFile?: (video: Video) => void;
  sort?: { field: SortField; direction: SortDirection };
  onChangeSort?: (sort: { field: SortField; direction: SortDirection }) => void;
  onRequestMove?: (video: Video) => void;
  onRemoveCategory?: (videoId: string, categoryType: string, categoryValue: string) => void;
  onUpdateCategories?: (videoId: string, categories: Partial<{ categories: any; customCategories: any }>) => void;
  onAdvancedFiltersChange?: (filters: AdvancedFilters) => void;
  advancedFilters?: AdvancedFilters;
  // Bulk ops callbacks wired by parent
  onOpenBatchRename?: (ids: string[]) => void;
  onBulkMoveRequest?: (ids: string[]) => void;
  onBulkDeleteRequest?: (ids: string[]) => void;
  onToggleFiltersPanel?: () => void;
  filtersActiveCount?: number;
  searchQuery?: string;
  isFiltersOpen?: boolean;
}

export function MainContent({
  videos,
  filteredVideos,
  selectedCategories,
  isScanning,
  onVideoPlay,
  onVideoEditTags,
  onVideoRename,
  onVideoSplit,
  onFocusMode,
  onCategorize,
  onPin,
  onSelectDirectory,
  onFileDrop,
  onDeleteFile,
  sort,
  onChangeSort,
  onRequestMove,
  onRemoveCategory,
  onUpdateCategories,
  onAdvancedFiltersChange,
  advancedFilters,
  onOpenBatchRename,
  onBulkMoveRequest,
  onBulkDeleteRequest,
  onToggleFiltersPanel,
  filtersActiveCount,
  searchQuery,
  isFiltersOpen,
}: MainContentProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const videosPerPage = 50;

  // Keyboard navigation state
  const [focusedVideoIndex, setFocusedVideoIndex] = useState<number>(-1);

  // Bulk operations state
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [showSelection, setShowSelection] = useState(false);
  const bulkService = BulkOperationsService.getInstance();

  // Performance monitoring
  const performanceMonitor = usePerformanceMonitor('MainContent', {
    renderTime: 16,
    frameRate: 30,
    memoryUsage: 150,
  });

  // Measure the non-scrolling container to avoid width oscillation from scrollbars
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Initialize advanced filters if not provided
  const [localAdvancedFilters, setLocalAdvancedFilters] = useState<AdvancedFilters>(
    advancedFilters || {
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    },
  );

  // Update local filters when prop changes
  useEffect(() => {
    if (advancedFilters) {
      setLocalAdvancedFilters(advancedFilters);
    }
  }, [advancedFilters]);

  // Listen to bulk service selection changes
  useEffect(() => {
    const unsubscribe = bulkService.addSelectionListener((selected) => {
      setSelectedVideoIds(selected);
      setShowSelection(selected.size > 0);
    });

    return unsubscribe;
  }, [bulkService]);

  // Performance monitoring: update component count
  useEffect(() => {
    performanceMonitor.updateComponentCount(filteredVideos.length);
  }, [filteredVideos.length, performanceMonitor.updateComponentCount]);

  // Performance monitoring: start render measurement
  useEffect(() => {
    performanceMonitor.startRenderMeasure();
    return () => performanceMonitor.endRenderMeasure();
  }, [performanceMonitor.startRenderMeasure, performanceMonitor.endRenderMeasure]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.max(0, rect.width);
      const height = Math.max(0, rect.height);
      setContainerSize({ width, height });
    };

    updateSize();

    let ro: ResizeObserver | null = null;
    const hasRO = typeof window !== 'undefined' && 'ResizeObserver' in window;
    if (hasRO) {
      ro = new ResizeObserver(() => updateSize());
      ro.observe(el);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateSize);
    }
    return () => {
      if (ro) ro.disconnect();
      else if (typeof window !== 'undefined') window.removeEventListener('resize', updateSize);
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileDrop(e.dataTransfer.files);
    }
  };

  const handleAdvancedFiltersChange = (filters: AdvancedFilters) => {
    setLocalAdvancedFilters(filters);
    if (onAdvancedFiltersChange) {
      onAdvancedFiltersChange(filters);
    }
  };

  const handleClearAdvancedFilters = () => {
    const clearedFilters: AdvancedFilters = {
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    };
    setLocalAdvancedFilters(clearedFilters);
    if (onAdvancedFiltersChange) {
      onAdvancedFiltersChange(clearedFilters);
    }
  };

  const handleVideoSelectionChange = (videoId: string, selected: boolean) => {
    if (selected) {
      bulkService.selectVideo(videoId);
    } else {
      bulkService.deselectVideo(videoId);
    }
  };

  const handleClearSelection = () => {
    bulkService.deselectAll();
  };

  const handleBulkAddCategory = (videos: Video[]) => {
    // This would open a modal for bulk category assignment
    console.log('Bulk add category to:', videos.length, 'videos');
  };

  const handleBulkRemoveCategory = (videos: Video[]) => {
    // This would open a modal for bulk category removal
    console.log('Bulk remove category from:', videos.length, 'videos');
  };

  const handleBulkRename = (videos: Video[]) => {
    const ids = videos.map((v) => v.id);
    onOpenBatchRename?.(ids);
  };

  const handleBulkMove = (videos: Video[]) => {
    const ids = videos.map((v) => v.id);
    onBulkMoveRequest?.(ids);
  };

  const handleBulkDelete = (videos: Video[]) => {
    const ids = videos.map((v) => v.id);
    onBulkDeleteRequest?.(ids);
    // Clear selection after triggering
    bulkService.deselectAll();
  };

  const totalPages = Math.ceil(filteredVideos.length / videosPerPage);
  const startIndex = (currentPage - 1) * videosPerPage;
  const endIndex = startIndex + videosPerPage;
  const currentVideos = filteredVideos.slice(startIndex, endIndex);

  const loadMore = () => {
    setCurrentPage((prev) => prev + 1);
  };

  const showEmptyState = !isScanning && videos.length === 0;
  const showNoResults = !isScanning && videos.length > 0 && filteredVideos.length === 0;

  const handleSortFieldChange = (field: string) => {
    if (!onChangeSort) return;
    const nextField = field as SortField;
    const nextDir = sort?.direction ?? 'asc';
    onChangeSort({ field: nextField, direction: nextDir });
  };

  const handleSortDirectionChange = (direction: string) => {
    if (!onChangeSort) return;
    const nextDir = direction as SortDirection;
    const nextField = sort?.field ?? 'displayName';
    onChangeSort({ field: nextField, direction: nextDir });
  };

  // Virtualization configuration
  const virtualThreshold = 60; // enable virtualization for larger lists
  const useVirtualization = filteredVideos.length >= virtualThreshold;

  // Measure effective space inside padding
  const rawWidth = containerSize.width || (typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isCompactWidth = rawWidth < 640;
  const padding = (isCompactWidth ? 16 : 24) * 2;
  const effectiveWidth = Math.max(320, rawWidth - padding);
  const effectiveHeight = Math.max(200, (containerSize.height || 600) - padding);

  // Grid layout calculations
  const gridGap = isCompactWidth ? 16 : 24; // gap-4 on mobile, gap-6 otherwise
  const listGap = isCompactWidth ? 12 : 16; // space-y-3/4 approximation
  const columns = (() => {
    if (effectiveWidth >= 1280) return 4;
    if (effectiveWidth >= 1024) return 3;
    if (effectiveWidth >= 640) return 2;
    return 1;
  })();
  const columnWidth = Math.max(
    200,
    Math.floor((effectiveWidth - gridGap * (columns - 1)) / columns),
  );
  const cardHeight = Math.round((columnWidth * 9) / 16) + (isCompactWidth ? 120 : 140); // thumbnail + content

  // Keyboard navigation handlers
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (filteredVideos.length === 0) return;

      let newIndex = focusedVideoIndex;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (viewMode === 'grid') {
            // Move down in grid (next row)
            newIndex = Math.min(focusedVideoIndex + columns, filteredVideos.length - 1);
          } else {
            // Move down in list
            newIndex = Math.min(focusedVideoIndex + 1, filteredVideos.length - 1);
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (viewMode === 'grid') {
            // Move up in grid (previous row)
            newIndex = Math.max(focusedVideoIndex - columns, 0);
          } else {
            // Move up in list
            newIndex = Math.max(focusedVideoIndex - 1, 0);
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          if (viewMode === 'grid') {
            // Move left in grid
            if (focusedVideoIndex % columns > 0) {
              newIndex = focusedVideoIndex - 1;
            }
          }
          break;

        case 'ArrowRight':
          e.preventDefault();
          if (viewMode === 'grid') {
            // Move right in grid
            if (
              focusedVideoIndex % columns < columns - 1 &&
              focusedVideoIndex + 1 < filteredVideos.length
            ) {
              newIndex = focusedVideoIndex + 1;
            }
          }
          break;

        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedVideoIndex >= 0 && focusedVideoIndex < filteredVideos.length) {
            onVideoPlay(filteredVideos[focusedVideoIndex]);
          }
          return;

        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;

        case 'End':
          e.preventDefault();
          newIndex = filteredVideos.length - 1;
          break;

        case 'Escape':
          e.preventDefault();
          setFocusedVideoIndex(-1);
          // Also clear selection
          handleClearSelection();
          return;
      }

      if (newIndex !== focusedVideoIndex && newIndex >= 0 && newIndex < filteredVideos.length) {
        setFocusedVideoIndex(newIndex);

        // Focus the video card
        setTimeout(() => {
          const videoElement = document.querySelector(
            `[data-video-index="${newIndex}"]`,
          ) as HTMLElement & { focusCard?: () => void };
          if (videoElement && videoElement.focusCard) {
            videoElement.focusCard();
          }
        }, 0);

        // Scroll to focused video
        const videoElement = document.querySelector(
          `[data-video-index="${newIndex}"]`,
        ) as HTMLElement;
        if (videoElement) {
          videoElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    },
    [focusedVideoIndex, filteredVideos.length, viewMode, columns, onVideoPlay],
  );

  // Set up keyboard event listeners
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle navigation keys when not typing in input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      ) {
        return;
      }

      handleKeyDown(e);
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleKeyDown]);

  // Reset focus when videos change
  useEffect(() => {
    setFocusedVideoIndex(-1);
  }, [filteredVideos]);

  // Add click handler to set focus when clicking on a video card
  const handleVideoCardClick = (index: number) => {
    setFocusedVideoIndex(index);
  };

  // Get selected videos for bulk operations
  const selectedVideos = filteredVideos.filter((video) => selectedVideoIds.has(video.id));
  const activeFilterCount =
    filtersActiveCount ??
    (selectedCategories?.length || 0) +
      (searchQuery && searchQuery.trim() ? 1 : 0) +
      (localAdvancedFilters.dateRange.startDate || localAdvancedFilters.dateRange.endDate ? 1 : 0) +
      (localAdvancedFilters.fileSizeRange.min > 0 || localAdvancedFilters.fileSizeRange.max > 0
        ? 1
        : 0) +
      (localAdvancedFilters.durationRange.min > 0 || localAdvancedFilters.durationRange.max > 0
        ? 1
        : 0);

  return (
    <main
      className="flex-1 bg-background overflow-hidden flex flex-col"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      role="main"
    >
      {/* Content Header */}
      <div className="bg-card border-b border-border px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="text-primary" data-testid="text-filtered-count">
                {filteredVideos.length}
              </span>
              <span className="text-muted-foreground">videos</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {activeFilterCount} filters
                </Badge>
              )}
            </h3>

            {/* Performance indicator */}
            {process.env.NODE_ENV === 'development' && (
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <span>FPS: {performanceMonitor.metrics.frameRate}</span>
                <span>Memory: {performanceMonitor.metrics.memoryUsage || 0}MB</span>
              </div>
            )}

            <AdvancedFiltersPanel
              filters={localAdvancedFilters}
              onFiltersChange={handleAdvancedFiltersChange}
              onClearFilters={handleClearAdvancedFilters}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onToggleFiltersPanel && (
              <Button
                variant={isFiltersOpen ? 'default' : 'outline'}
                size="sm"
                onClick={onToggleFiltersPanel}
                className="min-h-[38px] lg:hidden"
                aria-pressed={!!isFiltersOpen}
                data-testid="button-open-filters-inline"
              >
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="outline" className="ml-2">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            )}
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
              data-testid="button-view-grid"
              className="min-h-[38px]"
              aria-pressed={viewMode === 'grid'}
              aria-label="Show grid view"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
              data-testid="button-view-list"
              className="min-h-[38px]"
              aria-pressed={viewMode === 'list'}
              aria-label="Show list view"
            >
              <List className="h-4 w-4" />
            </Button>
            <div className="h-6 w-px bg-border" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="button-sort"
                    className="min-h-[38px]"
                    aria-label="Open sort options"
                  >
                    <SortDesc className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={sort?.field ?? 'displayName'}
                  onValueChange={handleSortFieldChange}
                >
                  <DropdownMenuRadioItem value="displayName">Display name</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="lastModified">Last modified</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="size">Size</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="path">Path</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="categoryCount">
                    Category count
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="unassignedCount">
                    Unassigned types
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Direction</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={sort?.direction ?? 'asc'}
                  onValueChange={handleSortDirectionChange}
                >
                  <DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Video Grid/List Container */}
      <div className="flex-1 overflow-y-auto" ref={containerRef}>
        <div className="p-4 sm:p-6">
          {showEmptyState && (
            <div className="border-2 border-dashed border-border rounded-xl p-12 text-center bg-muted/20">
              <div className="flex flex-col items-center space-y-6">
                <CloudUpload className="h-20 w-20 text-muted-foreground" />
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Drop Video Files Here
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Supported: MP4, AVI, MKV, MOV, WMV
                  </p>
                </div>
                <Button
                  onClick={onSelectDirectory}
                  data-testid="button-select-directory"
                  size="lg"
                  className="bg-primary hover:bg-primary/90"
                >
                  <FolderOpen className="mr-2 h-5 w-5" />
                  Select Directory
                </Button>
              </div>
            </div>
          )}

          {showNoResults && (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                <Grid3X3 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <h3 className="font-medium text-foreground mb-2">No videos match your filters</h3>
                <p className="text-sm">
                  Try adjusting your search criteria or clearing some filters
                </p>
              </div>
            </div>
          )}

          {/* Optimized virtualized rendering for large lists */}
          {filteredVideos.length > 0 && useVirtualization && viewMode === 'grid' && (
            <OptimizedVirtualGrid
              videos={filteredVideos}
              columns={columns}
              columnWidth={columnWidth}
              cardHeight={cardHeight}
              gridGap={gridGap}
              containerWidth={effectiveWidth}
              containerHeight={Math.max(240, effectiveHeight)}
              onVideoPlay={onVideoPlay}
              onVideoEditTags={onVideoEditTags}
              onVideoRename={onVideoRename}
              onVideoSplit={onVideoSplit}
              onFocusMode={onFocusMode}
              onCategorize={onCategorize}
              onPin={onPin}
              onMove={onRequestMove}
              onDelete={onDeleteFile}
              onRemoveCategory={onRemoveCategory}
              onUpdateCategories={onUpdateCategories}
              isSelected={(videoId) => selectedVideoIds.has(videoId)}
              onSelectionChange={handleVideoSelectionChange}
              showSelection={showSelection}
              onVideoCardClick={handleVideoCardClick}
            />
          )}

          {/* Fallback to original virtualization for list view */}
          {filteredVideos.length > 0 && useVirtualization && viewMode === 'list' && (
            <VirtualList
              height={Math.max(200, effectiveHeight)}
              itemCount={filteredVideos.length}
              itemSize={cardHeight + listGap}
              width={Math.max(200, effectiveWidth)}
              itemKey={(index: number) => filteredVideos[index]?.id ?? `row-${index}`}
            >
              {({ index, style }: { index: number; style: React.CSSProperties }) => {
                const video = filteredVideos[index];
                return (
                  <div style={style}>
                    <div style={{ marginBottom: listGap }}>
                      <VideoCard
                        key={video.id}
                        video={video}
                        onPlay={onVideoPlay}
                        onEditTags={onVideoEditTags}
                        onRename={onVideoRename}
                        onSplit={onVideoSplit}
                        onFocusMode={onFocusMode}
                        onCategorize={onCategorize}
                        onPin={onPin}
                        onMove={onRequestMove ? (v) => onRequestMove(v) : undefined}
                        onDelete={
                          onDeleteFile
                            ? (v) => {
                                if (
                                  confirm(
                                    'Delete this file from disk? You will have a short window to undo.',
                                  )
                                )
                                  onDeleteFile(v);
                              }
                            : undefined
                        }
                        onRemoveCategory={onRemoveCategory}
                        onUpdateCategories={onUpdateCategories}
                        isSelected={selectedVideoIds.has(video.id)}
                        onSelectionChange={handleVideoSelectionChange}
                        showSelection={showSelection}
                        data-video-index={index}
                        onClick={() => handleVideoCardClick(index)}
                      />
                    </div>
                  </div>
                );
              }}
            </VirtualList>
          )}

          {/* Fallback non-virtualized rendering for smaller lists or when disabled */}
          {filteredVideos.length > 0 && !useVirtualization && (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6'
                  : 'space-y-3 sm:space-y-4'
              }
            >
              {currentVideos.map((video, index) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onPlay={onVideoPlay}
                  onEditTags={onVideoEditTags}
                  onRename={onVideoRename}
                  onSplit={onVideoSplit}
                  onFocusMode={onFocusMode}
                  onCategorize={onCategorize}
                  onMove={onRequestMove ? (v) => onRequestMove(v) : undefined}
                  onDelete={
                    onDeleteFile
                      ? (v) => {
                          if (
                            confirm(
                              'Delete this file from disk? You will have a short window to undo.',
                            )
                          )
                            onDeleteFile(v);
                        }
                      : undefined
                  }
                  onRemoveCategory={onRemoveCategory}
                  onUpdateCategories={onUpdateCategories}
                  isSelected={selectedVideoIds.has(video.id)}
                  onSelectionChange={handleVideoSelectionChange}
                  showSelection={showSelection}
                  data-video-index={index}
                  onClick={() => handleVideoCardClick(index)}
                />
              ))}
            </div>
          )}

          {/* Load More - shown only in fallback/manual mode */}
          {filteredVideos.length > 0 && !useVirtualization && currentPage < totalPages && (
            <div className="mt-8 flex justify-center">
              <Button variant="outline" onClick={loadMore} data-testid="button-load-more">
                <ChevronDown className="mr-2 h-4 w-4" />
                Load More Videos ({Math.min(
                  videosPerPage,
                  filteredVideos.length - endIndex,
                )} of {filteredVideos.length - endIndex} remaining)
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Operations Toolbar */}
      <BulkOperationsToolbar
        selectedVideos={selectedVideos}
        onClearSelection={handleClearSelection}
        onBulkAddCategory={handleBulkAddCategory}
        onBulkRemoveCategory={handleBulkRemoveCategory}
        onBulkRename={handleBulkRename}
        onBulkMove={handleBulkMove}
        onBulkDelete={handleBulkDelete}
      />
    </main>
  );
}
