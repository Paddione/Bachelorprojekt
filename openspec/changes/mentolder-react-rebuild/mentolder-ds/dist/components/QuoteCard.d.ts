import { default as React } from 'react';
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
export declare function QuoteCard({ quote, name, role }: QuoteCardProps): React.JSX.Element;
