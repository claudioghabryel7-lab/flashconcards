'use client'

import LazyImage from '@/components/LazyImage'

type CourseCoverMediaProps = {
  src: string
  alt: string
  className?: string
  imgClassName?: string
  priority?: boolean
  /** Mostra aurora animada por cima da capa estática */
  animated?: boolean
}

/**
 * Capa do curso com overlay tech animado (aurora suave do site).
 * A imagem gerada é estática; o movimento acontece no CSS ao exibir.
 */
export default function CourseCoverMedia({
  src,
  alt,
  className = '',
  imgClassName = 'h-full w-full object-cover transition-transform duration-500 group-hover:scale-105',
  priority = false,
  animated = true,
}: CourseCoverMediaProps) {
  return (
    <div className={`cp-course-cover relative h-full w-full overflow-hidden bg-cp-bg ${className}`}>
      <LazyImage src={src} alt={alt} className={imgClassName} priority={priority} />

      {animated && (
        <div className="cp-course-cover-motion pointer-events-none absolute inset-0 z-[2]" aria-hidden>
          <div className="cp-aurora cp-course-cover-blob cp-course-cover-blob-1" />
          <div className="cp-aurora cp-course-cover-blob cp-course-cover-blob-2" />
          <div className="cp-aurora cp-course-cover-blob cp-course-cover-blob-3" />
          <div className="cp-course-cover-grid" />
          <div className="cp-course-cover-vignette" />
        </div>
      )}
    </div>
  )
}
