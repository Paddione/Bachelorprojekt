import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { Ebook } from '@/types/media';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Settings,
  BookmarkPlus,
  List,
  Sun,
  Moon,
  Type,
  Minus,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// epub.js types (will be loaded dynamically)
declare global {
  interface Window {
    ePub: any;
  }
}

interface EpubReaderProps {
  ebook: Ebook | null;
  epubPath: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProgressUpdate?: (location: string, percentage: number) => void;
}

interface TocItem {
  label: string;
  href: string;
  subitems?: TocItem[];
}

export function EpubReader({
  ebook,
  epubPath,
  open,
  onOpenChange,
  onProgressUpdate,
}: EpubReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Reader settings
  const [fontSize, setFontSize] = useState(100);
  const [theme, setTheme] = useState<'light' | 'sepia' | 'dark'>('light');

  // Load epub.js library
  useEffect(() => {
    if (!window.ePub) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';
      script.async = true;
      document.head.appendChild(script);
      return () => {
        document.head.removeChild(script);
      };
    }
  }, []);

  // Initialize book when path changes
  useEffect(() => {
    if (!open || !epubPath || !viewerRef.current || !window.ePub) {
      return;
    }

    const initBook = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Cleanup previous book
        if (renditionRef.current) {
          renditionRef.current.destroy();
        }
        if (bookRef.current) {
          bookRef.current.destroy();
        }

        // Create new book
        const book = window.ePub(epubPath);
        bookRef.current = book;

        // Wait for book to be ready
        await book.ready;

        // Get table of contents
        const navigation = await book.loaded.navigation;
        if (navigation?.toc) {
          setToc(navigation.toc);
        }

        // Create rendition
        const rendition = book.renderTo(viewerRef.current, {
          width: '100%',
          height: '100%',
          spread: 'none',
          flow: 'paginated',
        });
        renditionRef.current = rendition;

        // Apply initial theme
        applyTheme(rendition, theme);

        // Apply initial font size
        rendition.themes.fontSize(`${fontSize}%`);

        // Handle location changes
        rendition.on('locationChanged', (location: any) => {
          if (location && location.start) {
            const cfi = location.start.cfi;
            setCurrentLocation(cfi);

            // Calculate progress
            if (book.locations && book.locations.length()) {
              const pct = book.locations.percentageFromCfi(cfi);
              const percentage = Math.round(pct * 100);
              setProgress(percentage);
              onProgressUpdate?.(cfi, percentage);
            }
          }
        });

        // Handle key navigation
        rendition.on('keyup', (e: KeyboardEvent) => {
          if (e.key === 'ArrowLeft') {
            rendition.prev();
          } else if (e.key === 'ArrowRight') {
            rendition.next();
          }
        });

        // Generate locations for progress tracking
        await book.locations.generate(1024);

        // Display from saved location or start
        const startLocation = ebook?.progress?.location || undefined;
        await rendition.display(startLocation);

        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load EPUB:', err);
        setError(err instanceof Error ? err.message : 'Failed to load ebook');
        setIsLoading(false);
      }
    };

    initBook();

    return () => {
      if (renditionRef.current) {
        renditionRef.current.destroy();
        renditionRef.current = null;
      }
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
    };
  }, [open, epubPath, ebook?.progress?.location]);

  // Apply theme to rendition
  const applyTheme = useCallback((rendition: any, themeName: 'light' | 'sepia' | 'dark') => {
    if (!rendition) return;

    const themes: Record<string, { body: Record<string, string> }> = {
      light: {
        body: {
          background: '#ffffff',
          color: '#1a1a1a',
        },
      },
      sepia: {
        body: {
          background: '#f4ecd8',
          color: '#5b4636',
        },
      },
      dark: {
        body: {
          background: '#1a1a1a',
          color: '#e0e0e0',
        },
      },
    };

    rendition.themes.register(themeName, themes[themeName]);
    rendition.themes.select(themeName);
  }, []);

  // Update theme
  useEffect(() => {
    if (renditionRef.current) {
      applyTheme(renditionRef.current, theme);
    }
  }, [theme, applyTheme]);

  // Update font size
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize]);

  const handlePrev = () => {
    renditionRef.current?.prev();
  };

  const handleNext = () => {
    renditionRef.current?.next();
  };

  const handleTocClick = (href: string) => {
    renditionRef.current?.display(href);
    setShowToc(false);
  };

  const handleClose = () => {
    // Save progress before closing
    if (currentLocation && progress > 0) {
      onProgressUpdate?.(currentLocation, progress);
    }
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      handleNext();
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  const themeBackgrounds: Record<string, string> = {
    light: 'bg-white',
    sepia: 'bg-[#f4ecd8]',
    dark: 'bg-[#1a1a1a]',
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          'max-w-[95vw] w-[900px] h-[90vh] p-0 flex flex-col',
          themeBackgrounds[theme],
        )}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between px-4 py-2 border-b shrink-0">
          <DialogTitle className="text-sm font-medium truncate">
            {ebook?.title || 'Reading'}
          </DialogTitle>
          <div className="flex items-center gap-2">
            {/* Progress indicator */}
            <span className="text-xs text-muted-foreground">{progress}%</span>

            {/* TOC button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowToc(!showToc)}
              title="Table of Contents"
            >
              <List className="h-4 w-4" />
            </Button>

            {/* Settings button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(!showSettings)}
              title="Reading Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>

            {/* Close button */}
            <Button variant="ghost" size="icon" onClick={handleClose} title="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Main content area */}
        <div className="relative flex-1 overflow-hidden">
          {/* Table of Contents Sidebar */}
          {showToc && (
            <div className="absolute left-0 top-0 bottom-0 w-64 bg-background border-r z-10 overflow-auto">
              <div className="p-4">
                <h3 className="font-medium mb-2">Contents</h3>
                <nav className="space-y-1">
                  {toc.map((item, index) => (
                    <TocEntry key={index} item={item} onSelect={handleTocClick} />
                  ))}
                </nav>
              </div>
            </div>
          )}

          {/* Settings Panel */}
          {showSettings && (
            <div className="absolute right-0 top-0 w-64 bg-background border-l z-10 p-4 space-y-4">
              <h3 className="font-medium">Settings</h3>

              {/* Font size */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Font Size</label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setFontSize(Math.max(50, fontSize - 10))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="text-sm w-12 text-center">{fontSize}%</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setFontSize(Math.min(200, fontSize + 10))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Theme */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Theme</label>
                <div className="flex gap-2">
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('light')}
                    className="flex-1"
                  >
                    <Sun className="h-4 w-4 mr-1" />
                    Light
                  </Button>
                  <Button
                    variant={theme === 'sepia' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('sepia')}
                    className="flex-1"
                  >
                    <Type className="h-4 w-4 mr-1" />
                    Sepia
                  </Button>
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('dark')}
                    className="flex-1"
                  >
                    <Moon className="h-4 w-4 mr-1" />
                    Dark
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* EPUB Viewer */}
          <div className="h-full flex items-center">
            {/* Previous page button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-full rounded-none opacity-50 hover:opacity-100"
              onClick={handlePrev}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>

            {/* Book content */}
            <div
              ref={viewerRef}
              className="flex-1 h-full"
              style={{ minHeight: 0 }}
            />

            {/* Next page button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-full rounded-none opacity-50 hover:opacity-100"
              onClick={handleNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading ebook...</p>
              </div>
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="text-center text-red-500">
                <p className="font-medium">Failed to load ebook</p>
                <p className="text-sm">{error}</p>
                <Button variant="outline" className="mt-4" onClick={handleClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted shrink-0">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Table of Contents Entry Component
function TocEntry({
  item,
  onSelect,
  depth = 0,
}: {
  item: TocItem;
  onSelect: (href: string) => void;
  depth?: number;
}) {
  return (
    <div>
      <button
        onClick={() => onSelect(item.href)}
        className={cn(
          'w-full text-left text-sm py-1 px-2 rounded hover:bg-muted transition-colors',
          depth > 0 && 'ml-4',
        )}
      >
        {item.label}
      </button>
      {item.subitems?.map((subitem, index) => (
        <TocEntry key={index} item={subitem} onSelect={onSelect} depth={depth + 1} />
      ))}
    </div>
  );
}
