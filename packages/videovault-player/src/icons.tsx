// Self-contained icon set for the player controls.
// currentColor-driven, no external dependency, consistent 24px grid.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...props,
  };
}

export const PlayIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 5.5l12 6.5-12 6.5z" fill="currentColor" stroke="none" />
  </svg>
);

export const PauseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

export const PrevIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 6L9 12l9 6z" fill="currentColor" stroke="none" />
    <rect x="5" y="5.5" width="2.4" height="13" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

export const NextIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l9 6-9 6z" fill="currentColor" stroke="none" />
    <rect x="16.6" y="5.5" width="2.4" height="13" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

export const VolumeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />
    <path d="M16.5 8.5a5 5 0 010 7" />
    <path d="M19 6a8 8 0 010 12" />
  </svg>
);

export const MuteIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />
    <path d="M22 9l-6 6M16 9l6 6" />
  </svg>
);

export const FullscreenIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4" />
  </svg>
);

export const FullscreenExitIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 4v3a2 2 0 01-2 2H4M15 4v3a2 2 0 002 2h3M9 20v-3a2 2 0 00-2-2H4M15 20v-3a2 2 0 012-2h3" />
  </svg>
);

export const PipIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none" />
  </svg>
);
