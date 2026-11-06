import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Audiobook } from '@/types/media';

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export const SKIP_SECONDS = 30;

export function formatPlayerTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface Options {
  audiobook: Audiobook | null;
  open: boolean;
  onProgressUpdate?: (chapterIndex: number, position: number) => void;
  getAudioUrl?: (chapterPath: string) => string | null;
}

export function useAudiobookPlayer({ audiobook, open, onProgressUpdate, getAudioUrl }: Options) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showChapterList, setShowChapterList] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentChapter = useMemo(
    () => audiobook?.chapters[currentChapterIndex] || null,
    [audiobook?.chapters, currentChapterIndex],
  );

  const overallProgress = useMemo(() => {
    if (!audiobook) return 0;
    const done = audiobook.chapters.slice(0, currentChapterIndex).reduce((a, ch) => a + ch.duration, 0);
    return ((done + currentTime) / audiobook.totalDuration) * 100;
  }, [audiobook, currentChapterIndex, currentTime]);

  useEffect(() => {
    if (audiobook?.progress && open) setCurrentChapterIndex(audiobook.progress.chapterIndex);
  }, [audiobook?.progress, open]);

  useEffect(() => {
    if (!open || !currentChapter || !audioRef.current) return;
    const audio = audioRef.current;
    setIsLoading(true);
    setError(null);
    audio.src = getAudioUrl?.(currentChapter.path) || currentChapter.path;
    audio.load();
    return () => { audio.pause(); };
  }, [currentChapter, open, getAudioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => {
      setDuration(audio.duration);
      setIsLoading(false);
      if (audiobook?.progress && currentChapterIndex === audiobook.progress.chapterIndex && audiobook.progress.position > 0) {
        audio.currentTime = audiobook.progress.position;
      }
    };
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      if (audiobook && currentChapterIndex < audiobook.chapters.length - 1) setCurrentChapterIndex((p) => p + 1);
      else setIsPlaying(false);
    };
    const onError = () => { setError('Failed to load audio'); setIsLoading(false); };
    const onCanPlay = () => { if (isPlaying) audio.play().catch(() => {}); };
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('canplay', onCanPlay);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, [audiobook, currentChapterIndex, isPlaying]);

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = playbackSpeed; }, [playbackSpeed]);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume; }, [volume, isMuted]);

  useEffect(() => {
    if (!open || !audiobook) return;
    const id = setInterval(() => { if (currentTime > 0) onProgressUpdate?.(currentChapterIndex, currentTime); }, 10000);
    return () => clearInterval(id);
  }, [open, audiobook, currentChapterIndex, currentTime, onProgressUpdate]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else { audio.play().catch((e) => console.error('Playback failed:', e)); setIsPlaying(true); }
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = Math.max(0, Math.min(time, duration));
  }, [duration]);

  const skip = useCallback((s: number) => {
    if (audioRef.current) seekTo(audioRef.current.currentTime + s);
  }, [seekTo]);

  const goToChapter = useCallback((index: number) => {
    if (audiobook && index >= 0 && index < audiobook.chapters.length) {
      setCurrentChapterIndex(index);
      setCurrentTime(0);
      setShowChapterList(false);
    }
  }, [audiobook]);

  const cyclePlaybackSpeed = () => {
    const i = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    setPlaybackSpeed(PLAYBACK_SPEEDS[(i + 1) % PLAYBACK_SPEEDS.length]);
  };

  return {
    audioRef, isPlaying, setIsPlaying, currentChapterIndex, currentTime, duration,
    volume, setVolume, isMuted, setIsMuted, playbackSpeed, showChapterList,
    setShowChapterList, isLoading, error, currentChapter, overallProgress,
    togglePlayPause, seekTo, skip, goToChapter, cyclePlaybackSpeed,
  };
}
