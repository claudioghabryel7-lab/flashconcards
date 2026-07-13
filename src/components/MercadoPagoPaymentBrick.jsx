import { useEffect, useRef, useState } from 'react'
import { FIREBASE_FUNCTIONS } from '../config/firebaseFunctions'

function loadMercadoPagoSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-mp-sdk="v2"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.MercadoPago))
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar SDK MP')))
      if (window.MercadoPago) resolve(window.MercadoPago)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.async = true
    script.dataset.mpSdk = 'v2'
    script.onload = () => resolve(window.MercadoPago)
    script.onerror = () => reject(new Error('Falha ao carregar SDK do Mercado Pago'))
    document.body.appendChild(script)
  })
}

/**
 * Payment Brick — Checkout Transparente (PIX, boleto e cartão no site).
 * Sem wallet do MP (evita tela de login).
 */
export default function MercadoPagoPaymentBrick({
  amount,
  description,
  transactionId,
  userEmail,
  userName,
  courseId,
  onSuccess,
  onPending,
  onError,
}) {
  const containerId = useRef(`paymentBrick_${transactionId || 'checkout'}`).current
  const controllerRef = useRef(null)
  const onSuccessRef = useRef(onSuccess)
  const onPendingRef = useRef(onPending)
  const onErrorRef = useRef(onError)
  onSuccessRef.current = onSuccess
  onPendingRef.current = onPending
  onErrorRef.current = onError
  const [loadingBrick, setLoadingBrick] = useState(true)
  const [bootError, setBootError] = useState('')

  useEffect(() => {
    let cancelled = false

    const mount = async () => {
      setLoadingBrick(true)
      setBootError('')
      try {
        const cfgRes = await fetch(FIREBASE_FUNCTIONS.getMercadoPagoPublicConfig, {
          method: 'GET',
        })
        const cfg = await cfgRes.json().catch(() => ({}))
        if (!cfgRes.ok || !cfg.publicKey) {
          throw new Error(cfg.message || 'Public key do Mercado Pago indisponível.')
        }

        const MercadoPago = await loadMercadoPagoSdk()
        if (cancelled) return

        const mp = new MercadoPago(cfg.publicKey, { locale: 'pt-BR' })
        const bricksBuilder = mp.bricks()

        if (controllerRef.current?.unmount) {
          try {
            controllerRef.current.unmount()
          } catch (_) {
            /* ignore */
          }
        }

        controllerRef.current = await bricksBuilder.create('payment', containerId, {
          initialization: {
            amount: Number(Number(amount).toFixed(2)),
            payer: {
              email: userEmail || undefined,
            },
          },
          localization: {
            locale: 'pt-BR',
          },
          customization: {
            visual: {
              style: {
                theme: 'dark',
              },
            },
            paymentMethods: {
              // Sem mercadoPago/wallet → não força login na conta MP
              ticket: 'all',
              bankTransfer: 'all',
              creditCard: 'all',
              debitCard: 'all',
              maxInstallments: 12,
            },
          },
          callbacks: {
            onReady: () => {
              if (!cancelled) setLoadingBrick(false)
            },
            onError: (err) => {
              console.error('[Payment Brick]', err)
              if (!cancelled) {
                setLoadingBrick(false)
                onErrorRef.current?.(err?.message || 'Erro no formulário de pagamento.')
              }
            },
            onSubmit: ({ formData }) =>
              new Promise(async (resolve, reject) => {
                try {
                  const res = await fetch(FIREBASE_FUNCTIONS.processBrickPayment, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      transactionId,
                      formData,
                      amount,
                      description,
                      userEmail,
                      userName,
                      courseId,
                    }),
                  })
                  const data = await res.json().catch(() => ({}))
                  if (!res.ok) {
                    throw new Error(data.message || data.error || 'Falha ao processar pagamento.')
                  }

                  if (data.status === 'approved') {
                    onSuccessRef.current?.(data)
                    resolve()
                    return
                  }

                  // PIX / boleto ficam pending com QR ou boleto
                  onPendingRef.current?.(data)
                  resolve()
                } catch (err) {
                  onErrorRef.current?.(err.message || 'Erro ao processar pagamento.')
                  reject()
                }
              }),
          },
        })
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setBootError(err.message || 'Não foi possível carregar o checkout.')
          setLoadingBrick(false)
          onErrorRef.current?.(err.message)
        }
      }
    }

    mount()

    return () => {
      cancelled = true
      try {
        controllerRef.current?.unmount?.()
      } catch (_) {
        /* ignore */
      }
      controllerRef.current = null
    }
  }, [amount, description, transactionId, userEmail, userName, courseId, containerId])

  return (
    <div className="w-full">
      {loadingBrick ? (
        <p className="mb-3 text-center text-sm text-cp-muted">Carregando pagamento seguro…</p>
      ) : null}
      {bootError ? (
        <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {bootError}
        </p>
      ) : null}
      <div id={containerId} className="min-h-[320px] w-full" />
    </div>
  )
}
