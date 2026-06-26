import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { Link } from 'react-router-dom';

export interface Stat {
  value: string;
  target?: number;
  label: string;
}

interface WhyMeStatsProps {
  stats: Stat[];
  duration?: number;
}

function parseTarget(stat: Stat): number {
  if (typeof stat.target === 'number') return stat.target;
  const m = stat.value.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function CountUp({ target, duration }: { target: number; duration: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration]);

  return (
    <span ref={ref} aria-live="polite">
      {value}
    </span>
  );
}

export function WhyMeStats({ stats, duration = 1200 }: WhyMeStatsProps) {
  return (
    <section
      className="border-b border-line grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr]"
      role="region"
      aria-label="Kennzahlen"
    >
      {/* Stats left column */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 md:border-r border-line border-b md:border-b-0"
        aria-label="Kennzahlen"
      >
        {stats.map((stat) => {
          const target = parseTarget(stat);
          const hasNumber = target > 0;
          const suffix = stat.value.replace(/[\d]/g, '').trim();
          return (
            <div
              key={stat.label}
              className="flex flex-col gap-2 border-r border-line last:border-r-0 px-7 py-[38px]"
            >
              <span
                className="font-serif leading-[1] text-brass"
                style={{ fontSize: '44px', letterSpacing: '-0.02em' }}
              >
                {hasNumber ? (
                  <>
                    <CountUp target={target} duration={duration} />
                    {suffix && <em className="not-italic">{suffix}</em>}
                  </>
                ) : (
                  stat.value
                )}
              </span>
              <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-mute">
                {stat.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Availability placeholder right column */}
      <div className="flex items-center px-10 py-8 max-md:px-[22px]">
        <p className="text-mute text-[14px] m-0">
          <Link to="/kontakt" className="text-brass no-underline hover:underline">
            Termine ansehen →
          </Link>
        </p>
      </div>
    </section>
  );
}
