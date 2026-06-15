import type { VideoSource } from '@videovault-player';
import { PlayBadgeIcon, ClockIcon, TagIcon, FilmIcon } from './icons';

interface HelpVideoPickerProps {
  videos: VideoSource[];
  onSelect: (videoId: string) => void;
  activeId?: string | null;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function HelpVideoPicker({ videos, onSelect, activeId }: HelpVideoPickerProps) {
  return (
    <section className="mv-picker" data-testid="help-video-picker" aria-label="Hilfsvideos">
      <div className="mv-picker__head">
        <span className="mv-picker__label">Hilfsvideos</span>
        <span className="mv-picker__rule" aria-hidden />
      </div>
      <div className="mv-picker__grid">
        {videos.map((video) => {
          const dur = formatDuration(video.duration);
          return (
            <button
              key={video.id}
              type="button"
              className="mv-picker__item"
              aria-current={activeId === video.id ? 'true' : undefined}
              onClick={() => onSelect(video.id)}
              data-testid={`picker-item-${video.id}`}
            >
              <div className="mv-picker__thumb">
                {video.poster ? (
                  <img src={video.poster} alt="" loading="lazy" />
                ) : (
                  <div className="mv-poster-fallback" aria-hidden>
                    <FilmIcon />
                  </div>
                )}
                <span className="mv-picker__play" aria-hidden>
                  <PlayBadgeIcon />
                </span>
                {dur && (
                  <span className="mv-picker__dur">
                    <ClockIcon />
                    {dur}
                  </span>
                )}
              </div>
              <div className="mv-picker__body">
                <span className="mv-picker__title">{video.title}</span>
                {video.tags && video.tags.length > 0 && (
                  <span className="mv-picker__tags">
                    {video.tags.slice(0, 3).map((tag) => (
                      <span className="mv-tag" key={tag}>
                        <TagIcon />
                        {tag}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
