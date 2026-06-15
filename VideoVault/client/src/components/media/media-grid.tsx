import { useMemo } from 'react';
import type { MediaItem, VideoWithType, Audiobook, Ebook, EbookFormat } from '@/types/media';
import { isVideo, isAudiobook, isEbook } from '@/types/media';
import { VideoCard } from '@/components/video/video-card';
import { AudiobookCard } from '@/components/audiobook/audiobook-card';
import { EbookCard } from '@/components/ebook/ebook-card';
import type { Video } from '@/types/video';

interface MediaGridProps {
  items: MediaItem[];
  // Video callbacks
  onPlayVideo?: (video: Video) => void;
  onEditVideoTags?: (video: Video) => void;
  onRenameVideo?: (video: Video) => void;
  onSplitVideo?: (video: Video) => void;
  onMoveVideo?: (video: Video) => void;
  onDeleteVideo?: (video: Video) => void;
  onRemoveVideoCategory?: (videoId: string, categoryType: string, categoryValue: string) => void;
  // Audiobook callbacks
  onPlayAudiobook?: (audiobook: Audiobook) => void;
  // Ebook callbacks
  onReadEbook?: (ebook: Ebook, format?: EbookFormat) => void;
  onDownloadEbook?: (ebook: Ebook, format: EbookFormat) => void;
  // Selection
  selectedIds?: Set<string>;
  onSelectionChange?: (id: string, selected: boolean) => void;
  showSelection?: boolean;
  // Card click
  onItemClick?: (item: MediaItem) => void;
}

export function MediaGrid({
  items,
  onPlayVideo,
  onEditVideoTags,
  onRenameVideo,
  onSplitVideo,
  onMoveVideo,
  onDeleteVideo,
  onRemoveVideoCategory,
  onPlayAudiobook,
  onReadEbook,
  onDownloadEbook,
  selectedIds,
  onSelectionChange,
  showSelection = false,
  onItemClick,
}: MediaGridProps) {
  // Convert VideoWithType to Video for VideoCard compatibility
  const videoToLegacy = (v: VideoWithType): Video => {
    const { type, ...rest } = v;
    return rest as Video;
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {items.map((item) => {
        if (isVideo(item)) {
          const video = videoToLegacy(item);
          return (
            <VideoCard
              key={item.id}
              video={video}
              onPlay={() => onPlayVideo?.(video)}
              onEditTags={() => onEditVideoTags?.(video)}
              onRename={() => onRenameVideo?.(video)}
              onSplit={onSplitVideo ? () => onSplitVideo(video) : undefined}
              onMove={onMoveVideo ? () => onMoveVideo(video) : undefined}
              onDelete={onDeleteVideo ? () => onDeleteVideo(video) : undefined}
              onRemoveCategory={onRemoveVideoCategory}
              onClick={() => onItemClick?.(item)}
              isSelected={selectedIds?.has(item.id)}
              onSelectionChange={onSelectionChange}
              showSelection={showSelection}
            />
          );
        }

        if (isAudiobook(item)) {
          return (
            <AudiobookCard
              key={item.id}
              audiobook={item}
              onPlay={() => onPlayAudiobook?.(item)}
              onClick={() => onItemClick?.(item)}
              isSelected={selectedIds?.has(item.id)}
              onSelectionChange={onSelectionChange}
              showSelection={showSelection}
            />
          );
        }

        if (isEbook(item)) {
          return (
            <EbookCard
              key={item.id}
              ebook={item}
              onRead={(ebook, format) => onReadEbook?.(ebook, format)}
              onDownload={(ebook, format) => onDownloadEbook?.(ebook, format)}
              onClick={() => onItemClick?.(item)}
              isSelected={selectedIds?.has(item.id)}
              onSelectionChange={onSelectionChange}
              showSelection={showSelection}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
