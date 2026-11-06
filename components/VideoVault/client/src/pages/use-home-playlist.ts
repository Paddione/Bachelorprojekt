import { useCallback, useEffect, useState } from 'react';
import { Video } from '@/types/video';
import { AppSettingsService } from '@/services/app-settings';
import { shuffleArray } from './home-queries';

export function parseShuffleFlag(raw: string | null): boolean | undefined {
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return undefined;
}

export function useHomePlaylist(filteredVideos: Video[], currentVideo: Video | null,
  setCurrentVideo: (v: Video | null) => void) {
  const [playlistIds, setPlaylistIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [shuffle, setShuffle] = useState<boolean>(false);

  useEffect(() => {
    void (async () => {
      const saved = await AppSettingsService.get<boolean>('vv.shuffle', parseShuffleFlag);
      if (typeof saved === 'boolean') setShuffle(saved);
    })();
  }, []);

  useEffect(() => {
    void (async () => { await AppSettingsService.set('vv.shuffle', shuffle); })();
  }, [shuffle]);

  useEffect(() => {
    const ids = filteredVideos.map((v) => v.id);
    if (!shuffle) {
      setPlaylistIds(ids);
      setCurrentIndex(currentVideo ? ids.indexOf(currentVideo.id) : -1);
      return;
    }
    const shuffled = shuffleArray(ids);
    const id = currentVideo?.id;
    if (id) {
      const idx = shuffled.indexOf(id);
      if (idx > 0) {
        setPlaylistIds([shuffled[idx], ...shuffled.slice(idx + 1), ...shuffled.slice(0, idx)]);
        setCurrentIndex(0);
        return;
      }
      setPlaylistIds(shuffled);
      setCurrentIndex(shuffled.indexOf(id));
    } else {
      setPlaylistIds(shuffled);
      setCurrentIndex(-1);
    }
  }, [filteredVideos, currentVideo, shuffle]);

  const stepTo = useCallback((nextIndex: number) => {
    const id = playlistIds[nextIndex];
    const vid = filteredVideos.find((v) => v.id === id);
    if (vid) {
      setCurrentVideo(vid);
      setCurrentIndex(nextIndex);
    }
  }, [playlistIds, filteredVideos, setCurrentVideo]);

  const goPrev = useCallback(() => {
    if (playlistIds.length === 0 || currentIndex < 0) return;
    stepTo((currentIndex - 1 + playlistIds.length) % playlistIds.length);
  }, [playlistIds.length, currentIndex, stepTo]);

  const goNext = useCallback(() => {
    if (playlistIds.length === 0 || currentIndex < 0) return;
    stepTo((currentIndex + 1) % playlistIds.length);
  }, [playlistIds.length, currentIndex, stepTo]);

  return { playlistIds, currentIndex, shuffle, toggleShuffle: () => setShuffle((p) => !p), goPrev, goNext };
}

export type HomePlaylist = ReturnType<typeof useHomePlaylist>;
