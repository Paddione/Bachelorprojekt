import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Grid as VirtualGrid, useGridRef, type CellComponentProps } from 'react-window';
import { Video } from '@/types/video';
import { VideoCard } from '@/components/video/video-card';

interface OptimizedVirtualGridProps {
  videos: Video[];
  columns: number;
  columnWidth: number;
  cardHeight: number;
  gridGap: number;
  containerWidth: number;
  containerHeight: number;
  onVideoPlay: (video: Video) => void;
  onVideoEditTags: (video: Video) => void;
  onVideoRename: (video: Video) => void;
  onVideoSplit?: (video: Video) => void;
  onFocusMode?: (video: Video) => void;
  onCategorize?: (video: Video) => void;
  onPin?: (video: Video) => void;
  onMove?: (video: Video) => void;
  onDelete?: (video: Video) => void;
  onRemoveCategory?: (videoId: string, categoryType: string, categoryValue: string) => void;
  onUpdateCategories?: (videoId: string, categories: Partial<{ categories: any; customCategories: any }>) => void;
  isSelected?: (videoId: string) => boolean;
  onSelectionChange?: (videoId: string, selected: boolean) => void;
  showSelection?: boolean;
  onVideoCardClick?: (index: number) => void;
}

// Memoized video card component for better performance
const MemoizedVideoCard = React.memo(VideoCard, (prevProps, nextProps) => {
  // Only re-render if these props change
  return (
    prevProps.video.id === nextProps.video.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.showSelection === nextProps.showSelection &&
    prevProps.isVisible === nextProps.isVisible &&
    JSON.stringify(prevProps.video.categories) === JSON.stringify(nextProps.video.categories)
  );
});

type GridCellData = {
  videos: Video[];
  columns: number;
  columnWidth: number;
  cardHeight: number;
  gridGap: number;
  onVideoPlay: (video: Video) => void;
  onVideoEditTags: (video: Video) => void;
  onVideoRename: (video: Video) => void;
  onVideoSplit?: (video: Video) => void;
  onFocusMode?: (video: Video) => void;
  onCategorize?: (video: Video) => void;
  onPin?: (video: Video) => void;
  onMove?: (video: Video) => void;
  onDelete?: (video: Video) => void;
  onRemoveCategory?: (videoId: string, categoryType: string, categoryValue: string) => void;
  onUpdateCategories?: (videoId: string, categories: Partial<{ categories: any; customCategories: any }>) => void;
  isSelected?: (videoId: string) => boolean;
  onSelectionChange?: (videoId: string, selected: boolean) => void;
  showSelection?: boolean;
  onVideoCardClick?: (index: number) => void;
  visibleRange: { start: number; end: number };
};

