import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { Video } from '@/types/video';
import { Play, Clock, FileVideo, Tags, Edit, FolderPlus, Trash2, Scissors, Pin, LayoutGrid } from 'lucide-react';
import { CategoryPicker } from '@/components/video/category-picker';
import { cn } from '@/lib/utils';
import { useVideoCard, VideoCardCallbacks } from './use-video-card';
import { buildCategoryChips, chipRemovalArgs, formatDuration, formatFileSize, unassignedTypes, UNASSIGNED_LABELS } from './video-queries';

export interface VideoCardProps extends VideoCardCallbacks {
  video: Video;
  'data-video-index'?: number;
  onClick?: () => void;
  isSelected?: boolean;
  onSelectionChange?: (videoId: string, selected: boolean) => void;
  showSelection?: boolean;
  isVisible?: boolean;
}

function Action({ testid, label, title, onPress, Icon, tone }: {
  testid: string; label: string; title: string; onPress: (v: never) => void; Icon: typeof Play; tone: string;
}) {
  return (
    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onPress(e as never); }}
      className="h-10 w-10 sm:h-8 sm:w-8 focus:outline-none focus:ring-2 focus:ring-primary"
      data-testid={testid} aria-label={label} title={title}>
      <Icon className={`h-4 w-4 sm:h-3 sm:w-3 ${tone}`} />
    </Button>
  );
}

