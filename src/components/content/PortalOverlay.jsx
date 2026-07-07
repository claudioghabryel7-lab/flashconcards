import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function PortalOverlay({
  open,
  onClose,
  children,
  ariaLabel = 'Painel',
  size = 'default',
}) {
  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const sizeClass =
    size === 'large'
      ? 'max-w-3xl sm:max-h-[90dvh]'
      : 'max-w-lg sm:max-h-[85dvh]'

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className={`flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-cp-border bg-[var(--cp-bg)] shadow-2xl sm:rounded-2xl ${sizeClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
