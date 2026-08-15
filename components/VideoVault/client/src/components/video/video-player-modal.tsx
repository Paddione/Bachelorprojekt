import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Video } from '@/types/video';
import {
  Tags,
  Scissors,
  X,
  Focus,
  PictureInPicture,
  Maximize,
  Minimize,
  Shuffle,
} from 'lucide-react';
import { VideoThumbnailService } from '@/services/video-thumbnail';
import { VideoTagsEditor } from './video-tags-editor';
import { VideoSplitter, SplitVideoFormValues } from './video-splitter';
import { Category, VideoCategories, CustomCategories } from '@/types/video';
import { SplitVideoResult } from '@/services/video-splitter';
import { getVideoSrc, getThumbnailSrc } from '@/lib/video-urls';
import type { VideoSource, CaptureFrameFn } from '@videovault-player';
import { VideoPlayer } from '@videovault-player';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

declare global {
  interface HTMLVideoElement {
    fastSeek?: (time: number) => void;
  }
}

interface VideoPlayerModalProps {
  video: Video | null;
  isOpen: boolean;
  onClose: () => void;
  onRescan?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  availableCategories?: Category[];
  onUpdateVideo?: (
    videoId: string,
    categories: Partial<{ categories: VideoCategories; customCategories: CustomCategories }>,
  ) => void;
  onRemoveCategory?: (videoId: string, categoryType: string, categoryValue: string) => void;
  onSplitVideo?: (payload: SplitVideoFormValues) => Promise<SplitVideoResult>;
  shuffleEnabled?: boolean;
  onToggleShuffle?: () => void;
  onFocusMode?: (video: Video) => void;
}

function toVideoSource(video: Video): VideoSource {
  return {
    id: video.id,
    url: getVideoSrc(video) || '',
    poster: getThumbnailSrc(video),
    title: video.displayName || video.filename,
    duration: video.metadata?.duration || 0,
  };
}

