import { useEffect, useState, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Video } from '@/types/video';
import { getCategoryColorClasses } from '@/lib/category-colors';
import { Play, Clock, FileVideo, Tags, Edit, FolderPlus, Trash2, Scissors, Pin, LayoutGrid } from 'lucide-react';
import { CategoryPicker } from '@/components/video/category-picker';
import { ThumbnailGenerator } from '@/services/thumbnail-generator';
import { VideoThumbnailService } from '@/services/video-thumbnail';
import { BulkOperationsService } from '@/services/bulk-operations';
import { cn } from '@/lib/utils';
import { SpriteCache } from '@/services/sprite-cache';
import { getSpriteMeta, setSpriteMeta } from '@/services/sprite-indexeddb';
import { getVideoSrc, getThumbnailSrc, getSpriteSrc } from '@/lib/video-urls';

interface VideoCardProps {
  video: Video;
  onPlay: (video: Video) => void;
  onEditTags: (video: Video) => void;
  onRename: (video: Video) => void;
  onSplit?: (video: Video) => void;
  onMove?: (video: Video) => void;
  onDelete?: (video: Video) => void;
  onFocusMode?: (video: Video) => void;
  onCategorize?: (video: Video) => void;
  onPin?: (video: Video) => void;
  onRemoveCategory?: (videoId: string, categoryType: string, categoryValue: string) => void;
  onUpdateCategories?: (videoId: string, categories: Partial<{ categories: any; customCategories: any }>) => void;
  'data-video-index'?: number;
  onClick?: () => void;
  isSelected?: boolean;
  onSelectionChange?: (videoId: string, selected: boolean) => void;
  showSelection?: boolean;
  isVisible?: boolean; // Viewport visibility for resource management
}

