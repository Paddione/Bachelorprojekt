import { ServiceRow } from '@/components/ServiceRow';
import type { ServicesProps } from '@/blocks/schema';

export function ServicesBlock(props: ServicesProps) {
  return (
    <section
      id="angebote"
      className="py-[120px] max-md:py-[80px]"
      aria-labelledby="offers-heading"
    >
      <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-[72px] max-md:gap-6 max-md:mb-12 items-end">
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-brass inline-flex items-center gap-2.5 m-0 mb-4">
              <span aria-hidden="true" className="inline-block w-[22px] h-px bg-current opacity-80" />
              Meine Angebote
            </p>
            <h2
              id="offers-heading"
              className="font-serif font-normal text-fg leading-[1.1] m-0 max-w-[18ch]"
              style={{
                fontSize: 'clamp(32px, 3.6vw, 48px)',
                letterSpacing: '-0.02em',
              }}
            >
              {props.headline}
            </h2>
          </div>
          <p className="text-[18px] leading-[1.6] text-fg-soft max-w-[52ch] m-0">
            {props.subheadline}
          </p>
        </div>

        <ServiceRow services={props.items} />
      </div>
    </section>
  );
}
