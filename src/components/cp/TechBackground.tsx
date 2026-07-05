'use client'

import Image from 'next/image'

/** Fundo leve — gradientes estáticos + logo watermark opaca */
export default function TechBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-cp-bg" />

      {/* Gradientes estáticos (sem animação/blur pesado) */}
      <div
        className="absolute -left-[15%] -top-[25%] h-[55vh] w-[55vw] rounded-full opacity-60"
        style={{ background: 'radial-gradient(circle, var(--cp-aurora-1) 0%, transparent 70%)' }}
      />
      <div
        className="absolute -right-[10%] top-[5%] h-[45vh] w-[45vw] rounded-full opacity-50"
        style={{ background: 'radial-gradient(circle, var(--cp-aurora-2) 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-15%] left-[15%] h-[40vh] w-[50vw] rounded-full opacity-40"
        style={{ background: 'radial-gradient(circle, var(--cp-aurora-3) 0%, transparent 70%)' }}
      />

      {/* Logo watermark opaca — visível em dashboard, flashcards, edital, etc. */}
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

      <div className="cp-dot-grid absolute inset-0 opacity-30" />

      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, var(--cp-bg) 78%)',
        }}
      />
    </div>
  )
}
