'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { PackagePlus, Warehouse, Plane, MapPin, CheckCircle2 } from 'lucide-react';
import { useSkin } from '@/lib/providers/SkinProvider';

interface StepCopy {
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
}

interface Step extends StepCopy {
  image: string;
}

const STEP_COPY: StepCopy[] = [
  {
    title: '01. Vous declarez',
    body: "Decrivez votre colis en 30 secondes : poids, contenu, destinataire. On s'occupe du reste.",
    Icon: PackagePlus,
  },
  {
    title: '02. Pris en charge',
    body: 'Notre agent passe chez vous, scanne le colis et confirme la prise en charge avec preuve photo.',
    Icon: Warehouse,
  },
  {
    title: '03. En transit',
    body: "Air, route ou mer - vous voyez le mode de transport, l'heure de depart et celle prevue d'arrivee.",
    Icon: Plane,
  },
  {
    title: '04. En tournee locale',
    body: "Une fois sur place, le coursier scanne le colis. Vous suivez sa position en temps reel jusqu'a chez vous.",
    Icon: MapPin,
  },
  {
    title: '05. Livre.',
    body: 'Signature electronique. Photo de remise. Une notification, et tout est dans votre historique.',
    Icon: CheckCircle2,
  },
];

export function ParcelJourney() {
  const { resolved } = useSkin();
  const journeyImages = resolved.images.journey ?? [];
  const STEPS: Step[] = STEP_COPY.map((c, i) => ({
    ...c,
    image: journeyImages[i] ?? journeyImages[journeyImages.length - 1] ?? resolved.images.hero,
  }));
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  return (
    <section id="journey" ref={containerRef} className="relative">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 pt-24 pb-6 pointer-events-none">
        <div
          className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
          style={{
            background: 'linear-gradient(180deg, var(--skin-background) 70%, transparent)',
          }}
        >
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-block text-xs font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--skin-primary)' }}
          >
            La vie d'un colis
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            De votre main a celle de votre destinataire,{' '}
            <span className="skin-gradient-text">en cinq scenes.</span>
          </motion.h2>
        </div>
      </div>

      {/* Sticky stage with progress line + steps */}
      <div className="relative">
        {STEPS.map((step, i) => (
          <Step key={i} step={step} index={i} total={STEPS.length} progress={scrollYProgress} />
        ))}
      </div>
    </section>
  );
}

function Step({
  step,
  index,
  total,
}: {
  step: Step;
  index: number;
  total: number;
  progress: ReturnType<typeof useScroll>['scrollYProgress'];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const opacity = useTransform(
    scrollYProgress,
    [0.1, 0.35, 0.65, 0.95],
    [0, 1, 1, 0],
  );
  const scale = useTransform(scrollYProgress, [0.2, 0.5, 0.8], [0.92, 1, 0.95]);

  const Icon = step.Icon;
  const isOdd = index % 2 === 1;

  return (
    <div ref={ref} className="relative min-h-screen flex items-center">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <motion.div
          style={{ y, opacity }}
          className={isOdd ? 'lg:order-2' : ''}
        >
          <div
            className="inline-flex h-12 w-12 items-center justify-center skin-radius"
            style={{
              background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
              color: 'var(--skin-primary)',
            }}
          >
            <Icon className="h-6 w-6" />
          </div>
          <h3
            className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            {step.title}
          </h3>
          <p
            className="mt-4 max-w-md text-base leading-relaxed"
            style={{ color: 'var(--skin-muted)' }}
          >
            {step.body}
          </p>
          <div
            className="mt-6 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--skin-primary)' }}
          >
            Etape {index + 1} / {total}
          </div>
        </motion.div>

        <motion.div
          style={{ scale, opacity }}
          className={isOdd ? 'lg:order-1' : ''}
        >
          <div
            className="relative overflow-hidden skin-radius-lg skin-shadow"
            style={{ aspectRatio: '4 / 3' }}
          >
            <img
              src={step.image}
              alt={step.title}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
            <div
              className="absolute inset-x-0 bottom-0 h-1/3"
              style={{
                background:
                  'linear-gradient(to top, color-mix(in oklab, var(--skin-foreground) 60%, transparent), transparent)',
              }}
            />
            <div
              className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs font-semibold"
              style={{ color: '#fff' }}
            >
              <span className="px-2 py-1 skin-radius-sm bg-black/40 backdrop-blur-md">
                #STEP-{String(index + 1).padStart(2, '0')}
              </span>
              <span className="px-2 py-1 skin-radius-sm bg-black/40 backdrop-blur-md">
                LIVE
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