export function OptimizedVirtualGrid({
  videos,
  columns,
  columnWidth,
  cardHeight,
  gridGap,
  containerWidth,
  containerHeight,
  onVideoPlay,
  onVideoEditTags,
  onVideoRename,
  onVideoSplit,
  onFocusMode,
  onCategorize,
  onPin,
  onMove,
  onDelete,
  onRemoveCategory,
  onUpdateCategories,
  isSelected,
  onSelectionChange,
  showSelection,
  onVideoCardClick,
}: OptimizedVirtualGridProps) {
  const gridRef = useGridRef(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const scrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Calculate grid dimensions
  const rowCount = Math.ceil(videos.length / columns);
  const effectiveWidth = Math.max(200, containerWidth);
  const effectiveHeight = Math.max(200, containerHeight);

  // Stable per-cell keys from video ids (data arrives via key-callback args)
  const getRowKey = useCallback(
    ({ rowIndex, data }: { rowIndex: number; data: GridCellData }) => {
      const idx = rowIndex * data.columns;
      return data.videos[idx]?.id ?? `row-${rowIndex}`;
    },
    [],
  );
  const getColumnKey = useCallback(
    ({
      columnIndex,
      rowIndex,
      data,
    }: {
      columnIndex: number;
      rowIndex: number;
      data: GridCellData;
    }) => {
      const idx = rowIndex * data.columns + columnIndex;
      return data.videos[idx]?.id ?? `cell-${rowIndex}-${columnIndex}`;
    },
    [],
  );

  // Track visible range for viewport-aware resource management
  const updateVisibleRange = useCallback(
    (scrollTop: number) => {
      const rowHeight = cardHeight + gridGap;
      const startRow = Math.floor(scrollTop / rowHeight);
      const endRow = Math.ceil((scrollTop + effectiveHeight) / rowHeight);

      const start = startRow * columns;
      const end = Math.min(videos.length, (endRow + 1) * columns); // +1 for buffer

      setVisibleRange({ start, end });
    },
    [cardHeight, gridGap, effectiveHeight, columns, videos.length],
  );

  // Shared data to avoid recreating callbacks
  const itemData = useMemo(
    () => ({
      videos,
      columns,
      columnWidth,
      cardHeight,
      gridGap,
      onVideoPlay,
      onVideoEditTags,
      onVideoRename,
      onVideoSplit,
      onFocusMode,
      onCategorize,
      onPin,
      onMove,
      onDelete,
      onRemoveCategory,
      onUpdateCategories,
      isSelected,
      onSelectionChange,
      showSelection,
      onVideoCardClick,
      visibleRange,
    }),
    [
      videos,
      columns,
      columnWidth,
      cardHeight,
      gridGap,
      onVideoPlay,
      onVideoEditTags,
      onVideoRename,
      onVideoSplit,
      onFocusMode,
      onCategorize,
      onPin,
      onMove,
      onDelete,
      onRemoveCategory,
      onUpdateCategories,
      isSelected,
      onSelectionChange,
      showSelection,
      onVideoCardClick,
      visibleRange,
    ],
  );

  // Memoized cell renderer for better performance
  const cellRenderer = useCallback(
    ({
      columnIndex,
      rowIndex,
      style,
      ...data
    }: CellComponentProps<GridCellData>) => {
      const idx = rowIndex * data.columns + columnIndex;
      const video = data.videos[idx];

      if (!video) {
        return <div style={style} />;
      }

      // Check if this cell is in or near the visible range
      const isVisible = idx >= data.visibleRange.start && idx <= data.visibleRange.end;

      return (
        <div style={style}>
          <div
            style={{
              width: data.columnWidth,
              height: data.cardHeight,
              marginRight: data.gridGap,
              marginBottom: data.gridGap,
            }}
          >
            <MemoizedVideoCard
              key={video.id}
              video={video}
              onPlay={data.onVideoPlay}
              onEditTags={data.onVideoEditTags}
              onRename={data.onVideoRename}
              onSplit={data.onVideoSplit}
              onFocusMode={data.onFocusMode}
              onCategorize={data.onCategorize}
              onPin={data.onPin}
              onMove={data.onMove}
              onDelete={data.onDelete}
              onRemoveCategory={data.onRemoveCategory}
              onUpdateCategories={data.onUpdateCategories}
              isSelected={data.isSelected ? data.isSelected(video.id) : false}
              onSelectionChange={data.onSelectionChange}
              showSelection={data.showSelection}
              onClick={() => data.onVideoCardClick?.(idx)}
              isVisible={isVisible}
            />
          </div>
        </div>
      );
    },
    [],
  );

  // Handle scroll events with optimized debouncing
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const scrollTop = e.currentTarget.scrollTop;
      setScrollOffset(scrollTop);
      updateVisibleRange(scrollTop);

      if (!isScrolling) {
        setIsScrolling(true);
      }

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Reduced from 150ms to 100ms for better responsiveness
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 100);
    },
    [isScrolling, updateVisibleRange],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Initialize visible range
  useEffect(() => {
    updateVisibleRange(0);
  }, [updateVisibleRange]);

  // Scroll to specific video index
  const scrollToIndex = useCallback(
    (index: number) => {
      if (gridRef.current) {
        const rowIndex = Math.floor(index / columns);
        gridRef.current.scrollToRow({ index: rowIndex, align: 'start' });
      }
    },
    [columns],
  );

  // Expose scroll method for external use
  useEffect(() => {
    if (gridRef.current) {
      (gridRef.current as any).scrollToIndex = scrollToIndex;
    }
  }, [scrollToIndex]);

  // Memoize grid dimensions to prevent unnecessary re-renders
  const gridDimensions = useMemo(
    () => ({
      columnCount: columns,
      columnWidth: columnWidth + gridGap,
      rowCount,
      rowHeight: cardHeight + gridGap,
    }),
    [columns, columnWidth, gridGap, rowCount, cardHeight],
  );

  // Performance optimization: only re-render when essential props change
  const memoizedGrid = useMemo(
    () => (
      <VirtualGrid
        gridRef={gridRef}
        {...gridDimensions}
        rowKey={getRowKey}
        columnKey={getColumnKey}
        cellProps={itemData}
        cellComponent={cellRenderer}
        onScroll={handleScroll}
        overscanCount={3}
        style={{
          height: effectiveHeight,
          width: effectiveWidth,
          willChange: isScrolling ? 'transform' : 'auto',
        }}
      />
    ),
    [gridDimensions, getRowKey, getColumnKey, itemData, handleScroll, cellRenderer, isScrolling],
  );

  return (
    <div className="optimized-virtual-grid">
      {memoizedGrid}

      {/* Performance indicator (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-20 right-4 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-75">
          Videos: {videos.length} | Rows: {rowCount} | Scroll: {Math.round(scrollOffset)}px |
          Visible: {visibleRange.start}-{visibleRange.end}
        </div>
      )}
    </div>
  );
}
