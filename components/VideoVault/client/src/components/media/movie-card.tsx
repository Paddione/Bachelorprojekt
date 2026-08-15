import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Film, Play, Clock, HardDrive, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Movie {
  id: string;
  title: string;
  year?: number;
  path: string;
  thumbnailPath?: string;
  spritePath?: string;
  duration: number;
  fileSize: number;
  width: number;
  height: number;
  codec?: string;
  lastModified: string;
}

interface MovieCardProps {
  movie: Movie;
  onPlay: (movie: Movie) => void;
  onClick?: () => void;
  isSelected?: boolean;
  onSelectionChange?: (movieId: string, selected: boolean) => void;
  showSelection?: boolean;
}

export function MovieCard({
  movie,
  onPlay,
  onClick,
  isSelected = false,
  onSelectionChange,
  showSelection = false,
}: MovieCardProps) {
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

  const getQualityLabel = (width: number, height: number): string => {
    if (height >= 2160) return '4K';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    return 'SD';
  };

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

    onPlay(movie);
  };

  const handleSelectionChange = (checked: boolean) => {
    onSelectionChange?.(movie.id, checked);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        onPlay(movie);
        break;
      case ' ':
        e.preventDefault();
        if (showSelection) {
          handleSelectionChange(!isSelected);
        } else {
          onPlay(movie);
        }
        break;
    }
  };

  return (
    <Card
      ref={cardRef}
      className={cn(
        'movie-card cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-all duration-200',
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5',
        showSelection && 'relative',
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Movie: ${movie.title}${movie.year ? ` (${movie.year})` : ''}. Duration: ${formatDuration(movie.duration)}. Press Enter to play.`}
      data-testid={`movie-card-${movie.id}`}
    >
      {/* Selection Checkbox */}
      {showSelection && (
        <div className="absolute top-2 left-2 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={handleSelectionChange}
            onClick={(e) => e.stopPropagation()}
            className="bg-white/90 border-2 border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            data-testid={`checkbox-select-${movie.id}`}
          />
        </div>
      )}

      {/* Movie Poster / Thumbnail */}
      <div className="movie-poster" data-testid={`movie-card-poster-${movie.id}`}>
        {!imageError && movie.thumbnailPath ? (
          <img
            src={movie.thumbnailPath}
            alt={`Thumbnail for ${movie.title}`}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="h-16 w-16 text-blue-300" />
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
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(movie);
            }}
            data-testid={`button-play-${movie.id}`}
          >
            <Play className="h-6 w-6" />
          </Button>
        </div>

        {/* Year badge */}
        {movie.year && (
          <div className="movie-year" data-testid={`text-year-${movie.id}`}>
            {movie.year}
          </div>
        )}

        {/* Quality badge */}
        <div className="movie-quality">
          {getQualityLabel(movie.width, movie.height)}
        </div>

        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded flex items-center">
          <Clock className="mr-1 h-3 w-3" />
          <span data-testid={`text-duration-${movie.id}`}>
            {formatDuration(movie.duration)}
          </span>
        </div>
      </div>

      <CardContent className="movie-info p-3 sm:p-4">
        {/* Title */}
        <h4
          className="movie-title font-medium text-foreground text-sm leading-tight mb-2 line-clamp-2"
          data-testid={`text-title-${movie.id}`}
        >
          {movie.title}
        </h4>

        {/* Meta info */}
        <div className="movie-meta flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center" data-testid={`text-size-${movie.id}`}>
            <HardDrive className="mr-1 h-3 w-3" />
            {formatFileSize(movie.fileSize)}
          </span>
          {movie.codec && (
            <span className="text-blue-400">{movie.codec.toUpperCase()}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
