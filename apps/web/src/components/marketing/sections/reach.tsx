'use client';

import { motion } from 'framer-motion';
import { EASE, useReducedMotionSafe } from '@/lib/motion';
import { Counter } from '@/components/marketing/ui/counter';
import { Pill } from '@/components/marketing/ui/pill';
import { Reveal } from '@/components/marketing/ui/reveal';

const COLS = 42;
const ROWS = 20;
const STEP = 4;

/**
 * Landmasses as ellipses on a 42×20 grid. Computed, not random, so the server
 * and the client draw the identical map and hydration stays quiet.
 */
const landmasses = [
  { cx: 8, cy: 5.5, rx: 4.6, ry: 3 },
  { cx: 11, cy: 9, rx: 1.6, ry: 1.4 },
  { cx: 13, cy: 13.5, rx: 2.2, ry: 3.4 },
  { cx: 21.5, cy: 5, rx: 2.6, ry: 2 },
  { cx: 22.5, cy: 11, rx: 3.2, ry: 3.6 },
  { cx: 30, cy: 6, rx: 6.5, ry: 3.6 },
  { cx: 33, cy: 10.5, rx: 2.2, ry: 1.6 },
  { cx: 35.5, cy: 14.5, rx: 2.4, ry: 1.6 },
];

const dots: { x: number; y: number }[] = [];
for (let row = 0; row < ROWS; row += 1) {
  for (let col = 0; col < COLS; col += 1) {
    const inside = landmasses.some(
      (shape) => ((col - shape.cx) / shape.rx) ** 2 + ((row - shape.cy) / shape.ry) ** 2 <= 1,
    );
    if (inside) dots.push({ x: col * STEP, y: row * STEP });
  }
}

const markers = [
  { x: 8 * STEP, y: 5 * STEP },
  { x: 13 * STEP, y: 13 * STEP },
  { x: 21 * STEP, y: 5 * STEP },
  { x: 23 * STEP, y: 11 * STEP },
  { x: 31 * STEP, y: 6 * STEP },
  { x: 35 * STEP, y: 14 * STEP },
];

const stats = [
  { value: 200, suffix: '+', label: 'Countries where Visa is accepted' },
  { value: 6, suffix: ' dp', label: 'Decimal places kept on every amount' },
  { value: 147, suffix: '', label: 'Tests covering the money path' },
  { value: 0, suffix: '', label: 'Balances read from a cache' },
];

export function Reach() {
  const reduce = useReducedMotionSafe();

  return (
    <section aria-labelledby="reach-heading" className="bg-forest py-24 md:py-32">
      <div className="mx-auto grid w-full max-w-container items-center gap-16 px-6 md:px-8 lg:grid-cols-2 lg:gap-8">
        <div>
          <Reveal>
            <Pill tone="onDark">Where a card works</Pill>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 id="reach-heading" className="mt-6 max-w-[14ch] font-display text-h2 font-medium text-paper">
              A card that travels as far as the network does.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 max-w-lg text-body-lg text-paper/70">
              Cards are issued on Visa, so acceptance is the network&rsquo;s, not ours. What we
              control is the part behind it: the balance, the limits and the answer given to each
              authorization.
            </p>
          </Reveal>

          <div className="mt-12 grid grid-cols-2 gap-x-8 gap-y-10">
            {stats.map((stat, index) => (
              <Reveal key={stat.label} delay={0.24 + index * 0.08}>
                <p className="font-display text-[clamp(2.25rem,4vw,3rem)] font-medium tracking-[-0.02em] text-bright">
                  <Counter value={stat.value} suffix={stat.suffix} />
                </p>
                <p className="mt-2 max-w-[22ch] text-[0.875rem] leading-snug text-paper/60">{stat.label}</p>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal scale delay={0.16}>
          <svg
            viewBox={`-4 -4 ${COLS * STEP + 4} ${ROWS * STEP + 4}`}
            className="w-full"
            role="img"
            aria-label="A dotted world map with six highlighted regions"
          >
            {dots.map((dot) => (
              <circle key={`${dot.x}-${dot.y}`} cx={dot.x} cy={dot.y} r="0.9" className="fill-paper/25" />
            ))}

            {markers.map((marker, index) => (
              <g key={`${marker.x}-${marker.y}`}>
                {!reduce ? (
                  <motion.circle
                    cx={marker.x}
                    cy={marker.y}
                    className="fill-bright"
                    initial={{ r: 2, opacity: 0.5 }}
                    animate={{ r: [2, 7], opacity: [0.5, 0] }}
                    transition={{
                      duration: 1.5,
                      ease: EASE,
                      repeat: Infinity,
                      delay: index * 0.25,
                    }}
                  />
                ) : null}
                <circle cx={marker.x} cy={marker.y} r="2" className="fill-bright" />
              </g>
            ))}
          </svg>
        </Reveal>
      </div>
    </section>
  );
}
