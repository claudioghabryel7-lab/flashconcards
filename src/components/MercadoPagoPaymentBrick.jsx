'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  isValidPixCopyPaste,
  normalizePixPayload,
  requestPixPayment,
} from '@/utils/pixCheckout'

function loadMercadoPagoSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-mp-sdk="v2"]')
    if (existing) {
      const done = () =>
        window.MercadoPago
          ? resolve(window.MercadoPago)
          : reject(new Error('SDK Mercado Pago indisponível'))
      if (window.MercadoPago) {
        done()
        return
      }
      existing.addEventListener('load', done)
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar SDK MP')))
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

function buildPaymentMethods(method) {
  if (method === 'card') {
    return {
      creditCard: 'all',
      debitCard: 'all',
      minInstallments: 1,
      maxInstallments: 6,
    }
  }
  return {
    bankTransfer: 'all',
  }
}

function isIgnorableBrickError(err) {
  if (err == null) return true
  if (typeof err === 'object') {
    const keys = Object.keys(err)
    if (keys.length === 0) return true
    if (err.type === 'non_critical') return true
    if (err.cause === 'already_initialized') return true
    if (err.cause === 'container_not_found' && !err.message) return true
    const msg = String(err.message || err.cause || '').toLowerCase()
    if (msg.includes('qr') || msg.includes('qrcode') || msg.includes('bank_transfer')) {
      return true
    }
  }
  return false
}

async function ensurePixCheckoutData(data, ctx) {
  const normalized = normalizePixPayload(data || {})
  if (ctx.method !== 'pix' || isValidPixCopyPaste(normalized.pixCopyPaste)) {
    return normalized
  }

  try {
    return await requestPixPayment({
      amount: ctx.amount,
      description: ctx.description,
      transactionId: ctx.transactionId,
      userEmail: ctx.userEmail,
      userName: ctx.userName,
    })
  } catch (err) {
    console.warn('[Payment Brick] fallback PIX indisponível', err?.message || err)
    return normalized
  }
}

function formatBrickError(err) {
  if (!err) return 'Erro no formulário de pagamento.'
  if (typeof err === 'string') return err
  return (
    err.message ||
    err.cause ||
    (typeof err === 'object' ? JSON.stringify(err) : 'Erro no formulário de pagamento.')
  )
}

/** Public key same-origin — evita CORS / Rate exceeded das Cloud Functions. */
async function fetchMercadoPagoPublicConfig() {
  const res = await fetch('/api/mercadopago/public-config', { method: 'GET' })
  const cfg = await res.json().catch(() => ({}))
  if (!res.ok || !cfg.publicKey) {
    throw new Error(cfg.message || 'Public key do Mercado Pago indisponível.')
  }
  return cfg
}

/**
 * Processa pagamento via Firestore trigger (não usa cloudfunctions.net HTTPS).
 * Contorna 429 Rate exceeded / falso erro de CORS.
 */
function processBrickViaFirestore({
  transactionId,
  formData,
  amount,
  description,
  userEmail,
  userName,
  courseId,
}) {
  const requestId = `${String(transactionId).slice(0, 40)}_${Date.now().toString(36)}`
  const ref = doc(db, 'paymentBrickRequests', requestId)

  return new Promise(async (resolve, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      unsub()
      reject(new Error('Tempo esgotado ao processar o pagamento. Tente novamente.'))
    }, 90000)

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists() || settled) return
        const data = snap.data() || {}
        if (data.state === 'done' && data.result) {
          settled = true
          clearTimeout(timeout)
          unsub()
          resolve(data.result)
          return
        }
        if (data.state === 'error') {
          settled = true
          clearTimeout(timeout)
          unsub()
          reject(new Error(data.errorMessage || 'Falha ao processar pagamento.'))
        }
      },
      (err) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        reject(err)
      },
    )

    try {
      await setDoc(ref, {
        transactionId: String(transactionId),
        formData,
        amount: Number(amount),
        description: description || null,
        userEmail: userEmail || null,
        userName: userName || null,
        courseId: courseId || null,
        state: 'pending',
        createdAt: serverTimestamp(),
      })
    } catch (err) {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        unsub()
        reject(err)
      }
    }
  })
}

/**
 * Payment Brick — Checkout Transparente.
 * method: 'pix' | 'card'
 */
