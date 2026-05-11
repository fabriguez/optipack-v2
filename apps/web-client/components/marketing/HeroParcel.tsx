'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef } from 'react';

export function HeroParcel() {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [25, -25]), {
    stiffness: 80,
    damping: 18,
  });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-30, 30]), {
    stiffness: 80,
    damping: 18,
  });

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      mx.set((e.clientX - cx) / rect.width);
      my.set((e.clientY - cy) / rect.height);
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [mx, my]);

  const size = 240;
  const half = size / 2;

  return (
    <div
      ref={ref}
      className="relative mx-auto"
      style={{ width: size, height: size, perspective: 1200 }}
    >
      <motion.div
        className="absolute left-1/2 top-1/2 -z-10 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full"
        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: 'radial-gradient(circle, var(--skin-glow), transparent 70%)',
        }}
      />

      <motion.div
        style={{
          width: size,
          height: size,
          transformStyle: 'preserve-3d',
          rotateX,
          rotateY,
        }}
        animate={{ y: [0, -18, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Face translate={`translateZ(${half}px)`} variant="front" />
        <Face translate={`rotateY(180deg) translateZ(${half}px)`} variant="back" />
        <Face translate={`rotateY(90deg) translateZ(${half}px)`} variant="right" />
        <Face translate={`rotateY(-90deg) translateZ(${half}px)`} variant="left" />
        <Face translate={`rotateX(90deg) translateZ(${half}px)`} variant="top" />
        <Face translate={`rotateX(-90deg) translateZ(${half}px)`} variant="bottom" />
      </motion.div>

      <FloatingChip x="-65%" y="-25%" delay={0} label="EXPRESS" />
      <FloatingChip x="105%" y="20%" delay={1.2} label="FRAGILE" />
      <FloatingChip x="-10%" y="115%" delay={0.6} label="TRACKED" />
    </div>
  );
}

function Face({
  translate,
  variant,
}: {
  translate: string;
  variant: 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';
}) {
  const labels: Record<typeof variant, string> = {
    front: 'OPTI',
    back: 'PACK',
    top: 'THIS WAY UP',
    bottom: 'BOTTOM',
    left: 'FRAGILE',
    right: 'AIR',
  };
  return (
    <div
      className="absolute inset-0 flex items-center justify-center text-sm font-bold tracking-[0.2em] text-white"
      style={{
        transform: translate,
        background:
          variant === 'top'
            ? 'linear-gradient(135deg, var(--skin-hero-3), var(--skin-hero-2))'
            : variant === 'bottom'
            ? 'linear-gradient(135deg, var(--skin-hero-1), #000)'
            : 'linear-gradient(135deg, var(--skin-hero-1), var(--skin-hero-2))',
        border: '2px solid rgba(255,255,255,0.15)',
        boxShadow:
          'inset 0 0 60px rgba(0,0,0,0.25), 0 30px 60px -20px var(--skin-glow)',
        backfaceVisibility: 'hidden',
      }}
    >
      <span className="select-none">{labels[variant]}</span>
    </div>
  );
}

function FloatingChip({
  x,
  y,
  delay,
  label,
}: {
  x: string;
  y: string;
  delay: number;
  label: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
      transition={{
        opacity: { duration: 0.6, delay },
        scale: { duration: 0.6, delay },
        y: { duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay },
      }}
      className="absolute select-none px-3 py-1.5 text-xs font-bold tracking-widest skin-radius-sm skin-card"
      style={{ left: x, top: y, color: 'var(--skin-primary)' }}
    >
      {label}
    </motion.div>
  );
}
