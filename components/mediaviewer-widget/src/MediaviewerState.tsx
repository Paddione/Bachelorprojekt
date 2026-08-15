// Presentational state surfaces for the stage: empty / loading / buffering / error.
// Pure, props-driven, no data access — matches the widget's host-neutral contract.
import { FilmIcon, AlertIcon, RetryIcon, PlayBadgeIcon } from './icons';

export type StateKind = 'empty' | 'idle' | 'loading' | 'buffering' | 'error';

interface MediaviewerStateProps {
  kind: StateKind;
  message?: string;
  onRetry?: () => void;
}

export function MediaviewerState({ kind, message, onRetry }: MediaviewerStateProps) {
  if (kind === 'loading') {
    return (
      <div className="mv-state" data-testid="state-loading" role="status" aria-live="polite">
        <div className="mv-spinner" aria-hidden />
        <div className="mv-state__hint">{message ?? 'Video wird geladen…'}</div>
      </div>
    );
  }

  if (kind === 'buffering') {
    return (
      <div className="mv-state" data-testid="state-buffering" role="status" aria-live="polite">
        <div className="mv-buffering">
          <div className="mv-buffering__bar" aria-hidden />
          <div className="mv-state__hint">{message ?? 'Puffert…'}</div>
        </div>
      </div>
    );
  }

  if (kind === 'error') {
    return (
      <div className="mv-state mv-state--error" data-testid="state-error" role="alert">
        <div className="mv-state__icon">
          <AlertIcon />
        </div>
        <div className="mv-state__title">Wiedergabe fehlgeschlagen</div>
        <div className="mv-state__hint">
          {message ?? 'Das Video konnte nicht abgespielt werden.'}
        </div>
        {onRetry && (
          <button className="mv-state__action" onClick={onRetry} type="button">
            <RetryIcon />
            Erneut versuchen
          </button>
        )}
      </div>
    );
  }

  if (kind === 'idle') {
    return (
      <div className="mv-state" data-testid="state-idle">
        <div className="mv-state__icon">
          <PlayBadgeIcon />
        </div>
        <div className="mv-state__title">Video auswählen</div>
        <div className="mv-state__hint">
          {message ?? 'Wähle unten ein Hilfsvideo, um die Wiedergabe zu starten.'}
        </div>
      </div>
    );
  }

  // empty
  return (
    <div className="mv-state" data-testid="state-empty">
      <div className="mv-state__icon">
        <FilmIcon />
      </div>
      <div className="mv-state__title">Keine Videos</div>
      <div className="mv-state__hint">
        {message ?? 'Sobald der Host Videos bereitstellt, erscheinen sie hier.'}
      </div>
    </div>
  );
}
