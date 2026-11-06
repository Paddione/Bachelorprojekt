import { useCallback, useEffect, useState } from 'react';
import { Video } from '@/types/video';
import { ApiClient } from '@/services/api-client';
import { BrowseEntry, BrowseResponse, childPath, parentPath, breadcrumbPath, toPlayerVideo } from './browse-queries';

export interface BrowsePlayer {
  playerVideo: Video | null;
  isPlayerOpen: boolean;
  currentVideoIndex: number;
  videoEntries: BrowseEntry[];
}

export function useBrowse(notify: (kind: 'queued' | 'failed', name: string, msg?: string) => void) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerVideo, setPlayerVideo] = useState<Video | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [processingFile, setProcessingFile] = useState<string | null>(null);

  const fetchDirectory = useCallback(async (dirPath: string) => {
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchDirectory(''); }, [fetchDirectory]);

  const navigateTo = (name: string) => {
    const next = childPath(currentPath, name);
    setCurrentPath(next);
    void fetchDirectory(next);
  };

  const navigateUp = () => {
    const next = parentPath(currentPath);
    setCurrentPath(next);
    void fetchDirectory(next);
  };

  const navigateToBreadcrumb = (index: number) => {
    const next = breadcrumbPath(currentPath, index);
    setCurrentPath(next);
    void fetchDirectory(next);
  };

  const goRoot = () => { setCurrentPath(''); void fetchDirectory(''); };

  const playVideo = useCallback((entry: BrowseEntry) => {
    const video = toPlayerVideo(entry);
    if (!video) return;
    setPlayerVideo(video);
    setIsPlayerOpen(true);
  }, []);

  const closePlayer = useCallback(() => { setIsPlayerOpen(false); setPlayerVideo(null); }, []);

  const handleImportToLibrary = async (entry: BrowseEntry) => {
    if (!entry.servePath) return;
    setProcessingFile(entry.name);
    try {
      const filePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      await ApiClient.post('/api/processing/hdd-ext/process', { filePath });
      notify('queued', entry.name);
    } catch (err: unknown) {
      notify('failed', entry.name, err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingFile(null);
    }
  };

  const videoEntries = entries.filter((e) => e.type === 'file' && e.isVideo);
  const currentVideoIndex = playerVideo
    ? videoEntries.findIndex((e) => e.servePath === playerVideo.path) : -1;

  const step = (dir: 1 | -1) => {
    const next = currentVideoIndex + dir;
    if (next >= 0 && next < videoEntries.length) playVideo(videoEntries[next]);
  };

  return {
    currentPath, entries, loading, error, playerVideo, isPlayerOpen,
    processingFile, videoEntries, currentVideoIndex,
    fetchDirectory, navigateTo, navigateUp, navigateToBreadcrumb, goRoot,
    playVideo, closePlayer, handleImportToLibrary, step,
  };
}

export type UseBrowse = ReturnType<typeof useBrowse>;
