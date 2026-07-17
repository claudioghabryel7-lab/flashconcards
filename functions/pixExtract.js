/**
 * Normaliza campos PIX da resposta do Mercado Pago.
 * O MP às vezes devolve base64 no qr_code ou demora a preencher o EMV copia e cola.
 */

function isEmvPixCode(value) {
  if (typeof value !== 'string') return false
  const v = value.trim()
  return v.startsWith('000201') && v.length > 40
}

function isBase64Image(value) {
  if (typeof value !== 'string') return false
  const v = value.trim()
  return v.startsWith('iVBORw0KGgo') || v.startsWith('/9j/')
}

function pickEmv(...candidates) {
  for (const c of candidates) {
    if (isEmvPixCode(c)) return c.trim()
  }
  return null
}

function pickQrBase64(...candidates) {
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue
    const v = c.trim().replace(/^data:image\/\w+;base64,/, '')
    if (isEmvPixCode(v)) continue
    if (isBase64Image(v) || v.length > 120) return v
  }
  return null
}

function extractPixFromMercadoPagoPayment(result) {
  if (!result || typeof result !== 'object') {
    return { pixCopyPaste: null, pixQrCode: null, ticketUrl: null }
  }

  const pixData = result.point_of_interaction?.transaction_data || {}
  const txDetails = result.transaction_details?.transaction_data || {}

  let pixCopyPaste = pickEmv(
    pixData.qr_code,
    txDetails.qr_code,
    result.qr_code,
  )

  let pixQrCode = pickQrBase64(
    pixData.qr_code_base64,
    result.qr_code_base64,
  )

  if (!pixQrCode && isBase64Image(pixData.qr_code)) {
    pixQrCode = pixData.qr_code.trim()
  }
  if (!pixQrCode && isBase64Image(txDetails.qr_code)) {
    pixQrCode = txDetails.qr_code.trim()
  }

  const ticketUrl =
    pixData.ticket_url ||
    result.transaction_details?.external_resource_url ||
    null

  return { pixCopyPaste, pixQrCode, ticketUrl }
}

module.exports = { extractPixFromMercadoPagoPayment, isEmvPixCode, isBase64Image }
