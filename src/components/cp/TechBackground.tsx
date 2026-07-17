'use client'

import Image from 'next/image'

/** Fundo full-bleed — gradientes suaves sem bordas quadradas visíveis */
export default function TechBackground({ showLogo = true }: { showLogo?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-cp-bg" />

      <div
        className="absolute inset-0 opacity-70"
        style={{
          background: [
            'radial-gradient(ellipse 120% 90% at -8% -15%, var(--cp-aurora-1), transparent 58%)',
            'radial-gradient(ellipse 100% 80% at 108% 8%, var(--cp-aurora-2), transparent 55%)',
            'radial-gradient(ellipse 110% 85% at 35% 108%, var(--cp-aurora-3), transparent 60%)',
            'radial-gradient(ellipse 80% 60% at 50% 35%, rgba(34, 211, 238, 0.06), transparent 70%)',
          ].join(', '),
        }}
      />

      {showLogo && (
        <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
          <Image
            src="/course-icons/logo.png"
            alt=""
            width={480}
            height={480}
            className="cp-hero-watermark h-auto w-[min(72vw,380px)] max-w-none select-none sm:w-[420px]"
            loading="lazy"
          />
        </div>
      )}

      <div className="cp-dot-grid absolute inset-0 opacity-30" />

      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, var(--cp-bg) 82%)',
        }}
      />
    </div>
  )
}
