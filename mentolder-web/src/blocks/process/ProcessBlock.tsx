import { motion } from 'framer-motion';
import type { ProcessProps } from '@/blocks/schema';

export function ProcessBlock(props: ProcessProps) {
  return (
    <section
      className="py-[80px] border-t border-b border-line"
      aria-labelledby="process-heading"
      style={{
        background: 'linear-gradient(180deg, transparent, rgba(255,255,255,.015)), var(--ink-900)',
      }}
    >
      <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2.5fr] gap-16 md:gap-16 items-center max-md:gap-10">
          {/* Left: label */}
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-brass inline-flex items-center gap-2.5 m-0 mb-4">
              <span aria-hidden="true" className="inline-block w-[22px] h-px bg-current opacity-80" />
              {props.eyebrow}
            </p>
            <h2
              id="process-heading"
              className="font-serif font-normal text-fg leading-[1.1] m-0"
              style={{ fontSize: '28px', letterSpacing: '-0.02em' }}
            >
              {props.headline}
            </h2>
          </div>

          {/* Right: steps rail */}
          <div className="relative" role="list" aria-label="Prozessschritte">
            {/* Connecting line through all dots */}
            <div
              aria-hidden="true"
              className="absolute top-[14px] left-0 right-0 h-px pointer-events-none max-sm:hidden"
              style={{
                background:
                  'linear-gradient(to right, var(--line), var(--brass) 20%, var(--brass) 80%, var(--line))',
                opacity: 0.6,
              }}
            />

            <ol className="list-none p-0 m-0 grid grid-cols-2 sm:grid-cols-4 gap-6 max-sm:gap-y-8">
              {props.steps.map((step, i) => (
                <motion.li
                  key={step.num}
                  role="listitem"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.45, delay: i * 0.1 }}
                  className="relative pt-10"
                >
                  {/* Step dot: outer circle + inner fill */}
                  <span
                    aria-hidden="true"
                    className="absolute top-2 left-0 w-[14px] h-[14px] rounded-full border border-brass bg-ink-900"
                    style={{ boxShadow: '0 0 8px oklch(0.80 0.09 75 / 0.5)' }}
                  >
                    <span className="absolute inset-[3px] rounded-full bg-brass" aria-hidden="true" />
                  </span>

                  <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-brass m-0 mb-2">
                    {step.num}
                  </p>
                  <h4
                    className="font-sans text-[15px] font-semibold text-fg m-0 mb-1.5"
                    style={{ letterSpacing: '-0.01em' }}
                  >
                    {step.title}
                  </h4>
                  <p className="text-[13px] leading-[1.6] text-mute m-0">{step.text}</p>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
