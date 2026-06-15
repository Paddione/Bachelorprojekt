import { forwardRef, useImperativeHandle, useState, useCallback, useEffect, useRef } from 'react';
import { VideoPlayer } from '@videovault-player';
import { HelpVideoPicker } from './HelpVideoPicker';
import { MediaviewerState } from './MediaviewerState';
import type {
  MediaviewerHandle,
  MediaviewerWidgetProps,
  VideoSource,
  PlayerState,
} from '@videovault-player';

export const MediaviewerWidget = forwardRef<MediaviewerHandle, MediaviewerWidgetProps>(
  function MediaviewerWidget({ videos, onSelect, onEnded, onError }, ref) {
    // No auto-play: the stage stays in an idle prompt until the host or the user
    // picks a video (via the picker or the imperative ref handle).
    const [current, setCurrent] = useState<VideoSource | null>(null);
    const [playerState, setPlayerState] = useState<PlayerState>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    // Delegate imperative play/pause/seek/getState to the inner VideoPlayer,
    // which owns the real playback state. Null while no video is selected.
    const playerRef = useRef<MediaviewerHandle>(null);

    // Drop the selection if the current video leaves the playlist.
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
      // re-point to force the player to reload the current source
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
        // Delegate live transport to the mounted VideoPlayer; no-op until a
        // video is selected (playerRef null).
        play: () => playerRef.current?.play(),
        pause: () => playerRef.current?.pause(),
        seek: (time: number) => playerRef.current?.seek(time),
        getState: () =>
          playerRef.current?.getState() ?? { current, state: playerState, currentTime: 0 },
      }),
      [current, playerState, handleSelect],
    );

    const isEmpty = videos.length === 0;
    const showLoading = !errorMsg && playerState === 'loading';

    return (
      <div className="mv-root mv-widget" data-testid="mediaviewer-widget">
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
