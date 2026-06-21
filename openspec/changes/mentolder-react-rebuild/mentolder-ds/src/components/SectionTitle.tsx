import React from 'react';
import { KickerBar } from './KickerBar';
import './SectionTitle.css';

export interface SectionTitleProps {
  /** Kicker segments above the headline */
  kicker?: string[];
  /** Section headline */
  headline: string;
  /** Optional italic emphasis inside the headline (rendered in brass colour) */
  emphasis?: string;
  /** Short subtext below the headline */
  subtext?: string;
  /** Text alignment */
  align?: 'left' | 'center';
  /** HTML id for scroll anchoring */
  id?: string;
}

/**
 * Reusable section header: kicker bar + serif headline + optional subtext.
 * Used to open every section on the page.
 */
export function SectionTitle({
  kicker,
  headline,
  emphasis,
  subtext,
  align = 'left',
  id,
}: SectionTitleProps) {
  return (
    <div className={`md-section-title md-section-title--${align}`} id={id}>
      {kicker && kicker.length > 0 && <KickerBar segments={kicker} />}
      <h2 className="md-section-title__h2">
        {headline}
        {emphasis && <> <em>{emphasis}</em></>}
      </h2>
      {subtext && <p className="md-section-title__sub">{subtext}</p>}
    </div>
  );
}
