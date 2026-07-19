'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  ensurePixCopyPaste,
  isValidPixCopyPaste,
  normalizePixPayload,
  processBrickPayment,
} from '@/utils/pixCheckout'

let sdkLoadPromise = null

function loadMercadoPagoSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago)

  if (sdkLoadPromise) return sdkLoadPromise

  sdkLoadPromise = new Promise((resolve, reject) => {
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
      existing.addEventListener('load', done, { once: true })
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar SDK MP')), {
        once: true,
      })
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

  return sdkLoadPromise
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

async function processCheckoutViaFirestoreFirst(ctx) {
  const payload = {
    transactionId: ctx.transactionId,
    formData: ctx.formData,
    amount: ctx.amount,
    description: ctx.description,
    userEmail: ctx.userEmail,
    userName: ctx.userName,
    courseId: ctx.courseId,
  }

  try {
    return normalizePixPayload(await processBrickPayment(payload))
  } catch (httpErr) {
    console.warn('[Payment Brick] HTTP falhou, tentando Firestore+API', httpErr?.message || httpErr)
    return normalizePixPayload(await processBrickViaFirestore(payload, ctx.abortSignal))
  }
}

async function finalizePixIfNeeded(data, ctx) {
  if (ctx.method !== 'pix') return normalizePixPayload(data || {})
  const normalized = normalizePixPayload(data || {})
  if (isValidPixCopyPaste(normalized.pixCopyPaste)) return normalized

  return ensurePixCopyPaste({
    existing: normalized,
    amount: ctx.amount,
    description: ctx.description,
    transactionId: ctx.transactionId,
    userEmail: ctx.userEmail,
    userName: ctx.userName,
    courseId: ctx.courseId,
  })
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

async function fetchMercadoPagoPublicConfig() {
  const res = await fetch('/api/mercadopago/public-config', { method: 'GET' })
  const cfg = await res.json().catch(() => ({}))
  if (!res.ok || !cfg.publicKey) {
    throw new Error(cfg.message || 'Public key do Mercado Pago indisponível.')
  }
  return cfg
}

function processBrickViaFirestore(
  { transactionId, formData, amount, description, userEmail, userName, courseId },
  abortSignal,
) {
  const requestId = `${String(transactionId).slice(0, 40)}_${Date.now().toString(36)}`
  const ref = doc(db, 'paymentBrickRequests', requestId)

  return new Promise(async (resolve, reject) => {
    let settled = false
    let unsub = () => {}

    const cleanup = () => {
      clearTimeout(timeout)
      try {
        unsub()
      } catch (_) {
        /* ignore */
      }
    }

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('Tempo esgotado ao processar o pagamento. Tente novamente.'))
    }, 90000)

    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('Pagamento cancelado.'))
    }

    if (abortSignal?.aborted) {
      onAbort()
      return
    }
    abortSignal?.addEventListener('abort', onAbort, { once: true })

    unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists() || settled) return
        const data = snap.data() || {}
        if (data.state === 'done' && data.result) {
          settled = true
          cleanup()
          abortSignal?.removeEventListener('abort', onAbort)
          resolve(data.result)
          return
        }
        if (data.state === 'error') {
          settled = true
          cleanup()
          abortSignal?.removeEventListener('abort', onAbort)
          reject(new Error(data.errorMessage || 'Falha ao processar pagamento.'))
        }
      },
      (err) => {
        if (settled) return
        settled = true
        cleanup()
        abortSignal?.removeEventListener('abort', onAbort)
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
      fetch('/api/payments/process-brick-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      }).catch(() => {})
    } catch (err) {
      if (!settled) {
        settled = true
        cleanup()
        abortSignal?.removeEventListener('abort', onAbort)
        reject(err)
      }
    }
  })
}

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
  const txnSuffix = String(transactionId || 'new').slice(-12)
  const containerId = `mp_brick_${reactId}_${safeMethod}_${txnSuffix}`

  const controllerRef = useRef(null)
  const submitAbortRef = useRef(null)
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
      submitAbortRef.current?.abort()
      submitAbortRef.current = null
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
                if (!cancelled && token === mountToken) {
                  setTimeout(() => {
                    if (!cancelled && token === mountToken) setLoadingBrick(false)
                  }, 2000)
                }
                return
              }
              console.error('[Payment Brick]', err?.cause || err?.message || err)
              if (!cancelled && token === mountToken) {
                setLoadingBrick(false)
                const msg = formatBrickError(err)
                if (safeMethod === 'pix') {
                  onErrorRef.current?.(
                    'Checkout PIX indisponível. Gerando código alternativo…',
                  )
                } else {
                  setBootError(msg)
                  onErrorRef.current?.(msg)
                }
              }
            },
            onSubmit: ({ formData }) =>
              new Promise(async (resolve, reject) => {
                submitAbortRef.current?.abort()
                const abortController = new AbortController()
                submitAbortRef.current = abortController

                const pixCtx = {
                  method: safeMethod,
                  amount: amountNumber,
                  description,
                  transactionId,
                  userEmail,
                  userName,
                  courseId,
                  formData,
                  abortSignal: abortController.signal,
                }

                const finishPending = (payload) => {
                  onPendingRef.current?.(payload)
                  resolve()
                }

                try {
                  let data = await processCheckoutViaFirestoreFirst(pixCtx)
                  data = await finalizePixIfNeeded(data, pixCtx)

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
                    const fallback = await finalizePixIfNeeded({}, pixCtx)
                    if (isValidPixCopyPaste(fallback.pixCopyPaste)) {
                      finishPending({ ...data, ...fallback })
                      return
                    }
                  }

                  throw new Error('Não foi possível gerar o PIX agora. Tente novamente em instantes.')
                } catch (submitErr) {
                  if (abortController.signal.aborted) {
                    reject()
                    return
                  }
                  if (safeMethod === 'pix') {
                    try {
                      const fallback = await finalizePixIfNeeded({}, pixCtx)
                      if (isValidPixCopyPaste(fallback.pixCopyPaste)) {
                        finishPending(fallback)
                        return
                      }
                    } catch (fallbackErr) {
                      console.warn('[Payment Brick] fallback PIX falhou', fallbackErr)
                    }
                  }
                  onErrorRef.current?.(
                    safeMethod === 'pix'
                      ? 'Não foi possível gerar o PIX. Aguarde ou tente novamente.'
                      : submitErr.message || 'Erro ao processar pagamento.',
                  )
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
          if (safeMethod === 'pix') {
            onErrorRef.current?.('Gerando PIX alternativo…')
          } else {
            onErrorRef.current?.(msg)
          }
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