export function VideoPlayerModal({
  video,
  isOpen,
  onClose,
  onRescan,
  onPrev,
  onNext,
  availableCategories = [],
  onUpdateVideo,
  onRemoveCategory,
  onSplitVideo,
  shuffleEnabled,
  onToggleShuffle,
  onFocusMode,
}: VideoPlayerModalProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [sidePanel, setSidePanel] = useState<'none' | 'tags' | 'split'>('none');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const gestureMessageTimeout = useRef<number | null>(null);
  const [gestureMessage, setGestureMessage] = useState<string | null>(null);
  const touchActiveRef = useRef(false);
  const gestureStateRef = useRef<{
    lastTap: number;
    timeoutId: number | null;
    startX: number;
    startTime: number;
  }>({
    lastTap: 0,
    timeoutId: null,
    startX: 0,
    startTime: 0,
  });

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    return () => {
      if (gestureMessageTimeout.current) window.clearTimeout(gestureMessageTimeout.current);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = playerContainerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void container.requestFullscreen();
    }
  }, []);

  const skip = (seconds: number) => {
    if (videoRef.current) {
      const elementDuration =
        typeof videoRef.current.duration === 'number' && Number.isFinite(videoRef.current.duration)
          ? videoRef.current.duration : undefined;
      const clampDuration =
        typeof elementDuration === 'number' && elementDuration > 0 ? elementDuration : 0;
      videoRef.current.currentTime = Math.max(0, Math.min(clampDuration, videoRef.current.currentTime + seconds));
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        void videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
    }
  };

  const showGestureMessage = (message: string) => {
    if (gestureMessageTimeout.current) window.clearTimeout(gestureMessageTimeout.current);
    setGestureMessage(message);
    gestureMessageTimeout.current = window.setTimeout(() => setGestureMessage(null), 900);
  };

  const handleGesturePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    touchActiveRef.current = true;
    gestureStateRef.current.startX = e.clientX;
    gestureStateRef.current.startTime = Date.now();
  };

  const handleGesturePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    const now = Date.now();
    const deltaX = e.clientX - gestureStateRef.current.startX;
    const deltaTime = now - gestureStateRef.current.startTime;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    if (Math.abs(deltaX) > 90 && deltaTime < 500) {
      const direction = deltaX > 0 ? 1 : -1;
      skip(direction * 15);
      showGestureMessage(direction > 0 ? t('player.seekForward', { seconds: 15 }) : t('player.seekBackward', { seconds: 15 }));
      gestureStateRef.current.lastTap = 0;
    } else {
      const isDouble = now - gestureStateRef.current.lastTap < 280;
      const tapX = e.clientX - rect.left;
      if (gestureStateRef.current.timeoutId) {
        window.clearTimeout(gestureStateRef.current.timeoutId);
        gestureStateRef.current.timeoutId = null;
      }
      if (isDouble) {
        const direction = tapX < rect.width / 2 ? -10 : 10;
        skip(direction);
        showGestureMessage(direction > 0 ? t('player.seekForward', { seconds: 10 }) : t('player.seekBackward', { seconds: 10 }));
        gestureStateRef.current.lastTap = 0;
      } else {
        gestureStateRef.current.lastTap = now;
        gestureStateRef.current.timeoutId = window.setTimeout(() => {
          togglePlayPause();
          showGestureMessage(videoRef.current?.paused ? t('player.paused') : t('player.playing'));
          gestureStateRef.current.timeoutId = null;
        }, 220);
      }
    }
    window.setTimeout(() => { touchActiveRef.current = false; }, 0);
  };

  const hasSource = video ? Boolean(getVideoSrc(video)) : false;

  if (!video) return null;

  const source = toVideoSource(video);
  const effectiveDuration = videoRef.current?.duration && Number.isFinite(videoRef.current.duration)
    ? videoRef.current.duration : 0;

  const libraryCaptureFrame: CaptureFrameFn = useCallback(async (src: string, timeSec: number) => {
    return VideoThumbnailService.captureFrameAtTime(src, timeSec, 160);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`w-full mx-4 p-0 transition-all duration-300 ${sidePanel !== 'none' ? 'max-w-7xl' : 'max-w-5xl'}`}
      >
        <DialogHeader className="p-4 border-b">
          <DialogTitle data-testid="text-video-title">{video.displayName}</DialogTitle>
          <DialogDescription className="sr-only">{t('player.playerDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col md:flex-row h-[80vh] md:h-[calc(90vh-5rem)] overflow-hidden">
          {/* Player container — fullscreen target */}
          <div ref={playerContainerRef} className="flex-1 flex flex-col min-w-0 bg-black relative">
            <div
              className="relative bg-black touch-pan-y flex-1"
              tabIndex={0}
              data-testid="player-surface"
              onPointerDown={handleGesturePointerDown}
              onPointerUp={handleGesturePointerUp}
              onKeyDown={(e) => {
                if (e.key === ' ') { e.preventDefault(); togglePlayPause(); }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); skip(e.shiftKey ? -30 : -5); }
                else if (e.key === 'ArrowRight') { e.preventDefault(); skip(e.shiftKey ? 30 : 5); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); if (videoRef.current) { videoRef.current.volume = Math.min(1, (videoRef.current.volume || 0) + 0.1); videoRef.current.muted = false; } }
                else if (e.key === 'ArrowDown') { e.preventDefault(); if (videoRef.current) { const nv = Math.max(0, (videoRef.current.volume || 0) - 0.1); videoRef.current.volume = nv; if (nv === 0) videoRef.current.muted = true; } }
                else if (e.key.toLowerCase() === 'm') { e.preventDefault(); toggleMute(); }
                else if (e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFullscreen(); }
                else if (e.key.toLowerCase() === 'j') { e.preventDefault(); onPrev?.(); }
                else if (e.key.toLowerCase() === 'k') { e.preventDefault(); onNext?.(); }
                else if (e.key === '>' || e.key === '.') {
                  e.preventDefault();
                  if (videoRef.current) {
                    const idx = SPEED_OPTIONS.indexOf(videoRef.current.playbackRate);
                    if (idx < SPEED_OPTIONS.length - 1) {
                      videoRef.current.playbackRate = SPEED_OPTIONS[idx + 1];
                    }
                  }
                }
                else if (e.key === '<' || e.key === ',') {
                  e.preventDefault();
                  if (videoRef.current) {
                    const idx = SPEED_OPTIONS.indexOf(videoRef.current.playbackRate);
                    if (idx > 0) {
                      videoRef.current.playbackRate = SPEED_OPTIONS[idx - 1];
                    }
                  }
                }
                else if (['0','1','2','3','4','5','6','7','8','9'].includes(e.key)) {
                  e.preventDefault();
                  const percent = parseInt(e.key) / 10;
                  if (videoRef.current && effectiveDuration > 0) {
                    const seekTime = effectiveDuration * percent;
                    videoRef.current.currentTime = seekTime;
                  }
                }
              }}
            >
              {hasSource ? (
                <VideoPlayer
                  source={source}
                  captureFrame={libraryCaptureFrame}
                  onPrev={onPrev}
                  onNext={onNext}
                  onEnded={() => onNext?.()}
                  externalVideoRef={videoRef}
                />
              ) : (
                <div className="w-full h-full bg-black flex flex-col items-center justify-center text-white space-y-3 p-4">
                  <span>{t('player.videoUnavailable')}</span>
                  <span className="text-xs opacity-80">{t('player.path', { path: video.path })}</span>
                  {onRescan && (
                    <Button variant="secondary" size="sm" onClick={onRescan} data-testid="button-rescan-root">
                      {t('player.rescanRoot')}
                    </Button>
                  )}
                </div>
              )}

              {gestureMessage && (
                <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1 rounded-full" aria-live="polite">
                  {gestureMessage}
                </div>
              )}
            </div>

            {/* Toolbar — modal-specific buttons (non-playback) */}
            <div className="bg-gradient-to-t from-black to-transparent p-4 z-10 w-full">
              <div className="flex items-center justify-between text-white space-x-2">
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" onClick={() => skip(600)} className="text-white hover:bg-white hover:bg-opacity-20 hidden sm:inline-flex" data-testid="button-forward-10m" disabled={!hasSource} aria-label={t('player.forward10min')}>
                    {t('player.forward10m')}
                  </Button>
                </div>

                <div className="flex items-center space-x-2">
                {onSplitVideo && (
                  <Button variant={sidePanel === 'split' ? 'secondary' : 'ghost'} size="sm" onClick={() => setSidePanel(sidePanel === 'split' ? 'none' : 'split')} className={`text-white hover:bg-white hover:bg-opacity-20 hidden sm:inline-flex ${sidePanel === 'split' ? 'bg-white/20' : ''}`} data-testid="button-split-inline" aria-label={t('player.splitVideo')}>
                    <Scissors className="h-4 w-4" />
                  </Button>
                )}

                <Button variant={sidePanel === 'tags' ? 'secondary' : 'ghost'} size="sm" onClick={() => setSidePanel(sidePanel === 'tags' ? 'none' : 'tags')} className={`text-white hover:bg-white hover:bg-opacity-20 ${sidePanel === 'tags' ? 'bg-white/20' : ''}`} data-testid="button-edit-tags-inline" disabled={!onUpdateVideo} aria-label={t('player.editTags')}>
                  <Tags className="h-4 w-4" />
                </Button>

                {onFocusMode && video && (
                  <Button variant="ghost" size="sm" onClick={() => { onFocusMode(video); onClose(); }} className="text-white hover:bg-white hover:bg-opacity-20 hidden sm:inline-flex" data-testid="button-focus-mode" aria-label={t('player.openFocusMode')} title={t('player.openFocusMode')}>
                    <Focus className="h-4 w-4" />
                  </Button>
                )}

                <Button variant="ghost" size="sm" onClick={onToggleShuffle} className="text-white hover:bg-white hover:bg-opacity-20 hidden sm:inline-flex" data-testid="button-shuffle" aria-pressed={!!shuffleEnabled} aria-label={t('player.shuffle')}>
                  <Shuffle className={`h-4 w-4 ${shuffleEnabled ? 'text-emerald-400' : ''}`} />
                </Button>

                <Button variant="ghost" size="sm" onClick={toggleFullscreen} className="text-white hover:bg-white hover:bg-opacity-20" data-testid="button-fullscreen" disabled={!hasSource}>
                  {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Side Panel */}
          <div className={`border-l bg-background transition-all duration-300 ease-in-out overflow-hidden flex flex-col ${sidePanel !== 'none' ? 'w-full md:w-96' : 'w-0'}`}>
            <div className="h-full overflow-y-auto p-4 min-w-[20rem]">
              {sidePanel === 'tags' && onUpdateVideo && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg">{t('player.editTags')}</h3>
                    <Button variant="ghost" size="icon" onClick={() => setSidePanel('none')}>
                      <X className="h-4 w-4" /><span className="sr-only">{t('player.closePanel')}</span>
                    </Button>
                  </div>
                  <VideoTagsEditor video={video} availableCategories={availableCategories} onSave={onUpdateVideo} onRemoveCategory={onRemoveCategory || (() => {})} />
                </>
              )}
              {sidePanel === 'split' && onSplitVideo && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg">{t('player.splitVideo')}</h3>
                    <Button variant="ghost" size="icon" onClick={() => setSidePanel('none')}>
                      <X className="h-4 w-4" /><span className="sr-only">{t('player.closePanel')}</span>
                    </Button>
                  </div>
                  <VideoSplitter video={video} availableCategories={availableCategories} onSubmit={onSplitVideo} onCancel={() => setSidePanel('none')} currentTime={videoRef.current?.currentTime || 0} />
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
