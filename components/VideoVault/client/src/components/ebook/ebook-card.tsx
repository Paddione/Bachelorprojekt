import { useState, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { Ebook, EbookFormat } from '@/types/media';
import { BookOpen, Download, FileText, User, BookMarked, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EbookCardProps {
  ebook: Ebook;
  onRead: (ebook: Ebook, format?: EbookFormat) => void;
  onDownload: (ebook: Ebook, format: EbookFormat) => void;
  onClick?: () => void;
  isSelected?: boolean;
  onSelectionChange?: (ebookId: string, selected: boolean) => void;
  showSelection?: boolean;
}

const FORMAT_COLORS: Record<EbookFormat, string> = {
  epub: 'bg-green-500/20 text-green-400 border-green-500/30',
  pdf: 'bg-red-500/20 text-red-400 border-red-500/30',
  mobi: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  azw3: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  txt: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const FORMAT_LABELS: Record<EbookFormat, string> = {
  epub: 'EPUB',
  pdf: 'PDF',
  mobi: 'MOBI',
  azw3: 'AZW3',
  txt: 'TXT',
};

export function EbookCard({
  ebook,
  onRead,
  onDownload,
  onClick,
  isSelected = false,
  onSelectionChange,
  showSelection = false,
}: EbookCardProps) {
  const [imageError, setImageError] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const hasEpub = useMemo(
    () => ebook.files.some((f) => f.format === 'epub'),
    [ebook.files],
  );

  const primaryFormat = useMemo(() => {
    // Prefer EPUB for reading, then PDF
    const epub = ebook.files.find((f) => f.format === 'epub');
    if (epub) return 'epub' as EbookFormat;
    const pdf = ebook.files.find((f) => f.format === 'pdf');
    if (pdf) return 'pdf' as EbookFormat;
    return ebook.files[0]?.format || 'epub';
  }, [ebook.files]);

  const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  };

  const totalSize = useMemo(
    () => ebook.files.reduce((acc, f) => acc + f.fileSize, 0),
    [ebook.files],
  );

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

    // Default action: read if EPUB available, otherwise show options
    if (hasEpub) {
      onRead(ebook, 'epub');
    } else {
      onRead(ebook);
    }
  };

  const handleSelectionChange = (checked: boolean) => {
    onSelectionChange?.(ebook.id, checked);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        onRead(ebook, hasEpub ? 'epub' : undefined);
        break;
      case ' ':
        e.preventDefault();
        if (showSelection) {
          handleSelectionChange(!isSelected);
        } else {
          onRead(ebook, hasEpub ? 'epub' : undefined);
        }
        break;
      case 'd':
        e.preventDefault();
        onDownload(ebook, primaryFormat);
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
      aria-label={`Ebook: ${ebook.title} by ${ebook.author}. Available formats: ${ebook.files.map((f) => f.format.toUpperCase()).join(', ')}. Press Enter to read, D to download.`}
      data-testid={`ebook-card-${ebook.id}`}
    >
      {/* Selection Checkbox */}
      {showSelection && (
        <div className="absolute top-2 left-2 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={handleSelectionChange}
            onClick={(e) => e.stopPropagation()}
            className="bg-white/90 border-2 border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            data-testid={`checkbox-select-${ebook.id}`}
          />
        </div>
      )}

      {/* Book Cover */}
      <div
        className="relative aspect-[2/3] bg-gradient-to-br from-muted to-border"
        data-testid={`ebook-card-cover-${ebook.id}`}
      >
        {!imageError && ebook.coverImage ? (
          <img
            src={ebook.coverImage}
            alt={`Cover for ${ebook.title}`}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="h-16 w-16 text-muted-foreground" />
          </div>
        )}

        {/* Overlay on hover */}
        <div
          className={cn(
            'absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 transition-opacity duration-200',
            isHovering ? 'opacity-100' : 'opacity-0',
          )}
        >
          {hasEpub && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={(e) => {
                e.stopPropagation();
                onRead(ebook, 'epub');
              }}
              data-testid={`button-read-${ebook.id}`}
            >
              <BookOpen className="h-4 w-4 mr-1" />
              Read
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="bg-white/10 border-white/30 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              onDownload(ebook, primaryFormat);
            }}
            data-testid={`button-download-${ebook.id}`}
          >
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </div>

        {/* Progress indicator */}
        {ebook.progress && ebook.progress.percentage > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${ebook.progress.percentage}%` }}
            />
          </div>
        )}

        {/* Format badges */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {ebook.files.map((file) => (
            <Badge
              key={file.format}
              className={cn('text-xs border', FORMAT_COLORS[file.format])}
              title={`${FORMAT_LABELS[file.format]} - ${formatFileSize(file.fileSize)}`}
            >
              {FORMAT_LABELS[file.format]}
            </Badge>
          ))}
        </div>
      </div>

      <CardContent className="p-3 sm:p-4">
        {/* Title */}
        <h4
          className="font-medium text-foreground text-sm leading-tight mb-1 line-clamp-2"
          data-testid={`text-title-${ebook.id}`}
        >
          {ebook.title}
        </h4>

        {/* Author */}
        <p
          className="text-xs text-muted-foreground mb-2 flex items-center"
          data-testid={`text-author-${ebook.id}`}
        >
          <User className="h-3 w-3 mr-1" />
          {ebook.author}
        </p>

        {/* Series info */}
        {ebook.metadata.series && (
          <p className="text-xs text-muted-foreground mb-2 flex items-center">
            <BookMarked className="h-3 w-3 mr-1" />
            {ebook.metadata.series}
            {ebook.metadata.seriesIndex && ` #${ebook.metadata.seriesIndex}`}
          </p>
        )}

        {/* Metadata badges */}
        <div className="flex flex-wrap gap-1 mb-2">
          {ebook.metadata.subjects?.slice(0, 3).map((subject, index) => (
            <Badge
              key={`${subject}-${index}`}
              variant="secondary"
              className="text-xs"
            >
              {subject}
            </Badge>
          ))}
        </div>

        {/* Footer: Size and progress */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center" data-testid={`text-size-${ebook.id}`}>
            <FileText className="mr-1 h-3 w-3" />
            {formatFileSize(totalSize)}
          </span>
          {ebook.progress && ebook.progress.percentage > 0 && (
            <span className="flex items-center text-primary">
              <Percent className="mr-1 h-3 w-3" />
              {Math.round(ebook.progress.percentage)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