export function VideoCard({
  video,
  onPlay,
  onEditTags,
  onRename,
  onSplit,
  onMove,
  onDelete,
  onFocusMode,
  onCategorize,
  onPin,
  onRemoveCategory,
  onUpdateCategories,
  onClick,
  isSelected = false,
  onSelectionChange,
  showSelection = false,
  isVisible = true, // Default to visible for non-virtualized grids
  ...props
}: VideoCardProps) {
  const [imageError, setImageError] = useState(false);
  const [localThumb, setLocalThumb] = useState<string>(
    video.thumbnail?.generated && video.thumbnail?.dataUrl && !video.thumbnail.dataUrl.startsWith('file://')
      ? video.thumbnail.dataUrl
      : '',
  );
  const [isHovering, setIsHovering] = useState(false);
  const [hoverFrames, setHoverFrames] = useState<string[]>([]);
  const [generatedThumbnails, setGeneratedThumbnails] = useState<string[]>([]);
  const [hoverIndex, setHoverIndex] = useState(0);
  const [spriteSheetUrl, setSpriteSheetUrl] = useState<string | null>(null);
  const [spriteCols, setSpriteCols] = useState<number>(0);
  const [spriteFrameWidth, setSpriteFrameWidth] = useState<number>(64);
  const spriteFrameCount = useMemo(
    () => (spriteCols > 0 ? Math.min(spriteCols, 10) : 0),
    [spriteCols],
  );
  const hoverTimerRef = useRef<number | null>(null);
  const previewUrl = useMemo(() => getVideoSrc(video), [video.id, video.path]);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const bulkService = BulkOperationsService.getInstance();

  const previewStartTime = useMemo(() => {
    const d = video.metadata?.duration || 0;
    if (!Number.isFinite(d) || d <= 0) return 0;
    const minEdge = Math.min(1, Math.max(0.1, d * 0.05));
    const midpoint = d * 0.5;
    return Math.max(minEdge, Math.min(midpoint, Math.max(0, d - minEdge)));
  }, [video.metadata?.duration]);

  const thumbSrc =
    localThumb ||
    (video.thumbnail?.dataUrl?.startsWith('file://') ? '' : video.thumbnail?.dataUrl) ||
    '';
  const hasThumb = thumbSrc.trim() !== '';

  const serverThumbUrl = useMemo(
    () => getThumbnailSrc(video),
    [video.path, video.filename, video.thumbnail?.dataUrl],
  );

  const serverSpriteUrl = useMemo(() => getSpriteSrc(video), [video.path, video.filename]);

  useEffect(() => {
    let mounted = true;
    let cancelled = false;

    // Only load resources if visible
    if (!isVisible) {
      return () => {
        mounted = false;
        cancelled = true;
      };
    }

    // Try to load server thumbnail first
    if (serverThumbUrl && !localThumb) {
      const img = new Image();
      img.onload = () => {
        if (mounted && !cancelled) setLocalThumb(serverThumbUrl);
      };
      img.src = serverThumbUrl;
    }

    if (serverSpriteUrl && !spriteSheetUrl) {
      const img = new Image();
      img.onload = () => {
        if (mounted && !cancelled) {
          const derivedCols = Math.max(1, Math.round(img.naturalWidth / 160));
          const frameWidth = Math.max(1, Math.round(img.naturalWidth / derivedCols));
          setSpriteSheetUrl(serverSpriteUrl);
          setSpriteCols(derivedCols);
          setSpriteFrameWidth(frameWidth);
          SpriteCache.set(
            video.id,
            { cols: derivedCols, frameWidth, frameHeight: img.naturalHeight },
            serverSpriteUrl,
            2,
          );
        }
      };
      img.src = serverSpriteUrl;
    }

    async function maybeGenerate() {
      // If we have a server thumb, skip generation
      if (serverThumbUrl) return;

      const hasValidThumbnail = video.thumbnail?.dataUrl && video.thumbnail.dataUrl.trim() !== '';
      if (!hasValidThumbnail && !imageError && !localThumb) {
        try {
          await ThumbnailGenerator.generateProgressiveForVideo(
            video.id,
            video.filename,
            { quality: 'auto', speed: 'auto', progressive: true },
            (update) => {
              if (!mounted || cancelled) return;
              if (update.low && !localThumb) {
                setLocalThumb(update.low.dataUrl);
              }
              if (update.high) {
                setLocalThumb(update.high.dataUrl);
              }
              if (update.spriteSheet && !spriteSheetUrl) {
                setSpriteSheetUrl(update.spriteSheet);
                // Determine columns by loading the image; each frame is 64px wide
                try {
                  const img = new Image();
                  img.onload = async () => {
                    const cols = Math.max(1, Math.floor(img.naturalWidth / 64));
                    const frameWidth = 64;
                    const frameHeight = img.naturalHeight;
                    setSpriteCols(cols);
                    SpriteCache.set(
                      video.id,
                      { cols, frameWidth, frameHeight },
                      update.spriteSheet,
                      2,
                    );
                    try {
                      await setSpriteMeta(video.id, { cols, frameWidth, frameHeight });
                    } catch { }
                  };
                  img.src = update.spriteSheet;
                } catch { }
              }
            },
          );
        } catch {
          // ignore, placeholder will be shown
        }
      }
    }
    void maybeGenerate();
    return () => {
      mounted = false;
      cancelled = true;
    };
  }, [
    video.id,
    video.thumbnail?.dataUrl,
    imageError,
    localThumb,
    video.filename,
    spriteSheetUrl,
    serverThumbUrl,
    serverSpriteUrl,
    isVisible,
  ]);

  // Extract generated thumbnails from video thumbnail data
  useEffect(() => {
    if (video.thumbnail?.thumbnails && Array.isArray(video.thumbnail.thumbnails)) {
      setGeneratedThumbnails(video.thumbnail.thumbnails);
    } else {
      setGeneratedThumbnails([]);
    }
  }, [video.thumbnail?.thumbnails]);

  // Hydrate sprite cache state if available to avoid recomputing
  useEffect(() => {
    const cached = SpriteCache.get(video.id);
    if (cached) {
      if (cached.dataUrl && !spriteSheetUrl) setSpriteSheetUrl(cached.dataUrl);
      if (cached.meta?.cols && spriteCols === 0) setSpriteCols(cached.meta.cols);
      if (cached.meta?.frameWidth && spriteFrameWidth === 64)
        setSpriteFrameWidth(cached.meta.frameWidth);
    } else {
      // Hydrate from IndexedDB if available
      void (async () => {
        try {
          const meta = await getSpriteMeta(video.id);
          if (meta) {
            if (spriteCols === 0 && meta.cols) setSpriteCols(meta.cols);
            if (meta.frameWidth && spriteFrameWidth === 64) setSpriteFrameWidth(meta.frameWidth);
          }
        } catch { }
      })();
    }
    // no cleanup needed
  }, [video.id]);

  useEffect(() => {
    // When hovering, choose preview source priority: external frames > generated thumbnails > sprite sheet > video preview
    const useFrames = isHovering && hoverFrames.length > 0;
    const useGeneratedThumbnails = isHovering && !useFrames && generatedThumbnails.length > 0;
    const useSprite =
      isHovering &&
      !useFrames &&
      !useGeneratedThumbnails &&
      !!spriteSheetUrl &&
      spriteFrameCount > 0;

    if (useFrames || useGeneratedThumbnails || useSprite) {
      // Start cycling frames
      if (hoverTimerRef.current) {
        window.clearInterval(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      hoverTimerRef.current = window.setInterval(() => {
        let modulo;
        if (useFrames) {
          modulo = hoverFrames.length;
        } else if (useGeneratedThumbnails) {
          modulo = generatedThumbnails.length;
        } else {
          modulo = Math.max(1, spriteFrameCount);
        }
        setHoverIndex((i) => (i + 1) % modulo);
      }, 300); // Slightly faster cycling for better preview experience
      // Pause any playing video preview while using frames
      if (previewRef.current && !previewRef.current.paused) {
        try {
          previewRef.current.pause();
        } catch { }
      }
    } else if (isHovering && previewRef.current) {
      const video = previewRef.current;
      if (video.readyState >= 2) {
        // HAVE_CURRENT_DATA or higher
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Silently ignore play errors - autoplay might be blocked
          });
        }
      }
    } else if (!isHovering && previewRef.current) {
      const video = previewRef.current;
      if (!video.paused) {
        video.pause();
        video.currentTime = previewStartTime > 0 ? previewStartTime : 0;
      }
    }
    if (!isHovering && hoverTimerRef.current) {
      window.clearInterval(hoverTimerRef.current);
      hoverTimerRef.current = null;
      setHoverIndex(0);
    }
  }, [
    isHovering,
    previewStartTime,
    hoverFrames.length,
    generatedThumbnails.length,
    spriteSheetUrl,
    spriteFrameCount,
  ]);

  // Lazy-load hover frames on first hover (only if visible)
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    // Throttle hover frame loading - only load if visible and hovering for >200ms
    if (isHovering && isVisible && hoverFrames.length === 0) {
      timeoutId = window.setTimeout(() => {
        void VideoThumbnailService.tryReadExternalThumbnailsForVideo(video.id, video.filename)
          .then((frames) => {
            if (!cancelled && frames && frames.length > 0) {
              // Prefer unique frames; keep at most 3
              const uniq = Array.from(new Set(frames)).slice(0, 3);
              setHoverFrames(uniq);
              setHoverIndex(0);
            }
          })
          .catch(() => { });
      }, 200);
    }
    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isHovering, hoverFrames.length, video.id, video.filename, isVisible]);

  const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '-:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  };

  const getAllCategories = () => {
    const categories: { type: string; value: string; color: string; isCustom: boolean }[] = [];

    Object.entries(video.categories).forEach(([type, values]) => {
      values.forEach((value: string) => {
        categories.push({
          type,
          value,
          color: getCategoryColorClasses(type),
          isCustom: false,
        });
      });
    });

    Object.entries(video.customCategories).forEach(([type, values]) => {
      values.forEach((value: string) => {
        categories.push({
          type,
          value,
          color: getCategoryColorClasses(type, true),
          isCustom: true,
        });
      });
    });

    return categories.slice(0, 6);
  };

  const UNASSIGNED_TYPES = ['age', 'physical', 'ethnicity', 'relationship', 'acts', 'setting', 'quality'] as const;
  const UNASSIGNED_LABELS: Record<string, string> = {
    age: 'age', physical: 'physical', ethnicity: 'ethnicity',
    relationship: 'relationship', acts: 'acts', setting: 'setting', quality: 'quality',
  };

  const getUnassignedTypes = () =>
    UNASSIGNED_TYPES.filter((type) => !video.categories[type]?.length);

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger play if clicking on action buttons or checkbox
    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('[role="checkbox"]')
    ) {
      return;
    }

    console.log('[VideoCard] Click:', {
      ctrl: e.ctrlKey,
      meta: e.metaKey,
      alt: e.altKey,
      shift: e.shiftKey,
    });

    // Focus the card for keyboard navigation
    cardRef.current?.focus();

    // Call the onClick prop if provided
    if (onClick) {
      onClick();
    }

    // Handle selection toggle with Ctrl/Cmd click
    if (e.ctrlKey || e.metaKey) {
      handleSelectionChange(!isSelected);
      return;
    }

    onPlay(video);
  };

  const handleSelectionChange = (checked: boolean) => {
    if (onSelectionChange) {
      onSelectionChange(video.id, checked);
    } else {
      // Fallback to bulk service
      if (checked) {
        bulkService.selectVideo(video.id);
      } else {
        bulkService.deselectVideo(video.id);
      }
    }
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        onPlay(video);
        break;
      case ' ':
        e.preventDefault();
        // If in selection mode, Space toggles selection
        if (showSelection) {
          handleSelectionChange(!isSelected);
        } else {
          // Otherwise, Space plays the video
          onPlay(video);
        }
        break;
      case 'e':
        e.preventDefault();
        onEditTags(video);
        break;
      case 'r':
        e.preventDefault();
        onRename(video);
        break;
      case 'm':
        if (onMove) {
          e.preventDefault();
          onMove(video);
        }
        break;
      case 'Delete':
        if (onDelete) {
          e.preventDefault();
          if (confirm('Delete this file from disk? You will have a short window to undo.')) {
            onDelete(video);
          }
        }
        break;
      case 'f':
        if (onFocusMode) {
          e.preventDefault();
          onFocusMode(video);
        }
        break;
      case 'c':
        if (onCategorize) {
          e.preventDefault();
          onCategorize(video);
        }
        break;
    }
  };

  const handleCategoryChipKeyDown = (
    e: React.KeyboardEvent,
    category: { type: string; value: string; isCustom: boolean },
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (onRemoveCategory) {
        if (category.isCustom) {
          onRemoveCategory(video.id, 'custom', `${category.type}:${category.value}`);
        } else {
          onRemoveCategory(video.id, category.type, category.value);
        }
      }
    }
  };

  // Expose focus method for external use
  useEffect(() => {
    if (cardRef.current) {
      (cardRef.current as unknown as { focusCard: () => void }).focusCard = () => {
        cardRef.current?.focus();
      };
    }
  }, []);

  return (
    <Card
      ref={cardRef}
      className={cn(
        'video-card-hover cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-all duration-200',
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5',
        showSelection && 'relative',
      )}
      onFocus={(e) => {
        const prev = e.relatedTarget as Node | null;
        if (prev && e.currentTarget.contains(prev)) return;
        setIsHovering(true);
      }}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) {
          return;
        }
        setIsHovering(false);
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Video: ${video.displayName}. Duration: ${formatDuration(video.metadata.duration)}. Size: ${formatFileSize(video.size)}. Click to play, or use keyboard shortcuts: E for edit tags, R for rename, M for move, F for focus mode, Delete for delete.`}
      data-testid={`video-card-${video.id}`}
      {...props}
    >
      {/* Selection Checkbox */}
      {(showSelection || isHovering) && (
        <div className="absolute top-2 left-2 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={handleSelectionChange}
            onClick={(e) => e.stopPropagation()}
            className="bg-white/90 border-2 border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            data-testid={`checkbox-select-${video.id}`}
          />
        </div>
      )}

      {/* Video Thumbnail */}
      <div
        className="video-thumbnail relative"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        data-testid={`video-card-thumbnail-${video.id}`}
      >
        {!imageError && hasThumb ? (
          <img
            src={thumbSrc}
            alt={`Thumbnail for ${video.displayName}`}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-border">
            <FileVideo className="h-12 w-12 text-muted-foreground" />
          </div>
        )}

        {/* On hover: external frames > generated thumbnails > sprite sheet > video preview */}
        {isHovering && hoverFrames.length > 0 ? (
          <img
            src={hoverFrames[hoverIndex]}
            alt="Alternate thumbnail preview"
            className="absolute inset-0 w-full h-full object-cover"
            data-testid={`hover-thumb-${video.id}`}
          />
        ) : isHovering && generatedThumbnails.length > 0 ? (
          <img
            src={generatedThumbnails[hoverIndex]}
            alt="Generated thumbnail preview"
            className="absolute inset-0 w-full h-full object-cover"
            data-testid={`generated-thumb-${video.id}`}
          />
        ) : isHovering && spriteSheetUrl && spriteCols > 0 ? (
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              backgroundImage: `url(${spriteSheetUrl})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: 'auto 100%',
              // Each frame is 64px wide in the sprite sheet; shift X by index
              backgroundPosition: `${-hoverIndex * spriteFrameWidth}px 0px`,
            }}
            data-testid={`sprite-thumb-${video.id}`}
          />
        ) : isHovering && previewUrl ? (
          <video
            ref={previewRef}
            src={previewUrl}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
            loop
            autoPlay
            preload="metadata"
            poster={hasThumb ? thumbSrc : undefined}
            data-testid={`animated-thumb-${video.id}`}
            onLoadedMetadata={(e) => {
              try {
                if (previewStartTime > 0) {
                  e.currentTarget.currentTime = previewStartTime;
                }
                if (isHovering && e.currentTarget.readyState >= 2) {
                  const playPromise = e.currentTarget.play();
                  if (playPromise !== undefined) {
                    playPromise.catch(() => {
                      // Silently ignore play errors - autoplay might be blocked
                    });
                  }
                }
              } catch { }
            }}
          />
        ) : null}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black bg-opacity-30 opacity-0 hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <Button
            size="lg"
            className="p-3 bg-white bg-opacity-20 backdrop-blur-sm rounded-full text-white hover:bg-opacity-30 transition-colors"
            data-testid={`button-play-${video.id}`}
            aria-label={`Play ${video.displayName}`}
            onClick={(e) => {
              e.stopPropagation();
              onPlay(video);
            }}
          >
            <Play className="h-6 w-6" />
          </Button>
        </div>

        {/* Duration badge */}
        <div className="absolute top-2 right-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded flex items-center">
          <Clock className="mr-1 h-3 w-3" />
          <span data-testid={`text-duration-${video.id}`}>
            {formatDuration(video.metadata.duration)}
          </span>
        </div>

        {/* Quality badge */}
        {video.categories.quality.length > 0 && (
          <div
            className="absolute bottom-2 left-2 bg-primary text-white text-xs px-2 py-1 rounded"
            title={video.categories.quality[0]}
          >
            <span data-testid={`text-quality-${video.id}`}>
              {video.categories.quality[0].toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <CardContent className="p-3 sm:p-4">
        <h4
          className="font-medium text-foreground text-sm leading-tight mb-2 line-clamp-2"
          data-testid={`text-title-${video.id}`}
        >
          {video.displayName}
        </h4>

        {/* Category chips */}
        <div className="flex flex-wrap gap-1 mb-3">
          {getAllCategories().map((category, index) => (
            <Badge
              key={`${category.type}-${category.value}-${index}`}
              className={`category-chip text-xs ${category.color} cursor-pointer focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1`}
              data-testid={`category-chip-${video.id}-${index}`}
              onClick={(e) => {
                e.stopPropagation();
                if (onRemoveCategory) {
                  if (category.isCustom) {
                    onRemoveCategory(video.id, 'custom', `${category.type}:${category.value}`);
                  } else {
                    onRemoveCategory(video.id, category.type, category.value);
                  }
                }
              }}
              onKeyDown={(e) => handleCategoryChipKeyDown(e, category)}
              tabIndex={0}
              role="button"
              aria-label={`Remove ${category.isCustom ? category.type + ': ' + category.value : category.value} category. Press Enter or Space to remove.`}
              title={category.isCustom ? `${category.type}: ${category.value}` : category.value}
            >
              {category.value}
            </Badge>
          ))}
          {getUnassignedTypes().map((type) => (
            <span
              key={`unassigned-${type}`}
              className="inline-flex items-center rounded-md border border-dashed border-muted-foreground/30 px-1.5 py-0.5 text-xs text-muted-foreground/50"
              title={`${UNASSIGNED_LABELS[type]}: unassigned`}
              data-testid={`unassigned-chip-${video.id}-${type}`}
            >
              {UNASSIGNED_LABELS[type]}
            </span>
          ))}
          {onUpdateCategories && (
            <CategoryPicker video={video} onApply={onUpdateCategories} />
          )}
        </div>

        {/* Actions and metadata */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center" data-testid={`text-size-${video.id}`}>
            <FileVideo className="mr-1 h-3 w-3" />
            {formatFileSize(video.size)}
          </span>
          <div className="flex items-center -mr-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onEditTags(video);
              }}
              className="h-10 w-10 sm:h-8 sm:w-8 focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid={`button-edit-tags-${video.id}`}
              aria-label={`Edit tags for ${video.displayName}`}
              title="Edit tags (E)"
            >
              <Tags className="h-4 w-4 sm:h-3 sm:w-3 text-accentEmerald" />
            </Button>
            {onCategorize && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onCategorize(video);
                }}
                className="h-10 w-10 sm:h-8 sm:w-8 focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid={`button-categorize-${video.id}`}
                aria-label={`Categorize ${video.displayName}`}
                title="Categorize (C)"
              >
                <LayoutGrid className="h-4 w-4 sm:h-3 sm:w-3 text-accentEmerald" />
              </Button>
            )}
            {onPin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onPin(video);
                }}
                className="h-10 w-10 sm:h-8 sm:w-8 focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid={`button-pin-${video.id}`}
                aria-label={`Pin ${video.displayName} to editor`}
                title="Pin to editor (P)"
              >
                <Pin className="h-4 w-4 sm:h-3 sm:w-3 text-muted-foreground" />
              </Button>
            )}
            {onSplit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onSplit(video);
                }}
                className="h-10 w-10 sm:h-8 sm:w-8 focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid={`button-split-${video.id}`}
                aria-label={`Split ${video.displayName}`}
                title="Split into two files"
              >
                <Scissors className="h-4 w-4 sm:h-3 sm:w-3 text-muted-foreground" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onRename(video);
              }}
              className="h-10 w-10 sm:h-8 sm:w-8 focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid={`button-rename-${video.id}`}
              aria-label={`Rename ${video.displayName}`}
              title="Rename (R)"
            >
              <Edit className="h-4 w-4 sm:h-3 sm:w-3 text-muted-foreground" />
            </Button>
            {onMove && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(video);
                }}
                className="h-10 w-10 sm:h-8 sm:w-8 focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid={`button-move-${video.id}`}
                aria-label={`Move ${video.displayName}`}
                title="Move (M)"
              >
                <FolderPlus className="h-4 w-4 sm:h-3 sm:w-3 text-muted-foreground" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(video);
                }}
                className="h-10 w-10 sm:h-8 sm:w-8 focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid={`button-delete-${video.id}`}
                aria-label={`Delete ${video.displayName}`}
                title="Delete (Delete)"
              >
                <Trash2 className="h-4 w-4 sm:h-3 sm:w-3 text-red-500" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
