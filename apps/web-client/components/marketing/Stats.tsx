'use client';

import { motion, useInView, useMotionValue, animate } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

const STATS = [
  { value: 1200000, suffix: '+', label: 'colis livres', round: 1000 },
  { value: 99.4, suffix: '%', label: 'livres a temps', decimals: 1 },
  { value: 4.9, suffix: '/5', label: 'note moyenne', decimals: 1 },
  { value: 14, suffix: 'pays', label: 'couverts en Afrique' },
];

const LOGOS = [
  'TRANSAF',
  'CARGO-X',
  'POSTE PRO',
  'AFRIK-LINE',
  'KAMERPAY',
  'EXPRESS24',
  'OCEAN-LOG',
  'SKY-FREIGHT',
];

export function Stats() {
  return (
    <section id="stats" className="relative py-24 sm:py-32">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, color-mix(in oklab, var(--skin-primary) 18%, transparent), transparent 60%)',
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {STATS.map((s, i) => (
            <StatItem key={s.label} index={i} {...s} />
          ))}
        </div>

        <div className="mt-20">
          <p
            className="text-center text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--skin-muted)' }}
          >
            Ils nous font confiance
          </p>
          <div className="mt-6 overflow-hidden">
            <div className="marquee">
              {[...LOGOS, ...LOGOS].map((l, i) => (
                <span
                  key={`${l}-${i}`}
                  className="text-2xl font-black tracking-tight opacity-50 hover:opacity-100 transition-opacity skin-font-heading"
                  style={{ color: 'var(--skin-foreground)' }}
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatItem({
  value,
  suffix,
  label,
  decimals = 0,
  index,
}: {
  value: number;
  suffix?: string;
  label: string;
  decimals?: number;
  round?: number;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const motion_ = useMotionValue(0);
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    const fmt = (v: number) =>
      decimals
        ? v.toFixed(decimals)
        : v >= 1_000_000
        ? `${(v / 1_000_000).toFixed(1)}M`
        : v >= 1_000
        ? `${Math.round(v / 1000)}k`
        : Math.round(v).toString();
    const unsub = motion_.on('change', (v) => setDisplay(fmt(v)));
    setDisplay(fmt(motion_.get()));
    return unsub;
  }, [motion_, decimals]);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(motion_, value, {
      duration: 1.8,
      ease: 'easeOut',
    });
    return () => controls.stop();
  }, [inView, motion_, value]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className="text-center"
    >
      <div className="text-4xl font-extrabold tracking-tight sm:text-5xl skin-font-heading skin-gradient-text">
        {display}
        <span>{suffix}</span>
      </div>
      <p
        className="mt-2 text-sm font-medium"
        style={{ color: 'var(--skin-muted)' }}
      >
        {label}
      </p>
    </motion.div>
  );
}
