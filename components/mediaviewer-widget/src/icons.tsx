// Icon set for the widget chrome (picker, states). currentColor-driven.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...props,
  };
}

export const PlayBadgeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" opacity="0.9" />
    <path d="M10 8.5l6 3.5-6 3.5z" fill="#000" stroke="none" />
  </svg>
);

export const ClockIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const TagIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11.5 3.5H5a1.5 1.5 0 00-1.5 1.5v6.5L12 20l8-8z" />
    <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const FilmIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M3 15h18M8 4v16M16 4v16" />
  </svg>
);

export const AlertIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.5L21 19H3z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

export const RetryIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 12a8.5 8.5 0 108.5-8.5A8.5 8.5 0 005 7" />
    <path d="M4.5 3.5V7H8" />
  </svg>
);
