'use client'

/** Fundo tech elegante — aurora colorida + grade refinada */
export default function TechBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-cp-bg transition-colors duration-500" />

      <div className="cp-aurora cp-aurora-1 absolute -left-[20%] -top-[30%] h-[70vh] w-[70vw] rounded-full blur-[120px]" />
      <div className="cp-aurora cp-aurora-2 absolute -right-[15%] top-[10%] h-[60vh] w-[60vw] rounded-full blur-[140px] [animation-delay:6s]" />
      <div className="cp-aurora cp-aurora-3 absolute bottom-[-20%] left-[20%] h-[50vh] w-[60vw] rounded-full blur-[100px] [animation-delay:12s]" />

      <div className="cp-dot-grid absolute inset-0 opacity-50" />
      <div className="cp-line-grid absolute inset-0 opacity-40" />

      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, var(--cp-bg) 75%)',
        }}
      />
    </div>
  )
}
