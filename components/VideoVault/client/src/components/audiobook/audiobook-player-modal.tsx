import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { Audiobook, AudiobookChapter } from '@/types/media';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  List,
  X,
  Rewind,
  FastForward,
  Gauge,
  User,
  Mic,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudiobookPlayerModalProps {
  audiobook: Audiobook | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProgressUpdate?: (chapterIndex: number, position: number) => void;
  getAudioUrl?: (chapterPath: string) => string | null;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SKIP_SECONDS = 30;

export function AudiobookPlayerModal({
  audiobook,
  open,
  onOpenChange,
  onProgressUpdate,
  getAudioUrl,
}: AudiobookPlayerModalProps) {
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

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    if (!audiobook) return 0;
    const completedDuration = audiobook.chapters
      .slice(0, currentChapterIndex)
      .reduce((acc, ch) => acc + ch.duration, 0);
    return ((completedDuration + currentTime) / audiobook.totalDuration) * 100;
  }, [audiobook, currentChapterIndex, currentTime]);

  // Initialize from saved progress
  useEffect(() => {
    if (audiobook?.progress && open) {
      setCurrentChapterIndex(audiobook.progress.chapterIndex);
      // Position will be set after audio loads
    }
  }, [audiobook?.progress, open]);

  // Load chapter audio
  useEffect(() => {
    if (!open || !currentChapter || !audioRef.current) return;

    const audio = audioRef.current;
    setIsLoading(true);
    setError(null);

    // Get audio URL - either from registry or construct from path
    const audioUrl = getAudioUrl?.(currentChapter.path) || currentChapter.path;

    audio.src = audioUrl;
    audio.load();

    return () => {
      audio.pause();
    };
  }, [currentChapter, open, getAudioUrl]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);

      // Restore position if this is the saved chapter
      if (
        audiobook?.progress &&
        currentChapterIndex === audiobook.progress.chapterIndex &&
        audiobook.progress.position > 0
      ) {
        audio.currentTime = audiobook.progress.position;
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      // Auto-advance to next chapter
      if (audiobook && currentChapterIndex < audiobook.chapters.length - 1) {
        setCurrentChapterIndex((prev) => prev + 1);
      } else {
        setIsPlaying(false);
      }
    };

    const handleError = () => {
      setError('Failed to load audio');
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      if (isPlaying) {
        audio.play().catch(() => {});
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [audiobook, currentChapterIndex, isPlaying]);

  // Update playback speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Save progress periodically
  useEffect(() => {
    if (!open || !audiobook) return;

    const interval = setInterval(() => {
      if (currentTime > 0) {
        onProgressUpdate?.(currentChapterIndex, currentTime);
      }
    }, 10000); // Save every 10 seconds

    return () => clearInterval(interval);
  }, [open, audiobook, currentChapterIndex, currentTime, onProgressUpdate]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch((err) => {
        console.error('Playback failed:', err);
      });
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(time, duration));
    }
  }, [duration]);

  const skip = useCallback((seconds: number) => {
    if (audioRef.current) {
      seekTo(audioRef.current.currentTime + seconds);
    }
  }, [seekTo]);

  const goToChapter = useCallback((index: number) => {
    if (audiobook && index >= 0 && index < audiobook.chapters.length) {
      setCurrentChapterIndex(index);
      setCurrentTime(0);
      setShowChapterList(false);
    }
  }, [audiobook]);

  const handleClose = () => {
    // Save progress before closing
    if (currentTime > 0) {
      onProgressUpdate?.(currentChapterIndex, currentTime);
    }
    setIsPlaying(false);
    onOpenChange(false);
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const cyclePlaybackSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    setPlaybackSpeed(PLAYBACK_SPEEDS[nextIndex]);
  };

  if (!audiobook) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[500px] p-0">
        {/* Hidden audio element */}
        <audio ref={audioRef} preload="metadata" />

        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b">
          <div className="flex items-start gap-3">
            {/* Cover thumbnail */}
            <div className="w-16 h-16 rounded bg-gradient-to-br from-purple-900/50 to-indigo-900/50 flex-shrink-0 overflow-hidden">
              {audiobook.coverImage ? (
                <img
                  src={audiobook.coverImage}
                  alt={audiobook.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Volume2 className="h-8 w-8 text-purple-300" />
                </div>
              )}
            </div>

            {/* Title and metadata */}
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-medium truncate">
                {audiobook.title}
              </DialogTitle>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                {audiobook.author}
              </p>
              {audiobook.metadata.narrator && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mic className="h-3 w-3" />
                  {audiobook.metadata.narrator}
                </p>
              )}
            </div>

            {/* Chapter list toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowChapterList(!showChapterList)}
              title="Chapter list"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Chapter list panel */}
        {showChapterList && (
          <div className="max-h-48 overflow-auto border-b bg-muted/50">
            {audiobook.chapters.map((chapter, index) => (
              <button
                key={chapter.index}
                onClick={() => goToChapter(index)}
                className={cn(
                  'w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors flex justify-between items-center',
                  index === currentChapterIndex && 'bg-primary/10 text-primary',
                )}
              >
                <span className="truncate">{chapter.title}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {formatTime(chapter.duration)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Main player content */}
        <div className="p-4 space-y-4">
          {/* Current chapter info */}
          <div className="text-center">
            <p className="text-sm font-medium">{currentChapter?.title || 'Loading...'}</p>
            <p className="text-xs text-muted-foreground">
              Chapter {currentChapterIndex + 1} of {audiobook.chapters.length}
            </p>
          </div>

          {/* Progress slider */}
          <div className="space-y-1">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={1}
              onValueChange={([value]) => seekTo(value)}
              className="cursor-pointer"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Main controls */}
          <div className="flex items-center justify-center gap-2">
            {/* Previous chapter */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => goToChapter(currentChapterIndex - 1)}
              disabled={currentChapterIndex === 0}
              title="Previous chapter"
            >
              <SkipBack className="h-5 w-5" />
            </Button>

            {/* Rewind 30s */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skip(-SKIP_SECONDS)}
              title={`Rewind ${SKIP_SECONDS}s`}
            >
              <Rewind className="h-5 w-5" />
            </Button>

            {/* Play/Pause */}
            <Button
              size="lg"
              className="rounded-full h-14 w-14 bg-purple-600 hover:bg-purple-700"
              onClick={togglePlayPause}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
              ) : isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6 ml-1" />
              )}
            </Button>

            {/* Forward 30s */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skip(SKIP_SECONDS)}
              title={`Forward ${SKIP_SECONDS}s`}
            >
              <FastForward className="h-5 w-5" />
            </Button>

            {/* Next chapter */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => goToChapter(currentChapterIndex + 1)}
              disabled={currentChapterIndex >= audiobook.chapters.length - 1}
              title="Next chapter"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          {/* Secondary controls */}
          <div className="flex items-center justify-between">
            {/* Playback speed */}
            <Button
              variant="outline"
              size="sm"
              onClick={cyclePlaybackSpeed}
              className="text-xs gap-1"
              title="Playback speed"
            >
              <Gauge className="h-3 w-3" />
              {playbackSpeed}x
            </Button>

            {/* Volume controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMuted(!isMuted)}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.01}
                onValueChange={([value]) => {
                  setVolume(value);
                  setIsMuted(false);
                }}
                className="w-24"
              />
            </div>
          </div>

          {/* Overall progress */}
          <div className="pt-2 border-t">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Overall Progress</span>
              <span>{Math.round(overallProgress)}%</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="text-center text-sm text-red-500 py-2">
              {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
