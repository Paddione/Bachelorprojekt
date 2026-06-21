import { default as React } from 'react';
export interface ButtonProps {
    /** Visual style of the button */
    variant?: 'primary' | 'ghost';
    /** Button label */
    children: React.ReactNode;
    /** Link target — renders an <a> when provided */
    href?: string;
    /** Click handler (button only) */
    onClick?: () => void;
    /** Show trailing arrow icon */
    arrow?: boolean;
    /** Disabled state */
    disabled?: boolean;
    className?: string;
}
/** Primary and ghost action buttons in the mentolder brass/ink palette. */
export declare function Button({ variant, children, href, onClick, arrow, disabled, className, }: ButtonProps): React.JSX.Element;
