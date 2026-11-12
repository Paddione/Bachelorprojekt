import { useRef } from 'react';
import type { Video } from '@/types/video';
import { BulkOperationsService } from '@/services/bulk-operations';
import { useVideoCardMedia, VideoCardMedia } from './use-video-card-media';
import { chipRemovalArgs, CategoryChipItem } from './video-queries';

export interface VideoCardCallbacks {
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
  onClick?: () => void;
  onSelectionChange?: (videoId: string, selected: boolean) => void;
}

export interface VideoCardHandlers {
  media: VideoCardMedia;
  handleCardClick: (e: React.MouseEvent) => void;
  handleCardKeyDown: (e: React.KeyboardEvent) => void;
  handleCategoryKeyDown: (e: React.KeyboardEvent, chip: CategoryChipItem) => void;
  handleSelectionChange: (checked: boolean) => void;
  stop: (e: React.SyntheticEvent) => void;
}

export function useVideoCard(video: Video, cb: VideoCardCallbacks,
  isSelected: boolean, showSelection: boolean, isVisible: boolean): VideoCardHandlers {
  const media = useVideoCardMedia(video, isVisible);
  const bulkService = useRef(BulkOperationsService.getInstance()).current;

  const handleSelectionChange = (checked: boolean) => {
    if (cb.onSelectionChange) cb.onSelectionChange(video.id, checked);
    else if (checked) bulkService.selectVideo(video.id);
    else bulkService.deselectVideo(video.id);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('button') || t.closest('[role="checkbox"]')) return;
    media.cardRef.current?.focus();
    cb.onClick?.();
    if (e.ctrlKey || e.metaKey) handleSelectionChange(!isSelected);
    else cb.onPlay(video);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key;
    if (key === 'Enter') { e.preventDefault(); cb.onPlay(video); return; }
    if (key === ' ') {
      e.preventDefault();
      if (showSelection) handleSelectionChange(!isSelected);
      else cb.onPlay(video);
      return;
    }
    const simple: Record<string, () => void> = {
      e: () => cb.onEditTags(video),
      r: () => cb.onRename(video),
    };
    const opt: Record<string, ((v: Video) => void) | undefined> = {
      m: cb.onMove, f: cb.onFocusMode, c: cb.onCategorize,
    };
    if (simple[key]) { e.preventDefault(); simple[key](); return; }
    if (opt[key]) { e.preventDefault(); opt[key]?.(video); return; }
    if (key === 'Delete' && cb.onDelete) {
      e.preventDefault();
      if (confirm('Delete this file from disk? You will have a short window to undo.')) cb.onDelete(video);
    }
  };

  const handleCategoryKeyDown = (e: React.KeyboardEvent, chip: CategoryChipItem) => {
    if ((e.key === 'Enter' || e.key === ' ') && cb.onRemoveCategory) {
      e.preventDefault();
      e.stopPropagation();
      const [t, v] = chipRemovalArgs(chip);
      cb.onRemoveCategory(video.id, t, v);
    }
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return { media, handleCardClick, handleCardKeyDown, handleCategoryKeyDown, handleSelectionChange, stop };
}
