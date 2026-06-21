import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';

export interface Stat {
  /** Display value, e.g. "30+" or "KI" or "B.Sc.". */
  value: string;
  /** Number to count up to. If absent, we try to parse `value` as a number. */
  target?: number;
  label: string;
}

interface WhyMeStatsProps {
  stats: Stat[];
  /** Optional duration in ms. */
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
      // ease-out cubic
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
      className="border-b border-line"
      role="region"
      aria-label="Kennzahlen"
    >
      <div className="grid grid-cols-2 md:grid-cols-4">
        {stats.map((stat, i) => {
          const target = parseTarget(stat);
          const hasNumber = target > 0;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="px-7 py-9 flex flex-col gap-2 border-b md:border-b-0 md:border-r border-line last:border-r-0"
            >
              <span
                className="font-serif text-[44px] leading-[1] text-fg"
                style={{ letterSpacing: '-0.02em' }}
              >
                {hasNumber ? <CountUp target={target} duration={duration} /> : stat.value}
                {hasNumber && stat.value.replace(/[\d]/g, '').trim() && (
                  <em className="text-brass not-italic ml-0.5">
                    {stat.value.replace(/[\d]/g, '').trim()}
                  </em>
                )}
              </span>
              <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-mute">
                {stat.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
