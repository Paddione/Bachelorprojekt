import { default as React } from 'react';
export interface KickerBarProps {
    /** One or two kicker segments separated visually by a sage dot */
    segments: string[];
    className?: string;
}
/**
 * Section-label row: brass horizontal bar → kicker text segments separated by sage dots.
 * Used above every section headline to establish context (e.g. "Digital Coach · Mentor").
 */
export declare function KickerBar({ segments, className }: KickerBarProps): React.JSX.Element;
