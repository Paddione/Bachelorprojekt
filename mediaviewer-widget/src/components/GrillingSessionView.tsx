import { useState, useCallback, useMemo } from 'react';
import type { GrillingSessionData } from '../embed/bridge';
import '../styles/grilling.css';

interface GrillingSessionViewProps {
  data: GrillingSessionData;
  onAnswer?: (questionId: string, answer: string) => void;
  onDismiss?: (questionId: string) => void;
  onComplete?: (answers: Record<string, string>) => void;
}

export function GrillingSessionView({
  data,
  onAnswer,
  onDismiss,
  onComplete,
}: GrillingSessionViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(data.existingAnswers ?? {});
  const [expandedHint, setExpandedHint] = useState<string | null>(null);

  const questions = data.questions;
  const current = questions[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === questions.length - 1;

  const currentAnswer = current ? answers[current.id] ?? '' : '';

  const currentHints = current ? data.hints?.[current.id] : undefined;
  const currentSuggestions = current ? data.suggestions?.[current.id] : undefined;
  const showHints = currentHints || (currentSuggestions && currentSuggestions.length > 0);

  const handleAnswerChange = useCallback(
    (value: string) => {
      if (!current) return;
      setAnswers((prev) => ({ ...prev, [current.id]: value }));
    },
    [current],
  );

  const handleAnswerSave = useCallback(() => {
    if (!current) return;
    onAnswer?.(current.id, answers[current.id] ?? '');
  }, [current, answers, onAnswer]);

  const handleDismiss = useCallback(() => {
    if (!current) return;
    onDismiss?.(current.id);
  }, [current, onDismiss]);

  const handlePrev = useCallback(() => {
    if (!isFirst) setCurrentIndex((i) => i - 1);
  }, [isFirst]);

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete?.(answers);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [isLast, answers, onComplete]);

  const progress = useMemo(() => {
    const answered = Object.keys(answers).filter((k) => answers[k]?.trim()).length;
    return { answered, total: questions.length };
  }, [answers, questions.length]);

  const currentSection = current?.section ?? '';

  if (!current) {
    return (
      <div className="gv-root">
        <div className="gv-empty">Keine Grilling-Daten verfügbar.</div>
      </div>
    );
  }

  return (
    <div className="gv-root" data-testid="grilling-session-view">
      <header className="gv-header">
        <span className="gv-header__label">Final Grilling</span>
        <span className="gv-header__ticket">{data.ticketId}</span>
      </header>

      <div className="gv-progress">
        <div className="gv-progress__bar">
          <div
            className="gv-progress__fill"
            style={{ width: `${(progress.answered / progress.total) * 100}%` }}
          />
        </div>
        <span className="gv-progress__text">
          {progress.answered}/{progress.total}
        </span>
      </div>

      <div className="gv-body">
        <div className="gv-section-label">{currentSection}</div>
        <p className="gv-question">{current.label}</p>

        {currentHints && (
          <div className="gv-hint">
            <button
              className="gv-hint__toggle"
              onClick={() => setExpandedHint(expandedHint === current.id ? null : current.id)}
              aria-expanded={expandedHint === current.id}
            >
              {expandedHint === current.id ? 'Kontext ausblenden' : 'Kontext anzeigen'}
            </button>
            {expandedHint === current.id && (
              <div className="gv-hint__content">{currentHints}</div>
            )}
          </div>
        )}

        <textarea
          className="gv-answer"
          value={currentAnswer}
          onChange={(e) => handleAnswerChange(e.target.value)}
          onBlur={handleAnswerSave}
          placeholder="Deine Antwort ..."
          rows={4}
          data-testid="grilling-answer-input"
        />

        {currentSuggestions && currentSuggestions.length > 0 && (
          <div className="gv-suggestions">
            <div className="gv-suggestions__label">Vorschläge:</div>
            {currentSuggestions.map((s, i) => (
              <button
                key={i}
                className="gv-suggestions__chip"
                onClick={() => {
                  const prefix = currentAnswer ? `${currentAnswer}\n` : '';
                  handleAnswerChange(prefix + s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="gv-footer">
        <button
          className="gv-btn gv-btn--dimiss"
          onClick={handleDismiss}
          disabled={!onDismiss}
        >
          Überspringen
        </button>
        <div className="gv-nav">
          <button
            className="gv-btn gv-btn--prev"
            onClick={handlePrev}
            disabled={isFirst}
          >
            Zurück
          </button>
          <span className="gv-nav__pos">
            {currentIndex + 1}/{questions.length}
          </span>
          <button
            className="gv-btn gv-btn--next"
            onClick={handleNext}
          >
            {isLast ? 'Abschließen' : 'Weiter'}
          </button>
        </div>
      </footer>
    </div>
  );
}
