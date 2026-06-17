import { forwardRef, useImperativeHandle, useState, useCallback, useEffect, useRef } from 'react';
import { VideoPlayer } from '@videovault-player';
import { HelpVideoPicker } from './HelpVideoPicker';
import { MediaviewerState } from './MediaviewerState';
import { GrillingSessionView } from './components/GrillingSessionView';
import type {
  MediaviewerHandle,
  VideoSource,
  PlayerState,
} from '@videovault-player';
import type { GrillingSessionData } from './embed/bridge';

interface MediaviewerWidgetLocalProps {
  videos: VideoSource[];
  mode?: 'video' | 'grilling';
  grillingData?: GrillingSessionData | null;
  onSelect: (videoId: string) => void;
  onEnded?: (videoId: string) => void;
  onError?: (videoId: string, error: string) => void;
  onGrillingAnswer?: (questionId: string, answer: string) => void;
  onGrillingDismiss?: (questionId: string) => void;
  onGrillingComplete?: (answers: Record<string, string>) => void;
}

export const MediaviewerWidget = forwardRef<MediaviewerHandle, MediaviewerWidgetLocalProps>(
  function MediaviewerWidget({
    videos,
    mode = 'video',
    grillingData,
    onSelect,
    onEnded,
    onError,
    onGrillingAnswer,
    onGrillingDismiss,
    onGrillingComplete,
  }, ref) {
    const [current, setCurrent] = useState<VideoSource | null>(null);
    const [playerState, setPlayerState] = useState<PlayerState>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const playerRef = useRef<MediaviewerHandle>(null);

    useEffect(() => {
      if (current && !videos.some((v) => v.id === current.id)) {
        setCurrent(null);
      }
    }, [videos, current]);

    const handleSelect = useCallback(
      (videoId: string) => {
        const video = videos.find((v) => v.id === videoId) || null;
        setErrorMsg(null);
        setCurrent(video);
        onSelect(videoId);
      },
      [videos, onSelect],
    );

    const handleError = useCallback(
      (id: string, msg: string) => {
        setErrorMsg(msg || 'Unbekannter Fehler');
        onError?.(id, msg);
      },
      [onError],
    );

    const handleRetry = useCallback(() => {
      if (!current) return;
      setErrorMsg(null);
      const id = current.id;
      setCurrent(null);
      requestAnimationFrame(() => setCurrent(videos.find((v) => v.id === id) ?? null));
    }, [current, videos]);

    useImperativeHandle(
      ref,
      () => ({
        playVideo: (id: string) => {
          handleSelect(id);
        },
        setPlaylist: (_videos: VideoSource[], initialId?: string) => {
          if (initialId) {
            const v = _videos.find((x) => x.id === initialId);
            if (v) setCurrent(v);
          }
        },
        play: () => playerRef.current?.play(),
        pause: () => playerRef.current?.pause(),
        seek: (time: number) => playerRef.current?.seek(time),
        getState: () =>
          playerRef.current?.getState() ?? { current, state: playerState, currentTime: 0 },
      }),
      [current, playerState, handleSelect],
    );

    if (mode === 'grilling' && grillingData) {
      return (
        <div className="mv-root mv-widget" data-testid="mediaviewer-widget" data-mode="grilling">
          <GrillingSessionView
            data={grillingData}
            onAnswer={onGrillingAnswer}
            onDismiss={onGrillingDismiss}
            onComplete={onGrillingComplete}
          />
        </div>
      );
    }

    const isEmpty = videos.length === 0;
    const showLoading = !errorMsg && playerState === 'loading';

    return (
      <div className="mv-root mv-widget" data-testid="mediaviewer-widget" data-mode="video">
        <header className="mv-widget__header">
          <span className="mv-widget__brand">
            VideoVault
            <small>Mediaviewer</small>
          </span>
          {!isEmpty && (
            <span className="mv-widget__count">
              {videos.length} {videos.length === 1 ? 'Video' : 'Videos'}
            </span>
          )}
        </header>

        <div className="mv-widget__stage">
          {isEmpty ? (
            <MediaviewerState kind="empty" />
          ) : !current ? (
            <MediaviewerState kind="idle" />
          ) : (
            <>
              <VideoPlayer
                ref={playerRef}
                source={current}
                playlist={videos}
                onEnded={(id) => onEnded?.(id)}
                onError={handleError}
                onStateChange={setPlayerState}
              />
              {errorMsg && (
                <div className="mv-widget__overlay">
                  <MediaviewerState kind="error" message={errorMsg} onRetry={handleRetry} />
                </div>
              )}
              {showLoading && (
                <div className="mv-widget__overlay">
                  <MediaviewerState kind="loading" />
                </div>
              )}
            </>
          )}
        </div>

        {!isEmpty && (
          <HelpVideoPicker videos={videos} onSelect={handleSelect} activeId={current?.id ?? null} />
        )}
      </div>
    );
  },
);
