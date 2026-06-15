import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Ebook, EbookFormat } from '@/types/media';
import { Download, BookOpen, FileText, User, BookMarked, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EbookActionsModalProps {
  ebook: Ebook | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRead: (ebook: Ebook, format: EbookFormat) => void;
  onDownload: (ebook: Ebook, format: EbookFormat) => void;
}

const FORMAT_INFO: Record<
  EbookFormat,
  { label: string; description: string; color: string; canRead: boolean }
> = {
  epub: {
    label: 'EPUB',
    description: 'Best for in-browser reading with reflowable text',
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    canRead: true,
  },
  pdf: {
    label: 'PDF',
    description: 'Fixed layout, good for printed materials',
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    canRead: false, // PDF viewer could be added later
  },
  mobi: {
    label: 'MOBI',
    description: 'Kindle format, download to read on device',
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    canRead: false,
  },
  azw3: {
    label: 'AZW3',
    description: 'Kindle format with enhanced features',
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    canRead: false,
  },
  txt: {
    label: 'TXT',
    description: 'Plain text, no formatting',
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    canRead: false,
  },
};

export function EbookActionsModal({
  ebook,
  open,
  onOpenChange,
  onRead,
  onDownload,
}: EbookActionsModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<EbookFormat | null>(null);

  if (!ebook) return null;

  const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  };

  const handleFormatSelect = (format: EbookFormat) => {
    setSelectedFormat(format);
  };

  const handleRead = () => {
    if (selectedFormat && FORMAT_INFO[selectedFormat].canRead) {
      onRead(ebook, selectedFormat);
      onOpenChange(false);
    }
  };

  const handleDownload = () => {
    if (selectedFormat) {
      onDownload(ebook, selectedFormat);
    }
  };

  const canReadSelected = selectedFormat && FORMAT_INFO[selectedFormat].canRead;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {ebook.title}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {ebook.author}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Book metadata */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {ebook.metadata.series && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <BookMarked className="h-4 w-4" />
                <span>
                  {ebook.metadata.series}
                  {ebook.metadata.seriesIndex && ` #${ebook.metadata.seriesIndex}`}
                </span>
              </div>
            )}
            {ebook.metadata.publishDate && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{new Date(ebook.metadata.publishDate).getFullYear()}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {ebook.metadata.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {ebook.metadata.description}
            </p>
          )}

          {/* Subjects */}
          {ebook.metadata.subjects && ebook.metadata.subjects.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {ebook.metadata.subjects.map((subject, index) => (
                <Badge key={`${subject}-${index}`} variant="secondary" className="text-xs">
                  {subject}
                </Badge>
              ))}
            </div>
          )}

          {/* Format selection */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Available Formats</h4>
            <div className="grid gap-2">
              {ebook.files.map((file) => {
                const info = FORMAT_INFO[file.format];
                const isSelected = selectedFormat === file.format;

                return (
                  <button
                    key={file.format}
                    onClick={() => handleFormatSelect(file.format)}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border transition-all text-left',
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Badge className={cn('text-xs border', info.color)}>{info.label}</Badge>
                      <div>
                        <p className="text-sm font-medium">{info.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.fileSize)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {info.canRead && (
                        <>
                          <BookOpen className="h-4 w-4 text-green-500" />
                          <span className="sr-only">Can read in browser</span>
                        </>
                      )}
                      <>
                        <Download className="h-4 w-4 text-muted-foreground" />
                        <span className="sr-only">Can download</span>
                      </>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={!selectedFormat}
            className="gap-1"
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
          {canReadSelected && (
            <Button onClick={handleRead} className="gap-1">
              <BookOpen className="h-4 w-4" />
              Read Now
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
