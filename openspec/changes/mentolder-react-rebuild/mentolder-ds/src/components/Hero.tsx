import React from 'react';
import { KickerBar } from './KickerBar';
import { Button } from './Button';
import './Hero.css';

export interface HeroProps {
  /** Main headline text (before emphasis) */
  title?: string;
  /** Italic brass-coloured emphasis appended to title */
  titleEmphasis?: string;
  /** Body paragraph below the headline */
  subtitle?: string;
  /** Kicker segments — e.g. ["Digital Coach", "Führungskräfte-Mentor"] */
  kickerSegments?: string[];
  /** Primary CTA label */
  ctaLabel?: string;
  /** Primary CTA href */
  ctaHref?: string;
  /** Secondary CTA label */
  secondaryLabel?: string;
  /** Secondary CTA href */
  secondaryHref?: string;
  /** Avatar initials rendered in the portrait circle */
  avatarInitials?: string;
}

/**
 * Full-bleed hero section with a two-column layout: headline copy left,
 * portrait placeholder right. Background uses radial brass + blue-grey halos.
 */
export function Hero({
  title = 'Menschen, Prozesse und Technik —',
  titleEmphasis = 'der Mensch und Technologie wieder verbindet.',
  subtitle = 'Mit 30+ Jahren Führungserfahrung begleite ich Menschen und Organisationen bei der digitalen Transformation — praxisnah, empathisch und auf Augenhöhe.',
  kickerSegments = ['Digital Coach', 'Führungskräfte-Mentor'],
  ctaLabel = 'Kostenloses Erstgespräch',
  ctaHref = '/kontakt',
  secondaryLabel = 'Angebote ansehen',
  secondaryHref = '#angebote',
  avatarInitials = 'BM',
}: HeroProps) {
  return (
    <section className="md-hero" aria-label="Hero-Bereich">
      <div className="md-hero__halo" aria-hidden="true" />
      <div className="md-hero__wrap">
        <div className="md-hero__grid">
          <div className="md-hero__copy">
            <KickerBar segments={kickerSegments} />
            <h1 className="md-hero__h1">
              {title}
              {titleEmphasis && <> <em>{titleEmphasis}</em></>}
            </h1>
            <p className="md-hero__lede">{subtitle}</p>
            <div className="md-hero__cta" role="group" aria-label="Aktionen">
              <Button href={ctaHref} variant="primary" arrow>{ctaLabel}</Button>
              <Button href={secondaryHref} variant="ghost">{secondaryLabel}</Button>
            </div>
          </div>

          <div className="md-hero__portrait-wrap" aria-hidden="true">
            <div className="md-hero__portrait">
              <span className="md-hero__initials">{avatarInitials}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
