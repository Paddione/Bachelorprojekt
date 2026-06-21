import { default as React } from 'react';
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
export declare function ServiceCard({ num, title, meta, description, features, price, href, }: ServiceCardProps): React.JSX.Element;
