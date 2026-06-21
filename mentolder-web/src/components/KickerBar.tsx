interface KickerBarProps {
  parts: string[];
  className?: string;
}

export function KickerBar({ parts, className = '' }: KickerBarProps) {
  return (
    <div
      className={`flex items-center gap-[14px] font-mono text-[11px] tracking-[0.14em] uppercase text-mute ${className}`}
      aria-label="Kategorien"
    >
      <span
        className="w-[44px] h-px bg-brass opacity-70 flex-shrink-0"
        aria-hidden="true"
      />
      {parts.map((part, i) => (
        <span key={part} className="flex items-center gap-[14px]">
          {i > 0 && (
            <span
              className="w-[5px] h-[5px] rounded-full bg-sage flex-shrink-0"
              aria-hidden="true"
            />
          )}
          <span>{part}</span>
        </span>
      ))}
    </div>
  );
}
