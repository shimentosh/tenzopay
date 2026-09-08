'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { animate, useInView } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VIEWPORT, useReducedMotionSafe } from '@/lib/motion';

export type CodeTab = { id: string; label: string; code: string };

/** Keys, strings, numbers and comments. Enough colour to read as code. */
const TOKEN = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(\b-?\d+(?:\.\d+)?\b)|(#[^\n]*)/g;

function highlight(line: string, keyPrefix: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  TOKEN.lastIndex = 0;

  while ((match = TOKEN.exec(line)) !== null) {
    if (match.index > last) parts.push(line.slice(last, match.index));

    const [text, key, str, num, comment] = match;
    const tone = key ? 'text-bright' : str ? 'text-mint' : num ? 'text-coral' : comment ? 'text-paper/40' : '';
    parts.push(
      <span key={`${keyPrefix}-${match.index}`} className={tone}>
        {text}
      </span>,
    );
    last = match.index + text.length;
  }

  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

export function CodeWindow({
  tabs,
  statusLabel,
  className,
}: {
  tabs: CodeTab[];
  statusLabel: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT);
  const reduce = useReducedMotionSafe();
  const [active, setActive] = useState(0);
  const [typed, setTyped] = useState(0);
  const [copied, setCopied] = useState(false);

  const code = tabs[active].code;
  const done = typed >= code.length;

  useEffect(() => {
    if (!inView) return;

    if (reduce) {
      setTyped(code.length);
      return;
    }

    setTyped(0);
    const controls = animate(0, code.length, {
      duration: code.length * 0.025,
      ease: 'linear',
      onUpdate: (latest) => setTyped(Math.round(latest)),
    });

    return () => controls.stop();
  }, [inView, reduce, code]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const visible = code.slice(0, typed);

  return (
    <div
      ref={ref}
      className={cn('overflow-hidden rounded-3xl border border-paper/10 bg-ink shadow-float', className)}
    >
      <div className="flex items-center gap-4 border-b border-paper/10 px-5 py-3.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-paper/20" />
          <span className="size-2.5 rounded-full bg-paper/20" />
          <span className="size-2.5 rounded-full bg-paper/20" />
        </span>

        <div role="tablist" aria-label="Request example" className="flex gap-1">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={active === index}
              onClick={() => setActive(index)}
              className={cn(
                'rounded-full px-3 py-1 text-[0.75rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright',
                active === index ? 'bg-paper/10 text-paper' : 'text-paper/45 hover:text-paper/80',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => setCopied(true));
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] text-paper/45 transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <pre className="overflow-x-auto px-5 py-5 font-mono text-[0.8125rem] leading-relaxed text-paper/85">
        <code>
          {visible.split('\n').map((line, index) => (
            <Fragment key={index}>
              {highlight(line, `${active}-${index}`)}
              {'\n'}
            </Fragment>
          ))}
        </code>
      </pre>

      <div className="flex items-center justify-between border-t border-paper/10 px-5 py-3.5">
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full bg-bright/15 px-3 py-1 text-[0.75rem] font-medium text-bright transition-opacity duration-300',
            done ? 'opacity-100' : 'opacity-0',
          )}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-bright" />
          {statusLabel}
        </span>
        <span className="text-[0.75rem] text-paper/35">Illustrative payload</span>
      </div>
    </div>
  );
}
