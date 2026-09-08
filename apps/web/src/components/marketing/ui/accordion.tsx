'use client';

import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { EASE, useReducedMotionSafe } from '@/lib/motion';

export type AccordionEntry = { question: string; answer: string };

/** Numbered, single-open accordion. Height animates; the chevron rotates. */
export function Accordion({ items }: { items: AccordionEntry[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotionSafe();
  const baseId = useId();

  return (
    <div className="divide-y divide-edge border-y border-edge">
      {items.map((item, index) => {
        const isOpen = open === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;

        return (
          <div key={item.question}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : index)}
                className="flex w-full items-start gap-5 py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright focus-visible:ring-offset-2 focus-visible:ring-offset-transparent md:gap-8"
              >
                <span className="mt-1 shrink-0 font-mono text-micro text-moss">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 font-display text-[1.0625rem] font-medium leading-snug tracking-[-0.02em] text-forest md:text-[1.25rem]">
                  {item.question}
                </span>
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
                  className="mt-0.5 shrink-0 text-forest"
                >
                  <ChevronDown className="size-5" aria-hidden />
                </motion.span>
              </button>
            </h3>

            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  key="panel"
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
                  className="overflow-hidden"
                >
                  <p className="max-w-2xl pb-7 pl-[2.75rem] pr-6 text-body-base text-moss md:pl-[3.75rem]">
                    {item.answer}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
