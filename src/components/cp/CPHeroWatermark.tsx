'use client'

import Image from 'next/image'

/** Logo watermark — posicionada logo abaixo dos badges do hero */
export default function CPHeroWatermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-6 z-0 -translate-x-1/2 sm:top-7"
    >
      <div className="relative flex items-center justify-center">
        <div className="cp-hero-watermark-glow absolute h-[min(95vw,640px)] w-[min(95vw,640px)] rounded-full blur-3xl" />
        <Image
          src="/course-icons/logo.png"
          alt=""
          width={640}
          height={640}
          priority
          className="cp-hero-watermark relative h-auto w-[min(95vw,520px)] max-w-none select-none sm:w-[580px] lg:w-[640px]"
        />
      </div>
    </div>
  )
}
