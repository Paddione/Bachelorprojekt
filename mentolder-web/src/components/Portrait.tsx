import { motion } from 'framer-motion';

interface PortraitProps {
  avatarType?: 'image' | 'initials';
  avatarSrc?: string;
  avatarInitials?: string;
  name: string;
  role: string;
  location?: string;
  tagText?: string;
  className?: string;
}

export function Portrait({
  avatarType = 'initials',
  avatarSrc,
  avatarInitials = '',
  name,
  role,
  location = 'Lüneburg · DE',
  tagText = 'Anno 2026 · Lüneburg',
  className = '',
}: PortraitProps) {
  return (
    <div
      className={`relative w-full max-w-[460px] ml-auto isolate pr-[18px] ${className}`}
      role="img"
      aria-label={`Portrait von ${name}, ${role}`}
    >
      {/* Vertical hairline behind frame */}
      <span
        aria-hidden="true"
        className="absolute right-[2px] top-[-16px] bottom-[-40px] w-px pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, transparent, var(--line-2) 20%, var(--line-2) 80%, transparent)',
        }}
      />

      {/* Warm halo behind frame */}
      <div
        aria-hidden="true"
        className="absolute right-[-8%] top-[6%] w-[90%] h-[90%] rounded-full pointer-events-none z-[-1]"
        style={{
          background:
            'radial-gradient(closest-side, oklch(0.80 0.09 75 / .45), transparent 70%)',
          filter: 'blur(8px)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute left-[-6%] bottom-[12%] w-[55%] h-[55%] rounded-full pointer-events-none z-[-1]"
        style={{
          background:
            'radial-gradient(closest-side, oklch(0.60 0.05 250 / .45), transparent 70%)',
          filter: 'blur(18px)',
        }}
      />

      {/* Frame */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full aspect-[4/5] rounded bg-ink-800 overflow-hidden"
        style={{
          boxShadow:
            '0 40px 80px -30px rgba(0,0,0,.75), 0 2px 0 0 rgba(255,255,255,.04), inset 0 0 0 1px var(--line-2)',
        }}
      >
        {avatarType === 'image' && avatarSrc ? (
          <>
            <img
              src={avatarSrc}
              alt={`${name}, ${role}`}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                objectPosition: 'center 18%',
                filter: 'contrast(1.04) brightness(1.02) sepia(.18) saturate(1.05)',
              }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none mix-blend-soft-light"
              style={{
                background:
                  'linear-gradient(180deg, oklch(0.80 0.09 75 / .10) 0%, transparent 40%, oklch(0.18 0.02 250 / .35) 100%)',
              }}
            />
          </>
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center bg-ink-800"
          >
            <div
              className="w-[220px] h-[220px] rounded-full flex items-center justify-center"
              style={{
                background:
                  'radial-gradient(circle at 30% 30%, var(--brass-2), var(--brass) 55%, #8a6a2a 100%)',
                boxShadow:
                  'inset 0 0 0 1px rgba(255,255,255,.2), 0 20px 60px rgba(0,0,0,.4)',
              }}
            >
              <span
                className="font-serif text-[64px] font-normal text-ink-900"
                style={{ letterSpacing: '-0.02em', userSelect: 'none' }}
              >
                {avatarInitials}
              </span>
            </div>
          </div>
        )}

        {/* Brass hairline top */}
        <div
          aria-hidden="true"
          className="absolute left-0 right-0 top-0 h-px z-[2] pointer-events-none"
          style={{
            background:
              'linear-gradient(to right, transparent, oklch(0.80 0.09 75 / .7) 30%, oklch(0.80 0.09 75 / .7) 70%, transparent)',
          }}
        />

        {/* Tag plate */}
        <div
          className="absolute left-[14px] top-[14px] z-[3] flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase text-fg px-[10px] py-[6px] rounded-full"
          style={{
            background: 'rgba(11,17,28,.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,.12)',
          }}
          aria-label={tagText}
        >
          <span
            aria-hidden="true"
            className="w-[6px] h-[6px] rounded-full bg-sage flex-shrink-0"
            style={{ boxShadow: '0 0 0 3px oklch(0.80 0.06 160 / .18)' }}
          />
          {tagText}
        </div>
      </motion.div>

      {/* Caption plate */}
      <div className="relative mt-[18px] grid grid-cols-[auto_1fr_auto] gap-4 items-center pt-[14px] px-1 border-t border-line">
        <span className="font-mono text-[10px] tracking-[0.18em] text-brass uppercase">
          GK · 01
        </span>
        <div className="flex flex-col gap-[2px]">
          <span className="font-serif text-base text-fg" style={{ letterSpacing: '-0.01em' }}>
            {name}
          </span>
          <span className="font-mono text-[10px] tracking-[0.14em] text-mute uppercase">
            {role}
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.14em] text-mute uppercase text-right">
          {location}
        </span>
      </div>
    </div>
  );
}
