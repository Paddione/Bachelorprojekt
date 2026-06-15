import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import React from 'react';
import { useVideoPlayer } from './useVideoPlayer';
import type { VideoPlayerProps, CaptureFrameFn, MediaviewerHandle, VideoSource } from './types';
import { defaultCaptureFrame } from './capture-frame';
import {
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  VolumeIcon,
  MuteIcon,
  FullscreenIcon,
  FullscreenExitIcon,
  PipIcon,
} from './icons';

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const VideoPlayer = forwardRef<
  MediaviewerHandle,
  VideoPlayerProps & { externalVideoRef?: React.RefObject<HTMLVideoElement | null> }
>(function VideoPlayer(
  {
    source,
    playlist: playlistProp,
    captureFrame,
    showControls = true,
    onPrev,
    onNext,
    onSelect,
    onEnded,
    onError: onErrorProp,
    onStateChange,
    externalVideoRef,
  },
  ref,
) {
  const playlist: VideoSource[] = source && playlistProp ? playlistProp : source ? [source] : [];
  const {
    videoRef,
    current,
    state,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    buffered,
    controls,
    videoHandlers,
  } = useVideoPlayer({
    playlist,
    initialVideoId: source?.id,
    onSelect,
    onEnded,
    onError: onErrorProp,
    videoRef: externalVideoRef,
  });

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTimeDisplay, setScrubTimeDisplay] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTime, setPreviewTime] = useState<number | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isScrubbingRef = useRef(false);
  const scrubTimeRef = useRef(0);
  const overlayTimer = useRef<number | null>(null);

  const captureFn: CaptureFrameFn = captureFrame || defaultCaptureFrame;

  const [showOverlay, setShowOverlay] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    } else {
      void el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const togglePip = useCallback(() => {
    const video = videoRef.current as HTMLVideoElement | null;
    if (!video) return;
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture?.().catch(() => {});
    } else if (typeof video.requestPictureInPicture === 'function') {
      void video.requestPictureInPicture().catch(() => {});
    }
  }, [videoRef]);

  useEffect(() => {
    setShowOverlay(true);
    if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
    overlayTimer.current = window.setTimeout(() => setShowOverlay(false), 3000);
    return () => {
      if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
    };
  }, [current?.id]);

  useEffect(() => {
    if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
    const h = () => {
      setShowOverlay(true);
      if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
      overlayTimer.current = window.setTimeout(() => setShowOverlay(false), 3000);
    };
    document.addEventListener('mousemove', h);
    return () => document.removeEventListener('mousemove', h);
  }, []);

  const requestPreview = useCallback(
    (tSec: number) => {
      const src = source?.url;
      if (!src) return;
      const whole = Math.max(0, Math.floor(tSec));
      setPreviewTime(whole);
      void captureFn(src, whole)
        .then((url) => {
          setPreviewUrl(url);
        })
        .catch(() => {});
    },
    [source?.url, captureFn],
  );

  useImperativeHandle(
    ref,
    () => ({
      playVideo: controls.playVideo,
      setPlaylist: controls.setPlaylist,
      play: controls.play,
      pause: controls.pause,
      seek: controls.seek,
      getState: () => ({
        current,
        state,
        currentTime,
      }),
    }),
    [controls, current, state, currentTime],
  );

  if (!source) {
    return null;
  }

  const formatTime = (t: number): string => {
    if (!Number.isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const effectiveTime = isScrubbing ? scrubTimeDisplay : currentTime;
  const effectiveDuration = duration > 0 ? duration : 0;
  const playedPct =
    effectiveDuration > 0 ? Math.min(100, (effectiveTime / effectiveDuration) * 100) : 0;
  const bufferedPct =
    effectiveDuration > 0 ? Math.min(100, (buffered / effectiveDuration) * 100) : 0;
  const volPct = (isMuted ? 0 : volume) * 100;
  const isPlaying = state === 'playing';

  return (
    <div className="mv-player" data-overlay={showOverlay ? 'shown' : 'hidden'} ref={rootRef}>
      <div className="mv-player__stage">
        <video
          key={current?.id}
          ref={videoRef as React.RefObject<HTMLVideoElement>}
          className="mv-player__video"
          src={current?.url}
          poster={source.poster}
          data-testid="video-player"
          preload="metadata"
          playsInline
          onTimeUpdate={videoHandlers.onTimeUpdate}
          onLoadedMetadata={videoHandlers.onLoadedMetadata}
          onProgress={videoHandlers.onProgress}
          onPlay={videoHandlers.onPlay}
          onPause={videoHandlers.onPause}
          onEnded={videoHandlers.onEnded}
          onError={videoHandlers.onError}
        />

        <span className="mv-player__title" data-testid="text-video-title">
          {source.title}
        </span>
      </div>

      {showControls && (
        <div className="mv-player__controls">
          <div
            className="mv-player__scrub"
            data-testid="progress-area"
            style={{
              ['--_played' as string]: `${playedPct}%`,
              ['--_buffered' as string]: `${bufferedPct}%`,
            }}
            onMouseMove={(e) => {
              if (!source) return;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
              const ratio = rect.width > 0 ? x / rect.width : 0;
              const d = effectiveDuration > 0 ? effectiveDuration : 0;
              const t = d * ratio;
              requestPreview(t);
            }}
            onMouseLeave={() => {
              setPreviewTime(null);
              setPreviewUrl(null);
            }}
            ref={previewContainerRef}
          >
            <div className="mv-player__scrub-track">
              <div className="mv-player__scrub-buffered" />
              <div className="mv-player__scrub-played" />
            </div>
            <div className="mv-player__scrub-thumb" />

            {previewTime !== null && (
              <div className="mv-player__preview" data-testid="thumbnail-preview">
                <div
                  className={
                    previewUrl
                      ? 'mv-player__preview-frame'
                      : 'mv-player__preview-frame mv-player__preview-frame--empty'
                  }
                >
                  {previewUrl && <img src={previewUrl} alt="preview" />}
                </div>
                <div className="mv-player__preview-time">{formatTime(previewTime)}</div>
              </div>
            )}

            <input
              type="range"
              min={0}
              max={effectiveDuration || 1}
              step={0.1}
              value={effectiveTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                isScrubbingRef.current = true;
                scrubTimeRef.current = val;
                setScrubTimeDisplay(val);
                setIsScrubbing(true);
              }}
              onMouseUp={() => {
                if (isScrubbingRef.current) {
                  controls.seek(scrubTimeRef.current);
                  isScrubbingRef.current = false;
                  setIsScrubbing(false);
                }
              }}
              onTouchEnd={() => {
                if (isScrubbingRef.current) {
                  controls.seek(scrubTimeRef.current);
                  isScrubbingRef.current = false;
                  setIsScrubbing(false);
                }
              }}
              className="mv-player__scrub-input"
              data-testid="slider-progress"
              aria-label="Seek"
            />
          </div>

          <div className="mv-player__row">
            <div className="mv-player__group">
              {onPrev && (
                <button
                  onClick={onPrev}
                  data-testid="button-skip-back"
                  className="mv-player__btn"
                  aria-label="Vorheriges Video"
                  title="Vorheriges"
                >
                  <PrevIcon />
                </button>
              )}
              <button
                onClick={controls.toggle}
                data-testid="button-play-pause"
                className="mv-player__btn mv-player__btn--primary"
                aria-label={isPlaying ? 'Pause' : 'Abspielen'}
                title={isPlaying ? 'Pause' : 'Abspielen'}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              {onNext && (
                <button
                  onClick={onNext}
                  data-testid="button-skip-forward"
                  className="mv-player__btn"
                  aria-label="Nächstes Video"
                  title="Nächstes"
                >
                  <NextIcon />
                </button>
              )}

              <span className="mv-player__time" data-testid="text-time">
                <b>{formatTime(effectiveTime)}</b> / {formatTime(effectiveDuration)}
              </span>
            </div>

            <div className="mv-player__group">
              <button
                onClick={controls.toggleMute}
                data-testid="button-mute"
                className={isMuted ? 'mv-player__btn mv-player__btn--active' : 'mv-player__btn'}
                aria-label={isMuted ? 'Ton an' : 'Stummschalten'}
                title={isMuted ? 'Ton an' : 'Stumm'}
              >
                {isMuted ? <MuteIcon /> : <VolumeIcon />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => controls.setVolume(parseFloat(e.target.value))}
                className="mv-player__volume"
                style={{ ['--_vol' as string]: `${volPct}%` }}
                data-testid="slider-volume"
                aria-label="Lautstärke"
              />

              <select
                value={playbackRate}
                onChange={(e) => controls.setRate(parseFloat(e.target.value))}
                className="mv-player__speed"
                aria-label="Wiedergabegeschwindigkeit"
              >
                {SPEED_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>

              <button
                onClick={togglePip}
                data-testid="button-pip"
                className="mv-player__btn"
                aria-label="Bild im Bild"
                title="Bild im Bild"
              >
                <PipIcon />
              </button>
              <button
                onClick={toggleFullscreen}
                data-testid="button-fullscreen"
                className={
                  isFullscreen ? 'mv-player__btn mv-player__btn--active' : 'mv-player__btn'
                }
                aria-label={isFullscreen ? 'Vollbild verlassen' : 'Vollbild'}
                title="Vollbild"
              >
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
