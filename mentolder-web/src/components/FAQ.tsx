import { useState, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface FAQItem {
  question: string;
  answer: string;
}

interface FAQProps {
  items: FAQItem[];
  title?: string;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="w-5 h-5 text-brass flex-shrink-0"
      style={{
        transform: `rotate(${open ? 180 : 0}deg)`,
        transition: 'transform 0.3s ease',
      }}
    >
      <path d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function FAQ({ items, title = 'Häufige Fragen' }: FAQProps) {
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());
  const baseId = useId();

  function toggle(i: number) {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(i);
    }
  }

  return (
    <section className="py-[80px] border-t border-line" aria-labelledby={`${baseId}-heading`}>
      <div className="faq-wrap max-w-[720px] mx-auto px-10 max-md:px-[22px]">
        <h2
          id={`${baseId}-heading`}
          className="font-serif font-normal text-fg text-center m-0 mb-12 leading-[1.1]"
          style={{
            fontSize: 'clamp(28px, 3vw, 40px)',
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h2>
        <div className="flex flex-col gap-2">
          {items.map((item, i) => {
            const open = openSet.has(i);
            const buttonId = `${baseId}-q-${i}`;
            const regionId = `${baseId}-a-${i}`;
            return (
              <div
                key={i}
                className="rounded-xl border overflow-hidden transition-colors duration-150"
                style={{
                  background: 'var(--ink-800)',
                  borderColor: open ? 'var(--line-2)' : 'var(--line)',
                }}
              >
                <button
                  id={buttonId}
                  type="button"
                  onClick={() => toggle(i)}
                  onKeyDown={(e) => onKey(e, i)}
                  aria-expanded={open}
                  aria-controls={regionId}
                  className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 bg-transparent border-0 cursor-pointer transition-colors duration-150"
                >
                  <span className="text-base font-medium text-fg leading-[1.4]">
                    {item.question}
                  </span>
                  <Chevron open={open} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key="content"
                      id={regionId}
                      role="region"
                      aria-labelledby={buttonId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div
                        className="px-6 pb-5 pt-4 text-[15px] leading-[1.6] text-mute border-t"
                        style={{ borderColor: 'var(--line)', marginTop: '-1px' }}
                      >
                        {item.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
