import Image from 'next/image'
import Link from 'next/link'

type LogoProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  asLink?: boolean
}

const sizes = { sm: 44, md: 56, lg: 68, xl: 88 }

export default function CPLogo({ size = 'md', showText = true, asLink = true }: LogoProps) {
  const px = sizes[size]

  const content = (
    <>
      <Image
        src="/course-icons/logo.png"
        alt="Concurseiro Preditivo"
        width={px}
        height={px}
        className="rounded-2xl transition-transform duration-300 group-hover:scale-[1.03]"
        priority
      />
      {showText && (
        <div className="logo-text leading-none hidden min-[480px]:block min-w-0">
          <p className="truncate font-display text-base font-semibold tracking-tight text-cp-text">
            Concurseiro
          </p>
          <p className="mt-1 truncate font-mono text-[11px] tracking-wider text-cp-muted">
            Preditivo
          </p>
        </div>
      )}
    </>
  )

  if (!asLink) {
    return <div className="inline-flex items-center gap-3.5">{content}</div>
  }

  return (
    <Link href="/" className="group inline-flex min-w-0 max-w-full items-center gap-2.5 sm:gap-3.5">
      {content}
    </Link>
  )
}
