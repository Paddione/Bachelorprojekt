import { default as React } from 'react';
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
export declare function SectionTitle({ kicker, headline, emphasis, subtext, align, id, }: SectionTitleProps): React.JSX.Element;