export function VideoCardView({ video, h, cb, isSelected, showSelection, ...rest }: {
  video: Video; h: ReturnType<typeof useVideoCard>; cb: VideoCardCallbacks;
  isSelected: boolean; showSelection: boolean; [k: string]: unknown;
}) {
  const m = h.media;
  const chips = buildCategoryChips(video);
  const un = unassignedTypes(video);
  const previewKind = m.hoverFrames.length > 0 ? 'frames'
    : m.generatedThumbnails.length > 0 ? 'thumbs' : m.spriteSheetUrl && m.spriteCols > 0 ? 'sprite' : 'video';
  const acts = [
    { id: 'edit', show: true, testid: `button-edit-tags-${video.id}`, label: `Edit tags for ${video.displayName}`, title: 'Edit tags (E)', Icon: Tags, tone: 'text-accentEmerald', fn: cb.onEditTags },
    { id: 'cat', show: !!cb.onCategorize, testid: `button-categorize-${video.id}`, label: `Categorize ${video.displayName}`, title: 'Categorize (C)', Icon: LayoutGrid, tone: 'text-accentEmerald', fn: cb.onCategorize },
    { id: 'pin', show: !!cb.onPin, testid: `button-pin-${video.id}`, label: `Pin ${video.displayName} to editor`, title: 'Pin to editor (P)', Icon: Pin, tone: 'text-muted-foreground', fn: cb.onPin },
    { id: 'split', show: !!cb.onSplit, testid: `button-split-${video.id}`, label: `Split ${video.displayName}`, title: 'Split into two files', Icon: Scissors, tone: 'text-muted-foreground', fn: cb.onSplit },
    { id: 'rename', show: true, testid: `button-rename-${video.id}`, label: `Rename ${video.displayName}`, title: 'Rename (R)', Icon: Edit, tone: 'text-muted-foreground', fn: cb.onRename },
    { id: 'move', show: !!cb.onMove, testid: `button-move-${video.id}`, label: `Move ${video.displayName}`, title: 'Move (M)', Icon: FolderPlus, tone: 'text-muted-foreground', fn: cb.onMove },
    { id: 'del', show: !!cb.onDelete, testid: `button-delete-${video.id}`, label: `Delete ${video.displayName}`, title: 'Delete (Delete)', Icon: Trash2, tone: 'text-red-500', fn: cb.onDelete },
  ].filter((a) => a.show);
  return (
    <Card ref={m.cardRef} {...rest} onFocus={() => m.setIsHovering(true)} onBlur={() => m.setIsHovering(false)}
      onMouseEnter={() => m.setIsHovering(true)} onMouseLeave={() => m.setIsHovering(false)}
      onClick={h.handleCardClick} onKeyDown={h.handleCardKeyDown} tabIndex={0} role="button"
      aria-label={`Video: ${video.displayName}. Duration: ${formatDuration(video.metadata.duration)}. Size: ${formatFileSize(video.size)}.`}
      data-testid={`video-card-${video.id}`}
      className={cn('video-card-hover cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-all duration-200',
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5', showSelection && 'relative')}>
      {(showSelection || m.isHovering) && (
        <div className="absolute top-2 left-2 z-10">
          <Checkbox checked={isSelected} onCheckedChange={h.handleSelectionChange} onClick={h.stop}
            className="bg-white/90 border-2 border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            data-testid={`checkbox-select-${video.id}`} />
        </div>
      )}
      <div className="video-thumbnail relative" data-testid={`video-card-thumbnail-${video.id}`}>
        {!m.imageError && m.hasThumb ? (
          <img src={m.thumbSrc} alt={`Thumbnail for ${video.displayName}`} className="w-full h-full object-cover" onError={() => m.setImageError(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-border">
            <FileVideo className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        {m.isHovering && previewKind === 'frames' && (
          <img src={m.hoverFrames[m.hoverIndex]} alt="Alternate thumbnail preview" className="absolute inset-0 w-full h-full object-cover" data-testid={`hover-thumb-${video.id}`} />)}
        {m.isHovering && previewKind === 'thumbs' && (
          <img src={m.generatedThumbnails[m.hoverIndex]} alt="Generated thumbnail preview" className="absolute inset-0 w-full h-full object-cover" data-testid={`generated-thumb-${video.id}`} />)}
        {m.isHovering && previewKind === 'sprite' && (
          <div className="absolute inset-0 w-full h-full" data-testid={`sprite-thumb-${video.id}`}
            style={{ backgroundImage: `url(${m.spriteSheetUrl})`, backgroundRepeat: 'no-repeat', backgroundSize: 'auto 100%', backgroundPosition: `${-m.hoverIndex * m.spriteFrameWidth}px 0px` }} />)}
        {m.isHovering && previewKind === 'video' && m.previewUrl && (
          <video ref={m.previewRef} src={m.previewUrl} className="absolute inset-0 w-full h-full object-cover" muted playsInline loop autoPlay preload="metadata"
            poster={m.hasThumb ? m.thumbSrc : undefined} data-testid={`animated-thumb-${video.id}`}
            onLoadedMetadata={(e) => { try { if (m.previewStartTime > 0) e.currentTarget.currentTime = m.previewStartTime; } catch { /* noop */ } }} />)}
        <div className="absolute inset-0 bg-black bg-opacity-30 opacity-0 hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <Button size="lg" data-testid={`button-play-${video.id}`} aria-label={`Play ${video.displayName}`}
            className="p-3 bg-white bg-opacity-20 backdrop-blur-sm rounded-full text-white hover:bg-opacity-30 transition-colors"
            onClick={(e) => { e.stopPropagation(); cb.onPlay(video); }}>
            <Play className="h-6 w-6" />
          </Button>
        </div>
        <div className="absolute top-2 right-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded flex items-center">
          <Clock className="mr-1 h-3 w-3" />
          <span data-testid={`text-duration-${video.id}`}>{formatDuration(video.metadata.duration)}</span>
        </div>
        {video.categories.quality.length > 0 && (
          <div className="absolute bottom-2 left-2 bg-primary text-white text-xs px-2 py-1 rounded" title={video.categories.quality[0]}>
            <span data-testid={`text-quality-${video.id}`}>{video.categories.quality[0].toUpperCase()}</span>
          </div>
        )}
      </div>
      <CardContent className="p-3 sm:p-4">
        <h4 className="font-medium text-foreground text-sm leading-tight mb-2 line-clamp-2" data-testid={`text-title-${video.id}`}>{video.displayName}</h4>
        <div className="flex flex-wrap gap-1 mb-3">
          {chips.map((c, i) => (
            <Badge key={`${c.type}-${c.value}-${i}`} data-testid={`category-chip-${video.id}-${i}`}
              className={`category-chip text-xs ${c.color} cursor-pointer focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1`}
              onClick={(e) => { e.stopPropagation(); if (cb.onRemoveCategory) { const [t, v] = chipRemovalArgs(c); cb.onRemoveCategory(video.id, t, v); } }}
              onKeyDown={(e) => h.handleCategoryKeyDown(e, c)} tabIndex={0} role="button"
              aria-label={`Remove ${c.isCustom ? c.type + ': ' + c.value : c.value} category. Press Enter or Space to remove.`}
              title={c.isCustom ? `${c.type}: ${c.value}` : c.value}>{c.value}</Badge>
          ))}
          {un.map((t) => (
            <span key={`unassigned-${t}`} data-testid={`unassigned-chip-${video.id}-${t}`}
              className="inline-flex items-center rounded-md border border-dashed border-muted-foreground/30 px-1.5 py-0.5 text-xs text-muted-foreground/50"
              title={`${UNASSIGNED_LABELS[t]}: unassigned`}>{UNASSIGNED_LABELS[t]}</span>
          ))}
          {cb.onUpdateCategories && <CategoryPicker video={video} onApply={cb.onUpdateCategories} />}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center" data-testid={`text-size-${video.id}`}>
            <FileVideo className="mr-1 h-3 w-3" />{formatFileSize(video.size)}
          </span>
          <div className="flex items-center -mr-2">
            {acts.map((a) => <Action key={a.id} testid={a.testid} label={a.label} title={a.title} Icon={a.Icon} tone={a.tone} onPress={() => a.fn?.(video)} />)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function VideoCard({ video, onPlay, onEditTags, onRename, onSplit, onMove, onDelete,
  onFocusMode, onCategorize, onPin, onRemoveCategory, onUpdateCategories, onClick,
  onSelectionChange, isSelected = false, showSelection = false, isVisible = true, ...rest }: VideoCardProps) {
  const cb = { onPlay, onEditTags, onRename, onSplit, onMove, onDelete, onFocusMode,
    onCategorize, onPin, onRemoveCategory, onUpdateCategories, onClick, onSelectionChange };
  const h = useVideoCard(video, cb, isSelected, showSelection, isVisible);
  return <VideoCardView video={video} h={h} cb={cb} isSelected={isSelected} showSelection={showSelection} {...rest} />;
}
