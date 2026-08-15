import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function Svg({ children, size = 24, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} {...rest}>
      {children}
    </svg>
  );
}

export const Icons = {
  search:  (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Svg>,
  plus:    (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  arrow:   (p: IconProps) => <Svg {...p}><path d="M5 12h14M13 5l7 7-7 7" /></Svg>,
  check:   (p: IconProps) => <Svg {...p} strokeWidth={3}><path d="M5 12l5 5L20 6" /></Svg>,
  mic:     (p: IconProps) => <Svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>,
  play:    (p: IconProps) => <Svg {...p}><path d="M7 5l12 7-12 7V5z" /></Svg>,
  trash:   (p: IconProps) => <Svg {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Svg>,
  replace: (p: IconProps) => <Svg {...p}><path d="M4 9a7 7 0 0 1 12-4l2 2M20 15a7 7 0 0 1-12 4l-2-2M16 3v4h-4M8 21v-4h4" /></Svg>,
  reset:   (p: IconProps) => <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 4v4h4" /></Svg>,
  copy:    (p: IconProps) => <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></Svg>,
  speaker: (p: IconProps) => <Svg {...p}><path d="M4 9v6h4l5 4V5L8 9H4zM17 8a5 5 0 0 1 0 8" /></Svg>,
  globe:   (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18A14 14 0 0 1 12 3z" /></Svg>,
  info:    (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>,
  x:       (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>,
  send:    (p: IconProps) => <Svg {...p}><path d="M4 12l16-7-7 16-2-7-7-2z" /></Svg>,
  present: (p: IconProps) => <Svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>,
  printer: (p: IconProps) => <Svg {...p}><path d="M6 9V3h12v6M6 18H4v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5h-2M8 14h8v7H8z" /></Svg>,
  split:   (p: IconProps) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></Svg>,
  back:    (p: IconProps) => <Svg {...p}><path d="M19 12H5M11 5l-7 7 7 7" /></Svg>,
  rtl:     (p: IconProps) => <Svg {...p}><path d="M21 6H9a4 4 0 0 0 0 8h2M13 4v16M17 4v16M7 18l-3-3 3-3" /></Svg>,
  pause:   (p: IconProps) => <Svg {...p}><path d="M8 5v14M16 5v14" /></Svg>,
};

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="brand-mark"
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.27),
        background: 'radial-gradient(circle at 30% 30%, var(--brass-2), var(--brass) 55%, #8a6a2a 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.2), 0 0 0 1px rgba(0,0,0,.3)',
        position: 'relative',
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    />
  );
}
