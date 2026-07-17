import { FIREBASE_FUNCTIONS } from '@/config/firebaseFunctions'

/** Valida EMV PIX copia e cola (padrão BR). */
export function isValidPixCopyPaste(code) {
  if (typeof code !== 'string') return false
  const v = code.trim()
  return v.startsWith('000201') && v.length > 40
}

/** Valida base64 de imagem QR. */
export function isValidPixQrBase64(b64) {
  if (typeof b64 !== 'string' || !b64.trim()) return false
  const v = b64.trim().replace(/^data:image\/\w+;base64,/, '')
  if (isValidPixCopyPaste(v)) return false
  return v.length > 80 && /^[A-Za-z0-9+/=]+$/.test(v.slice(0, 24))
}

export function normalizePixPayload(data = {}) {
  let pixCopyPaste = data.pixCopyPaste || data.pix_code || data.qr_code || null
  let pixQrCode = data.pixQrCode || data.pixQrCodeBase64 || data.qr_code_base64 || null

  if (pixCopyPaste && !isValidPixCopyPaste(pixCopyPaste)) {
    if (!pixQrCode && isValidPixQrBase64(pixCopyPaste)) {
      pixQrCode = pixCopyPaste
    }
    pixCopyPaste = null
  }

  if (pixCopyPaste && !isValidPixCopyPaste(pixCopyPaste)) {
    pixCopyPaste = null
  }

  if (pixQrCode && !isValidPixQrBase64(pixQrCode)) {
    pixQrCode = null
  }

  return {
    ...data,
    pixCopyPaste,
    pixQrCode,
    ticketUrl: data.ticketUrl || null,
  }
}

async function parseJsonResponse(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Falha ao processar pagamento.')
  }
  return data
}

/**
 * Processa pagamento do Brick via HTTPS (preferencial).
 */
export async function processBrickPayment({
  transactionId,
  formData,
  amount,
  description,
  userEmail,
  userName,
  courseId,
}) {
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

  return normalizePixPayload(await parseJsonResponse(res))
}

/**
 * Gera PIX direto (fallback quando o Brick falha ou não retorna copia e cola).
 */
export async function requestPixPayment({
  amount,
  description,
  transactionId,
  userEmail,
  userName,
  courseId,
}) {
  const res = await fetch(FIREBASE_FUNCTIONS.createPixPayment, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount,
      description,
      transactionId,
      userEmail,
      userName,
      courseId,
    }),
  })

  const data = await parseJsonResponse(res)

  return normalizePixPayload({
    paymentId: data.paymentId,
    status: data.status || 'pending',
    paymentMethodId: 'pix',
    pixCopyPaste: data.pixCopyPaste,
    pixQrCode: data.pixQrCode,
    ticketUrl: data.ticketUrl,
  })
}

/**
 * Garante copia e cola PIX — tenta cache local via createPix se necessário.
 */
export async function ensurePixCopyPaste(ctx) {
  const normalized = normalizePixPayload(ctx.existing || {})
  if (isValidPixCopyPaste(normalized.pixCopyPaste)) {
    return normalized
  }

  return requestPixPayment({
    amount: ctx.amount,
    description: ctx.description,
    transactionId: ctx.transactionId,
    userEmail: ctx.userEmail,
    userName: ctx.userName,
    courseId: ctx.courseId,
  })
}
