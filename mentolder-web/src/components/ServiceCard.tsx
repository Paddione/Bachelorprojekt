import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

interface ServiceCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  features?: string[];
  price?: string;
  href?: string;
}

export function ServiceCard({
  icon,
  title,
  description,
  features = [],
  price,
  href = '#',
}: ServiceCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="bg-ink-850 border border-line-2 border-t-2 border-t-brass rounded-card p-7 flex flex-col gap-4 h-full"
    >
      <div className="w-10 h-10 text-brass flex items-center justify-center" aria-hidden="true">
        {icon}
      </div>
      <h3 className="font-serif text-[22px] font-normal text-fg m-0" style={{ letterSpacing: '-0.015em' }}>
        {title}
      </h3>
      <p className="text-fg-soft text-[15px] leading-[1.6] m-0">{description}</p>
      {features.length > 0 && (
        <ul className="list-none p-0 m-0 grid gap-1.5" aria-label="Leistungen">
          {features.map((feature) => (
            <li
              key={feature}
              className="text-[13px] text-mute flex items-baseline gap-2.5"
            >
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
      {price && (
        <div className="font-serif text-[20px] text-fg mt-auto pt-2" style={{ letterSpacing: '-0.015em' }}>
          {price}
        </div>
      )}
      <Link
        to={href}
        className="text-brass text-[13px] font-medium inline-flex items-center gap-2 mt-2"
      >
        Mehr erfahren
        <span
          aria-hidden="true"
          className="w-[34px] h-[34px] border border-line-2 rounded-full flex items-center justify-center transition-all duration-200"
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
    </motion.div>
  );
}