export default function MercadoPagoPaymentBrick({
  amount,
  description,
  transactionId,
  userEmail,
  userName,
  courseId,
  method = 'pix',
  onSuccess,
  onPending,
  onError,
}) {
  const reactId = useId().replace(/:/g, '')
  const safeMethod = method === 'card' ? 'card' : 'pix'
  const containerId = `mp_brick_${reactId}_${safeMethod}`

  const controllerRef = useRef(null)
  const onSuccessRef = useRef(onSuccess)
  const onPendingRef = useRef(onPending)
  const onErrorRef = useRef(onError)
  onSuccessRef.current = onSuccess
  onPendingRef.current = onPending
  onErrorRef.current = onError

  const [loadingBrick, setLoadingBrick] = useState(true)
  const [bootError, setBootError] = useState('')
  const [domReady, setDomReady] = useState(false)

  useEffect(() => {
    setDomReady(true)
  }, [])

  useEffect(() => {
    if (!domReady) return undefined

    let cancelled = false
    let mountToken = 0

    const unmountController = () => {
      try {
        controllerRef.current?.unmount?.()
      } catch (_) {
        /* ignore */
      }
      controllerRef.current = null
      const el = document.getElementById(containerId)
      if (el) el.innerHTML = ''
    }

    const mount = async () => {
      const token = ++mountToken
      setLoadingBrick(true)
      setBootError('')
      unmountController()

      try {
        const amountNumber = Number(Number(amount).toFixed(2))
        if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
          throw new Error('Valor do pagamento inválido.')
        }

        const cfg = await fetchMercadoPagoPublicConfig()
        if (cancelled || token !== mountToken) return

        const MercadoPago = await loadMercadoPagoSdk()
        if (cancelled || token !== mountToken) return

        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        if (cancelled || token !== mountToken) return

        const container = document.getElementById(containerId)
        if (!container) {
          throw new Error('Container do checkout não encontrado. Recarregue a página.')
        }
        container.innerHTML = ''

        const mp = new MercadoPago(cfg.publicKey, { locale: 'pt-BR' })
        const bricksBuilder = mp.bricks()

        controllerRef.current = await bricksBuilder.create('payment', containerId, {
          initialization: {
            amount: amountNumber,
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
                theme: 'default',
              },
              defaultPaymentOption:
                safeMethod === 'card'
                  ? { creditCardForm: true }
                  : { bankTransferForm: true },
            },
            paymentMethods: buildPaymentMethods(safeMethod),
          },
          callbacks: {
            onReady: () => {
              if (!cancelled && token === mountToken) setLoadingBrick(false)
            },
            onError: (err) => {
              if (isIgnorableBrickError(err)) {
                console.warn('[Payment Brick] aviso ignorado', err)
                return
              }
              console.error('[Payment Brick]', err?.cause || err?.message || err)
              if (!cancelled && token === mountToken) {
                setLoadingBrick(false)
                const msg = formatBrickError(err)
                setBootError(msg)
                onErrorRef.current?.(msg)
              }
            },
            onSubmit: ({ formData }) =>
              new Promise(async (resolve, reject) => {
                const pixCtx = {
                  method: safeMethod,
                  amount: amountNumber,
                  description,
                  transactionId,
                  userEmail,
                  userName,
                }

                const finishPending = (payload) => {
                  onPendingRef.current?.(payload)
                  resolve()
                }

                try {
                  let data = await processBrickViaFirestore({
                    transactionId,
                    formData,
                    amount: amountNumber,
                    description,
                    userEmail,
                    userName,
                    courseId,
                  })

                  data = await ensurePixCheckoutData(data, pixCtx)

                  if (data.status === 'approved') {
                    onSuccessRef.current?.(data)
                    resolve()
                    return
                  }

                  if (isValidPixCopyPaste(data.pixCopyPaste) || data.ticketUrl) {
                    finishPending(data)
                    return
                  }

                  if (safeMethod === 'pix') {
                    const fallback = await ensurePixCheckoutData({}, pixCtx)
                    if (isValidPixCopyPaste(fallback.pixCopyPaste)) {
                      finishPending({ ...data, ...fallback })
                      return
                    }
                  }

                  throw new Error('Não foi possível gerar o PIX agora. Tente novamente em instantes.')
                } catch (submitErr) {
                  if (safeMethod === 'pix') {
                    try {
                      const fallback = await ensurePixCheckoutData({}, pixCtx)
                      if (isValidPixCopyPaste(fallback.pixCopyPaste)) {
                        finishPending(fallback)
                        return
                      }
                    } catch (fallbackErr) {
                      console.warn('[Payment Brick] fallback PIX falhou', fallbackErr)
                    }
                  }
                  onErrorRef.current?.(submitErr.message || 'Erro ao processar pagamento.')
                  reject()
                }
              }),
          },
        })

        if (cancelled || token !== mountToken) {
          unmountController()
        }
      } catch (err) {
        console.error('[Payment Brick] mount', err)
        if (!cancelled && token === mountToken) {
          const msg = err?.message || 'Não foi possível carregar o checkout.'
          setBootError(msg)
          setLoadingBrick(false)
          onErrorRef.current?.(msg)
        }
      }
    }

    mount()

    return () => {
      cancelled = true
      mountToken += 1
      unmountController()
    }
  }, [
    domReady,
    amount,
    description,
    transactionId,
    userEmail,
    userName,
    courseId,
    containerId,
    safeMethod,
  ])

  return (
    <div className="w-full">
      {loadingBrick ? (
        <p className="mb-3 text-center text-sm text-cp-muted">
          {safeMethod === 'card'
            ? 'Carregando pagamento com cartão…'
            : 'Carregando pagamento PIX…'}
        </p>
      ) : null}
      {bootError ? (
        <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {bootError}
        </p>
      ) : null}
      <div
        id={containerId}
        className="min-h-[320px] w-full overflow-hidden rounded-2xl bg-white p-2 text-neutral-900"
      />
    </div>
  )
}
