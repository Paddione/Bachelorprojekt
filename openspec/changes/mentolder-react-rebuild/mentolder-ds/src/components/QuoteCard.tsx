import React from 'react';
import './QuoteCard.css';

export interface QuoteCardProps {
  /** The testimonial quote text (no quotation marks needed) */
  quote: string;
  /** Name of the person giving the quote */
  name: string;
  /** Role or company of the person */
  role?: string;
}

/**
 * Testimonial card with a brass left-border accent and italic serif quote text.
 */
export function QuoteCard({ quote, name, role }: QuoteCardProps) {
  return (
    <blockquote className="md-quote-card">
      <p className="md-quote-card__text">„{quote}"</p>
      <footer className="md-quote-card__footer">
        <cite className="md-quote-card__name">{name}</cite>
        {role && <span className="md-quote-card__role">{role}</span>}
      </footer>
    </blockquote>
  );
}
