import { default as React } from 'react';
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
export declare function Hero({ title, titleEmphasis, subtitle, kickerSegments, ctaLabel, ctaHref, secondaryLabel, secondaryHref, avatarInitials, }: HeroProps): React.JSX.Element;
