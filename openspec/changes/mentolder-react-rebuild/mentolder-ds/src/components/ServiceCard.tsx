import React from 'react';
import './ServiceCard.css';

export interface ServiceCardProps {
  /** Card number displayed as a badge, e.g. "01" */
  num: string;
  /** Service title */
  title: string;
  /** Optional category/format label */
  meta?: string;
  /** Short description paragraph */
  description: string;
  /** Feature/bullet points */
  features: string[];
  /** Price string, e.g. "1.200 €" or "ab 890 €/Tag" */
  price: string;
  /** Call-to-action href */
  href?: string;
}

/**
 * Coaching service card with a brass top accent and dark ink background.
 * Stacks vertically on its own; compose with `ServiceRow` for a grid.
 */
export function ServiceCard({
  num,
  title,
  meta,
  description,
  features,
  price,
  href = '#',
}: ServiceCardProps) {
  return (
    <article className="md-service-card">
      <header className="md-service-card__header">
        <span className="md-service-card__num" aria-hidden="true">{num}</span>
        <div>
          <h3 className="md-service-card__title">{title}</h3>
          {meta && <p className="md-service-card__meta">{meta}</p>}
        </div>
      </header>

      <p className="md-service-card__desc">{description}</p>

      <ul className="md-service-card__features" aria-label="Leistungen">
        {features.map((f) => (
          <li key={f} className="md-service-card__feature">{f}</li>
        ))}
      </ul>

      <footer className="md-service-card__footer">
        <span className="md-service-card__price">{price}</span>
        <a href={href} className="md-service-card__cta">
          Mehr erfahren
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 7h10M8 3l4 4-4 4" />
          </svg>
        </a>
      </footer>
    </article>
  );
}
