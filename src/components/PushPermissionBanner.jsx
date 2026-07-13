'use client'

import { BellRing, X } from 'lucide-react'
import { usePushNotifications } from '@/hooks/usePushNotifications'

/**
 * Banner pedindo permissão de notificação push (estilo WhatsApp).
 */
export default function PushPermissionBanner() {
  const { showPrompt, busy, enable, dismissPrompt } = usePushNotifications()

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[110] mx-auto max-w-md sm:left-auto">
      <div className="rounded-2xl border border-cp-border bg-cp-bg p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cp-accent/15 text-cp-accent">
            <BellRing className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-cp-text">Ativar notificações</p>
            <p className="mt-1 text-xs leading-relaxed text-cp-muted">
              Receba lembretes motivacionais no celular quando ficar um tempo sem estudar — mesmo com o
              app fechado.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={enable}
                disabled={busy}
                className="rounded-xl bg-cp-accent px-3.5 py-2 text-xs font-semibold text-cp-bg transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Ativando…' : 'Ativar agora'}
              </button>
              <button
                type="button"
                onClick={dismissPrompt}
                disabled={busy}
                className="rounded-xl border border-cp-border px-3.5 py-2 text-xs font-semibold text-cp-muted transition hover:bg-cp-surface hover:text-cp-text"
              >
                Agora não
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissPrompt}
            className="rounded-lg p-1 text-cp-muted transition hover:bg-cp-surface hover:text-cp-text"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
