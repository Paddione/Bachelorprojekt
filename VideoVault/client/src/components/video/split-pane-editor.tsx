import { useMemo } from 'react';
import { Video, VideoCategories, CustomCategories, Category } from '@/types/video';
import { VideoTagsEditor } from './video-tags-editor';
import { CategoryExtractor } from '@/services/category-extractor';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { getThumbnailSrc } from '@/lib/video-urls';

interface SplitPaneEditorProps {
  videos: Video[];
  filteredVideos: Video[];
  pinnedVideoId: string;
  availableCategories: Category[];
  onUpdateCategories: (
    videoId: string,
    categories: Partial<{ categories: VideoCategories; customCategories: CustomCategories }>,
  ) => void;
  onRemoveCategory: (videoId: string, categoryType: string, categoryValue: string) => void;
  onClose: () => void;
  onPinVideo: (videoId: string) => void;
}

export function SplitPaneEditor({
  videos,
  filteredVideos,
  pinnedVideoId,
  availableCategories,
  onUpdateCategories,
  onRemoveCategory,
  onClose,
  onPinVideo,
}: SplitPaneEditorProps) {
  const video = useMemo(
    () => videos.find((v) => v.id === pinnedVideoId) ?? null,
    [videos, pinnedVideoId],
  );

  // Navigation within filtered videos
  const filteredIndex = useMemo(
    () => filteredVideos.findIndex((v) => v.id === pinnedVideoId),
    [filteredVideos, pinnedVideoId],
  );
  const canGoPrev = filteredIndex > 0;
  const canGoNext = filteredIndex >= 0 && filteredIndex < filteredVideos.length - 1;

  const goToPrev = () => {
    if (canGoPrev) onPinVideo(filteredVideos[filteredIndex - 1].id);
  };
  const goToNext = () => {
    if (canGoNext) onPinVideo(filteredVideos[filteredIndex + 1].id);
  };

  const suggestions = useMemo(
    () => (video ? CategoryExtractor.getSuggestions(video.filename, video.path) : undefined),
    [video?.filename, video?.path],
  );

  if (!video) return null;

  const thumbSrc = getThumbnailSrc(video);
  const duration = video.metadata?.duration
    ? `${Math.floor(video.metadata.duration / 60)}:${String(Math.floor(video.metadata.duration % 60)).padStart(2, '0')}`
    : null;
  const resolution =
    video.metadata?.width && video.metadata?.height
      ? `${video.metadata.width}x${video.metadata.height}`
      : null;

  return (
    <div className="w-[350px] flex-shrink-0 border-l bg-card flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{video.displayName}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 flex-shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Thumbnail + metadata */}
      <div className="px-3 pt-3 space-y-2">
        {thumbSrc && (
          <img
            src={thumbSrc}
            alt={video.displayName}
            className="w-full aspect-video object-cover rounded-md bg-muted"
          />
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {duration && <Badge variant="secondary" className="text-xs">{duration}</Badge>}
          {resolution && <Badge variant="secondary" className="text-xs">{resolution}</Badge>}
          <Badge variant="secondary" className="text-xs">
            {(video.size / (1024 * 1024)).toFixed(0)} MB
          </Badge>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={goToPrev}
            disabled={!canGoPrev}
            className="h-7 px-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            {filteredIndex >= 0 ? `${filteredIndex + 1} / ${filteredVideos.length}` : '—'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToNext}
            disabled={!canGoNext}
            className="h-7 px-2"
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Tag Editor (scrollable) */}
      <div className="flex-1 overflow-y-auto p-3">
        <VideoTagsEditor
          key={video.id}
          video={video}
          availableCategories={availableCategories}
          onSave={onUpdateCategories}
          onRemoveCategory={onRemoveCategory}
          suggestions={suggestions}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
