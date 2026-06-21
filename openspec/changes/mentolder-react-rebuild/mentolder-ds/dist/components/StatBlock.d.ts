import { default as React } from 'react';
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
export declare function StatBlock({ stats }: StatBlockProps): React.JSX.Element;
