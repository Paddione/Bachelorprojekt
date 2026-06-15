import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Film,
  Folder,
  HardDrive,
  ArrowLeft,
  ChevronRight,
  Loader2,
  Play,
  Library as LibraryIcon,
} from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { VideoPlayerModal } from '@/components/video/video-player-modal';
import { Video } from '@/types/video';
import { ApiClient } from '@/services/api-client';

interface BrowseEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  servePath?: string;
  isVideo?: boolean;
}

interface BrowseResponse {
  path: string;
  entries: BrowseEntry[];
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function BrowsePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerVideo, setPlayerVideo] = useState<Video | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [processingFile, setProcessingFile] = useState<string | null>(null);

  const fetchDirectory = async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
      const res = await fetch(`/api/browse${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as BrowseResponse;
      setEntries(data.entries);
      setCurrentPath(data.path);
    } catch (err: any) {
      setError(err.message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDirectory(currentPath);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateTo = (folderName: string) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    setCurrentPath(newPath);
    void fetchDirectory(newPath);
  };

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const newPath = parts.join('/');
    setCurrentPath(newPath);
    void fetchDirectory(newPath);
  };

  const navigateToBreadcrumb = (index: number) => {
    const parts = currentPath.split('/').filter(Boolean);
    const newPath = parts.slice(0, index + 1).join('/');
    setCurrentPath(newPath);
    void fetchDirectory(newPath);
  };

  const playVideo = (entry: BrowseEntry) => {
    if (!entry.servePath) return;
    // Construct a minimal Video object for the player modal
    const video: Video = {
      id: entry.servePath,
      filename: entry.name,
      displayName: entry.name.replace(/\.[^.]+$/, ''),
      path: entry.servePath,
      size: entry.size || 0,
      lastModified: entry.modified || new Date().toISOString(),
      categories: { age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] },
      customCategories: {},
      metadata: { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' },
    };
    setPlayerVideo(video);
    setIsPlayerOpen(true);
  };

  const handleImportToLibrary = async (entry: BrowseEntry) => {
    if (!entry.servePath) return;
    setProcessingFile(entry.name);
    try {
      // Build the absolute path from the current browse path
      const filePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      await ApiClient.post('/api/processing/hdd-ext/process', { filePath });
      toast({
        title: t('browse.processingQueued'),
        description: t('browse.processingQueuedDesc', { name: entry.name }),
      });
    } catch (err: any) {
      toast({
        title: t('browse.importFailed'),
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setProcessingFile(null);
    }
  };

  const pathParts = currentPath.split('/').filter(Boolean);
  const videoEntries = entries.filter((e) => e.type === 'file' && e.isVideo);
  const currentVideoIndex = playerVideo ? videoEntries.findIndex((e) => e.servePath === playerVideo.path) : -1;

  const handlePrev = () => {
    if (currentVideoIndex > 0) {
      playVideo(videoEntries[currentVideoIndex - 1]);
    }
  };

  const handleNext = () => {
    if (currentVideoIndex < videoEntries.length - 1) {
      playVideo(videoEntries[currentVideoIndex + 1]);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="videovault-header sticky top-0 z-100">
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="min-h-[40px]">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.back')}
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <HardDrive className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">{t('browse.title')}</h1>
            </div>
          </div>
        </div>

        {/* Breadcrumb */}
        <nav className="mt-3 flex items-center gap-1 text-sm flex-wrap" aria-label="Breadcrumb">
          <button
            onClick={() => { setCurrentPath(''); void fetchDirectory(''); }}
            className="text-primary hover:underline font-medium"
          >
            {t('browse.root')}
          </button>
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className={i === pathParts.length - 1
                  ? 'text-foreground font-medium'
                  : 'text-primary hover:underline'
                }
              >
                {part}
              </button>
            </span>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="p-4 max-w-7xl mx-auto">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => void fetchDirectory(currentPath)}>{t('common.retry')}</Button>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Folder className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p>{t('browse.directoryEmpty')}</p>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <>
            {/* Stats bar */}
            <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
              <span>{entries.filter((e) => e.type === 'directory').length} {t('browse.folders')}</span>
              <span>{videoEntries.length} {t('browse.videos')}</span>
              <span>{entries.filter((e) => e.type === 'file' && !e.isVideo).length} {t('browse.otherFiles')}</span>
            </div>

            {/* Back button when in subdirectory */}
            {currentPath && (
              <button
                onClick={navigateUp}
                className="flex items-center gap-2 p-3 mb-2 w-full rounded-lg hover:bg-muted/50 text-left text-muted-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>..</span>
              </button>
            )}

            {/* File/folder grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {entries.map((entry) => (
                <Card
                  key={entry.name}
                  className={`p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                    entry.type === 'directory' ? 'border-primary/20' : ''
                  }`}
                  onClick={() => {
                    if (entry.type === 'directory') {
                      navigateTo(entry.name);
                    } else if (entry.isVideo) {
                      playVideo(entry);
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {entry.type === 'directory' ? (
                        <Folder className="h-8 w-8 text-primary/80" />
                      ) : entry.isVideo ? (
                        <Film className="h-8 w-8 text-cyan-400/80" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          {entry.name.split('.').pop()?.toUpperCase() || '?'}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" title={entry.name}>
                        {entry.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {entry.size != null && (
                          <span className="text-xs text-muted-foreground">
                            {formatSize(entry.size)}
                          </span>
                        )}
                        {entry.modified && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(entry.modified)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {entry.isVideo && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title={t('actions.play')}
                            onClick={() => playVideo(entry)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title={t('browse.importToLibrary')}
                            disabled={processingFile === entry.name}
                            onClick={() => void handleImportToLibrary(entry)}
                          >
                            {processingFile === entry.name ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <LibraryIcon className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Video Player Modal */}
      <VideoPlayerModal
        video={playerVideo}
        isOpen={isPlayerOpen}
        onClose={() => { setIsPlayerOpen(false); setPlayerVideo(null); }}
        onPrev={currentVideoIndex > 0 ? handlePrev : undefined}
        onNext={currentVideoIndex < videoEntries.length - 1 ? handleNext : undefined}
      />
    </div>
  );
}
