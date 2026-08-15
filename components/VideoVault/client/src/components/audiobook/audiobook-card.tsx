import { useState, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { Audiobook } from '@/types/media';
import { Headphones, Play, Clock, User, BookMarked, Percent, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudiobookCardProps {
  audiobook: Audiobook;
  onPlay: (audiobook: Audiobook) => void;
  onClick?: () => void;
  isSelected?: boolean;
  onSelectionChange?: (audiobookId: string, selected: boolean) => void;
  showSelection?: boolean;
}

export function AudiobookCard({
  audiobook,
  onPlay,
  onClick,
  isSelected = false,
  onSelectionChange,
  showSelection = false,
}: AudiobookCardProps) {
  const [imageError, setImageError] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  };

  const progressPercentage = useMemo(() => {
    if (!audiobook.progress) return 0;
    const { chapterIndex, position } = audiobook.progress;
    const completedDuration =
      audiobook.chapters
        .slice(0, chapterIndex)
        .reduce((acc, ch) => acc + ch.duration, 0) + (position || 0);
    return Math.round((completedDuration / audiobook.totalDuration) * 100);
  }, [audiobook.progress, audiobook.chapters, audiobook.totalDuration]);

  const currentChapter = useMemo(() => {
    if (!audiobook.progress) return null;
    return audiobook.chapters[audiobook.progress.chapterIndex];
  }, [audiobook.progress, audiobook.chapters]);

  const handleCardClick = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('[role="checkbox"]')
    ) {
      return;
    }

    cardRef.current?.focus();
    onClick?.();

    if (e.ctrlKey || e.metaKey) {
      handleSelectionChange(!isSelected);
      return;
    }

    onPlay(audiobook);
  };

  const handleSelectionChange = (checked: boolean) => {
    onSelectionChange?.(audiobook.id, checked);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        onPlay(audiobook);
        break;
      case ' ':
        e.preventDefault();
        if (showSelection) {
          handleSelectionChange(!isSelected);
        } else {
          onPlay(audiobook);
        }
        break;
    }
  };

  return (
    <Card
      ref={cardRef}
      className={cn(
        'video-card-hover cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-all duration-200',
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5',
        showSelection && 'relative',
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Audiobook: ${audiobook.title} by ${audiobook.author}. Duration: ${formatDuration(audiobook.totalDuration)}. ${audiobook.chapters.length} chapters. Press Enter to play.`}
      data-testid={`audiobook-card-${audiobook.id}`}
    >
      {/* Selection Checkbox */}
      {showSelection && (
        <div className="absolute top-2 left-2 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={handleSelectionChange}
            onClick={(e) => e.stopPropagation()}
            className="bg-white/90 border-2 border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            data-testid={`checkbox-select-${audiobook.id}`}
          />
        </div>
      )}

      {/* Book Cover */}
      <div
        className="relative aspect-square bg-gradient-to-br from-purple-900/50 to-indigo-900/50"
        data-testid={`audiobook-card-cover-${audiobook.id}`}
      >
        {!imageError && audiobook.coverImage ? (
          <img
            src={audiobook.coverImage}
            alt={`Cover for ${audiobook.title}`}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Headphones className="h-16 w-16 text-purple-300" />
          </div>
        )}

        {/* Overlay on hover */}
        <div
          className={cn(
            'absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity duration-200',
            isHovering ? 'opacity-100' : 'opacity-0',
          )}
        >
          <Button
            size="lg"
            className="bg-purple-600 hover:bg-purple-700 text-white rounded-full p-4"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(audiobook);
            }}
            data-testid={`button-play-${audiobook.id}`}
          >
            <Play className="h-6 w-6" />
          </Button>
        </div>

        {/* Progress indicator */}
        {progressPercentage > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/50">
            <div
              className="h-full bg-purple-500 transition-all"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        )}

        {/* Duration badge */}
        <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded flex items-center">
          <Clock className="mr-1 h-3 w-3" />
          <span data-testid={`text-duration-${audiobook.id}`}>
            {formatDuration(audiobook.totalDuration)}
          </span>
        </div>

        {/* Chapter count badge */}
        <div className="absolute bottom-2 left-2 bg-purple-600/80 text-white text-xs px-2 py-1 rounded">
          {audiobook.chapters.length} chapters
        </div>
      </div>

      <CardContent className="p-3 sm:p-4">
        {/* Title */}
        <h4
          className="font-medium text-foreground text-sm leading-tight mb-1 line-clamp-2"
          data-testid={`text-title-${audiobook.id}`}
        >
          {audiobook.title}
        </h4>

        {/* Author */}
        <p
          className="text-xs text-muted-foreground mb-1 flex items-center"
          data-testid={`text-author-${audiobook.id}`}
        >
          <User className="h-3 w-3 mr-1" />
          {audiobook.author}
        </p>

        {/* Narrator */}
        {audiobook.metadata.narrator && (
          <p className="text-xs text-muted-foreground mb-2 flex items-center">
            <Mic className="h-3 w-3 mr-1" />
            {audiobook.metadata.narrator}
          </p>
        )}

        {/* Series info */}
        {audiobook.metadata.series && (
          <p className="text-xs text-muted-foreground mb-2 flex items-center">
            <BookMarked className="h-3 w-3 mr-1" />
            {audiobook.metadata.series}
            {audiobook.metadata.seriesIndex && ` #${audiobook.metadata.seriesIndex}`}
          </p>
        )}

        {/* Current progress */}
        {currentChapter && progressPercentage > 0 && (
          <Badge variant="secondary" className="text-xs mb-2">
            {currentChapter.title} - {progressPercentage}%
          </Badge>
        )}

        {/* Footer: Size and progress */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center" data-testid={`text-size-${audiobook.id}`}>
            <Headphones className="mr-1 h-3 w-3" />
            {formatFileSize(audiobook.totalSize)}
          </span>
          {progressPercentage > 0 && (
            <span className="flex items-center text-purple-400">
              <Percent className="mr-1 h-3 w-3" />
              {progressPercentage}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
