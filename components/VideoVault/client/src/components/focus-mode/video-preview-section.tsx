import { useRef, useState, useEffect, useMemo } from 'react';
import { Video } from '@/types/video';
import { Clock, FileVideo, Monitor, Film } from 'lucide-react';
import { getVideoSrc, getThumbnailSrc } from '@/lib/video-urls';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';

interface VideoPreviewSectionProps {
  video: Video;
}

export function VideoPreviewSection({ video }: VideoPreviewSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const sourceUrl = useMemo(() => getVideoSrc(video), [video.id, video.path]);
  const thumbnailUrl = useMemo(() => getThumbnailSrc(video), [video.path, video.filename, video.thumbnail?.dataUrl]);
  const hasSource = Boolean(sourceUrl);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleTimeUpdate = () => setCurrentTime(videoEl.currentTime);
    const handleDurationChange = () =>
      setDuration(Number.isFinite(videoEl.duration) ? videoEl.duration : 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    videoEl.addEventListener('timeupdate', handleTimeUpdate);
    videoEl.addEventListener('durationchange', handleDurationChange);
    videoEl.addEventListener('loadedmetadata', handleDurationChange);
    videoEl.addEventListener('play', handlePlay);
    videoEl.addEventListener('pause', handlePause);

    return () => {
      videoEl.removeEventListener('timeupdate', handleTimeUpdate);
      videoEl.removeEventListener('durationchange', handleDurationChange);
      videoEl.removeEventListener('loadedmetadata', handleDurationChange);
      videoEl.removeEventListener('play', handlePlay);
      videoEl.removeEventListener('pause', handlePause);
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        void videoRef.current.play();
      }
    }
  };

  const handleSeek = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const toggleMute = () => setIsMuted((prev) => !prev);

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0]);
    setIsMuted(false);
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void videoRef.current.requestFullscreen();
      }
    }
  };

  const formatTime = (time: number): string => {
    if (!Number.isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  };

  const formatResolution = (width: number, height: number): string => {
    if (!width || !height) return '-';
    if (height >= 2160) return '4K';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    return `${width}x${height}`;
  };

  const effectiveDuration = duration > 0 ? duration : video.metadata?.duration || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Video player */}
      <div className="relative bg-black flex-1 min-h-[200px] md:min-h-[300px]">
        {hasSource ? (
          <video
            ref={videoRef}
            src={sourceUrl}
            poster={thumbnailUrl}
            className="w-full h-full object-contain"
            playsInline
            onClick={togglePlayPause}
            onDoubleClick={toggleFullscreen}
            data-testid="video-player"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-white">
            <FileVideo className="h-12 w-12 mb-2 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Video source unavailable</span>
          </div>
        )}

        {/* Play/pause overlay */}
        {hasSource && !isPlaying && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
            onClick={togglePlayPause}
          >
            <div className="p-4 bg-white/20 rounded-full backdrop-blur-sm">
              <Play className="h-8 w-8 text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Video controls */}
      {hasSource && (
        <div className="bg-black/90 px-4 py-2 space-y-2">
          {/* Progress bar */}
          <Slider
            value={[currentTime]}
            max={effectiveDuration > 0 ? effectiveDuration : 1}
            step={0.1}
            onValueChange={handleSeek}
            className="w-full"
            disabled={effectiveDuration <= 0}
            data-testid="slider-progress"
          />

          {/* Controls row */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePlayPause}
                className="text-white hover:bg-white/20"
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>

              <span className="text-xs">
                {formatTime(currentTime)} / {formatTime(effectiveDuration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMute}
                className="text-white hover:bg-white/20"
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
                step={0.05}
                onValueChange={handleVolumeChange}
                className="w-20"
              />

              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFullscreen}
                className="text-white hover:bg-white/20"
              >
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="p-4 border-t bg-background grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{formatDuration(video.metadata?.duration || 0)}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileVideo className="h-4 w-4" />
          <span>{formatFileSize(video.size)}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Monitor className="h-4 w-4" />
          <span>{formatResolution(video.metadata?.width || 0, video.metadata?.height || 0)}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Film className="h-4 w-4" />
          <span>{video.metadata?.codec || '-'}</span>
        </div>
      </div>
    </div>
  );
}
