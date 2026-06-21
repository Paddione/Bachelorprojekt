import { motion } from 'framer-motion';
import type { WhyMeProps } from '@/blocks/schema';

export function WhyMeBlock(props: WhyMeProps) {
  return (
    <section className="bg-ink-850 border-y border-line py-[120px] max-md:py-[80px]" aria-labelledby="why-heading">
      <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-20 max-md:gap-14 items-start">
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-brass inline-flex items-center gap-2.5 m-0 mb-4">
              <span aria-hidden="true" className="inline-block w-[22px] h-px bg-current opacity-80" />
              {props.headline}
            </p>
            <h2
              id="why-heading"
              className="font-serif font-normal text-fg leading-[1.1] m-0 max-w-[18ch]"
              style={{
                fontSize: 'clamp(32px, 3.6vw, 48px)',
                letterSpacing: '-0.02em',
              }}
            >
              {props.intro.prefix}<em>{props.intro.emphasis}</em>{props.intro.suffix}
            </h2>

            <ol className="list-none p-0 mt-10 border-t border-line" aria-label="Gründe">
              {props.points.map((p, i) => (
                <motion.li
                  key={p.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="py-[26px] border-b border-line grid grid-cols-[56px_1fr] gap-[22px] items-start"
                >
                  <span className="font-mono text-[11px] text-brass tracking-[0.14em] uppercase pt-1.5">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h4 className="font-sans text-[17px] font-semibold text-fg m-0 mb-1.5" style={{ letterSpacing: '-0.01em' }}>
                      {p.title}
                    </h4>
                    <p className="text-[14px] leading-[1.6] text-mute m-0">{p.text}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>

          <div className="pt-14 max-md:pt-0">
            <figure className="rounded-card border border-line-2 p-8 bg-ink-800 relative">
              <span
                aria-hidden="true"
                className="absolute left-8 -top-1 font-serif text-[64px] text-brass leading-none"
                style={{ fontFamily: 'var(--serif)' }}
              >
                &ldquo;
              </span>
              <blockquote className="font-serif text-[22px] leading-[1.4] text-fg m-0 mt-6" style={{ letterSpacing: '-0.01em' }}>
                {props.quote}
              </blockquote>
              <figcaption className="mt-6 pt-4 border-t border-line flex flex-col gap-1">
                <span className="font-serif text-[16px] text-fg">{props.quoteName}</span>
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-mute">
                  {props.quoteRole}
                </span>
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
