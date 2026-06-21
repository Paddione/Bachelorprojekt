import React from 'react';
import './KickerBar.css';

export interface KickerBarProps {
  /** One or two kicker segments separated visually by a sage dot */
  segments: string[];
  className?: string;
}

/**
 * Section-label row: brass horizontal bar → kicker text segments separated by sage dots.
 * Used above every section headline to establish context (e.g. "Digital Coach · Mentor").
 */
export function KickerBar({ segments, className = '' }: KickerBarProps) {
  return (
    <div className={`md-kicker ${className}`.trim()} aria-label="Kategorie">
      <span className="md-kicker__bar" aria-hidden="true" />
      {segments.map((seg, i) => (
        <React.Fragment key={seg}>
          {i > 0 && <span className="md-kicker__dot" aria-hidden="true" />}
          <span className="md-kicker__text">{seg}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
