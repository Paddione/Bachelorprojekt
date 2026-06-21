import { motion } from 'framer-motion';
import type { ProcessProps } from '@/blocks/schema';

export function ProcessBlock(props: ProcessProps) {
  return (
    <section className="py-[80px] border-t border-line" aria-labelledby="process-heading">
      <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-14 items-end">
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-brass inline-flex items-center gap-2.5 m-0 mb-4">
              <span aria-hidden="true" className="inline-block w-[22px] h-px bg-current opacity-80" />
              {props.eyebrow}
            </p>
            <h2
              id="process-heading"
              className="font-serif font-normal text-fg leading-[1.1] m-0"
              style={{ fontSize: 'clamp(28px, 3.2vw, 42px)', letterSpacing: '-0.02em' }}
            >
              {props.headline}
            </h2>
          </div>
        </div>

        <ol className="list-none p-0 m-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line" aria-label="Prozessschritte">
          {props.steps.map((step, i) => (
            <motion.li
              key={step.num}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className="bg-ink-900 p-8 flex flex-col gap-4"
            >
              <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-brass">{step.num}</span>
              <h3 className="font-serif text-[22px] font-normal text-fg m-0 leading-[1.1]" style={{ letterSpacing: '-0.015em' }}>
                {step.title}
              </h3>
              <p className="text-[14px] leading-[1.6] text-mute m-0">{step.text}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
