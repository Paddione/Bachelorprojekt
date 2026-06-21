import React from 'react';
import './Button.css';

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
export function Button({
  variant = 'primary',
  children,
  href,
  onClick,
  arrow = false,
  disabled = false,
  className = '',
}: ButtonProps) {
  const cls = `md-btn md-btn--${variant}${disabled ? ' md-btn--disabled' : ''} ${className}`.trim();

  const content = (
    <>
      {children}
      {arrow && (
        <svg className="md-btn__arrow" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 7h10M8 3l4 4-4 4" />
        </svg>
      )}
    </>
  );

  if (href) {
    return <a href={href} className={cls}>{content}</a>;
  }

  return (
    <button className={cls} onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}
