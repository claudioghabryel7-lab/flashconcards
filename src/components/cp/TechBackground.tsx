'use client'

import Image from 'next/image'

/** Fundo leve — gradientes estáticos + logo watermark opaca */
export default function TechBackground({ showLogo = true }: { showLogo?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-cp-bg" />

      {/* % do pai (não vw) — evita expandir a largura do documento no iOS Safari */}
      <div
        className="absolute -left-[15%] -top-[25%] h-[55%] w-[55%] rounded-full opacity-60"
        style={{ background: 'radial-gradient(circle, var(--cp-aurora-1) 0%, transparent 70%)' }}
      />
      <div
        className="absolute -right-[10%] top-[5%] h-[45%] w-[45%] rounded-full opacity-50"
        style={{ background: 'radial-gradient(circle, var(--cp-aurora-2) 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-15%] left-[15%] h-[40%] w-[50%] rounded-full opacity-40"
        style={{ background: 'radial-gradient(circle, var(--cp-aurora-3) 0%, transparent 70%)' }}
      />

      {showLogo && (
        <div className="absolute left-1/2 top-[42%] max-w-[min(480px,70%)] -translate-x-1/2 -translate-y-1/2">
          <Image
            src="/course-icons/logo.png"
            alt=""
            width={480}
            height={480}
            className="h-auto w-full max-w-full opacity-[var(--cp-watermark-opacity)]"
            priority={false}
          />
        </div>
      )}
    </div>
  )
}
