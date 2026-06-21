import type { ComponentType, SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { iconRegistry, iconLabels, type IconName } from './icons';

export interface Service {
  id: string;
  title: string;
  description: string;
  features: string[];
  price: string;
  priceUnit?: string;
  href: string;
  icon: IconName;
  meta?: string;
}

interface ServiceRowProps {
  services: Service[];
}

function ServiceRowItem({ service, index }: { service: Service; index: number }) {
  const Icon = iconRegistry[service.icon] as ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;
  const label = iconLabels[service.icon];
  const [priceMain] = service.price.split('/').map((s) => s.trim());
  const displayUnit = service.priceUnit ?? '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.45, delay: index * 0.06 }}
      className="offer-row group relative border-t border-line last:border-b transition-[border-color,background] duration-250"
      style={{ '--hover-bg': 'linear-gradient(to right, transparent, oklch(0.80 0.09 75 / .06) 40%, transparent)' } as React.CSSProperties}
    >
      <div
        className="grid gap-9 items-start py-9 max-lg:grid-cols-[40px_1fr_140px] max-lg:gap-y-3.5 max-sm:grid-cols-[40px_1fr]"
        style={{ gridTemplateColumns: '80px 1fr 1.6fr 220px 140px' }}
      >
        {/* Row number */}
        <span className="font-mono text-[12px] tracking-[0.1em] text-mute pt-1.5 max-sm:pt-0">
          {String(index + 1).padStart(2, '0')}
        </span>

        {/* Title + icon */}
        <div className="title-col">
          {Icon && (
            <Icon
              className="w-9 h-9 text-brass mb-3.5 block"
              style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}
              aria-hidden="true"
              focusable="false"
            />
          )}
          <span className="sr-only">{label}</span>
          <h3
            className="font-serif font-normal text-fg m-0 leading-[1.1]"
            style={{ fontSize: '28px', letterSpacing: '-0.015em' }}
          >
            {service.title}
          </h3>
          {service.meta && (
            <span className="block font-mono text-[11px] tracking-[0.14em] uppercase mt-2" style={{ color: 'var(--sage)' }}>
              {service.meta}
            </span>
          )}
        </div>

        {/* Description + features */}
        <div className="desc-col max-lg:col-span-full max-lg:col-start-2">
          <p className="text-fg-soft text-[15px] leading-[1.6] m-0">{service.description}</p>
          {service.features.length > 0 && (
            <ul className="list-none p-0 mt-2.5 grid gap-1.5" aria-label="Leistungen">
              {service.features.map((feature) => (
                <li key={feature} className="text-[13px] text-mute flex items-baseline gap-2.5">
                  <span
                    aria-hidden="true"
                    className="inline-block w-1 h-1 rounded-full bg-brass flex-shrink-0"
                    style={{ transform: 'translateY(-3px)' }}
                  />
                  {feature}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Price */}
        <div
          className="price-col border-l border-line pl-6 flex flex-col gap-1 pt-1.5 max-lg:border-l-0 max-lg:pl-0 max-lg:col-start-2"
        >
          <span className="font-serif text-[26px] text-fg leading-[1.1]" style={{ letterSpacing: '-0.015em' }}>
            {priceMain}
          </span>
          {displayUnit && (
            <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-mute">
              {displayUnit}
            </span>
          )}
        </div>

        {/* CTA */}
        <Link
          to={service.href}
          className="go-link inline-flex items-center gap-2.5 text-brass text-[13px] font-medium no-underline justify-self-end self-center mt-1.5 max-lg:justify-self-end max-sm:col-span-full max-sm:justify-self-start"
          aria-label={`Mehr über ${service.title} erfahren`}
        >
          Mehr
          <span
            className="w-[34px] h-[34px] border border-line-2 rounded-full flex items-center justify-center transition-all duration-200 group-hover:bg-brass group-hover:border-brass group-hover:text-ink-900 flex-shrink-0"
          >
            <svg
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-[14px] h-[14px]"
            >
              <path d="M2 7h10M8 3l4 4-4 4" />
            </svg>
          </span>
        </Link>
      </div>

      {/* Hover gradient overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-250 pointer-events-none border-t-2 border-t-brass"
        style={{ background: 'linear-gradient(to right, transparent, oklch(0.80 0.09 75 / .06) 40%, transparent)' }}
      />
    </motion.div>
  );
}

export function ServiceRow({ services }: ServiceRowProps) {
  return (
    <div role="list" aria-label="Angebote">
      {services.map((service, index) => (
        <div key={service.id} role="listitem">
          <ServiceRowItem service={service} index={index} />
        </div>
      ))}
    </div>
  );
}

export type { ServiceRowProps };
export { ServiceRow as default };
export type { Service as ServiceItem };
