import React from 'react';
import './StatBlock.css';

export interface StatItem {
  /** The number or value, e.g. "30+" or "200" */
  value: string;
  /** What the number measures */
  label: string;
}

export interface StatBlockProps {
  /** Two to four stat items */
  stats: StatItem[];
}

/**
 * Horizontal row of key metrics in large Newsreader numerals with brass accents.
 * Typically used for social proof in the Hero or WhyMe section.
 */
export function StatBlock({ stats }: StatBlockProps) {
  return (
    <div className="md-stat-block" role="list" aria-label="Kennzahlen">
      {stats.map(({ value, label }) => (
        <div key={label} className="md-stat-block__item" role="listitem">
          <span className="md-stat-block__value">{value}</span>
          <span className="md-stat-block__label">{label}</span>
        </div>
      ))}
    </div>
  );
}
