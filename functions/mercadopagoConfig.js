/**
 * Resolução de credenciais Mercado Pago — compatível com Cloud Functions v1 e v2.
 * v2 NÃO suporta functions.config(); usar apenas process.env / secrets.
 */

function readLegacyConfig() {
  try {
    const functions = require('firebase-functions')
    return functions.config?.() || {}
  } catch {
    return {}
  }
}

function getMercadoPagoMode() {
  const legacy = readLegacyConfig()
  return String(
    process.env.MERCADOPAGO_MODE || legacy.mercadopago?.mode || 'prod',
  ).toLowerCase()
}

function getMercadoPagoAccessToken(options = {}) {
  const { forPix = false } = options
  const legacy = readLegacyConfig()
  const cfgToken =
    legacy.mercadopago?.access_token_prod ||
    legacy.mercadopago?.access_token ||
    ''

  if (forPix) {
    return (
      process.env.MERCADOPAGO_ACCESS_TOKEN_PIX ||
      process.env.MERCADOPAGO_ACCESS_TOKEN_PROD ||
      process.env.MERCADOPAGO_ACCESS_TOKEN ||
      cfgToken ||
      process.env.MERCADOPAGO_ACCESS_TOKEN_TEST ||
      ''
    )
  }

  const mode = getMercadoPagoMode()
  if (mode === 'test' || mode === 'sandbox') {
    return process.env.MERCADOPAGO_ACCESS_TOKEN_TEST || process.env.MERCADOPAGO_ACCESS_TOKEN || ''
  }

  return (
    process.env.MERCADOPAGO_ACCESS_TOKEN_PROD ||
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    cfgToken ||
    ''
  )
}

function isMercadoPagoTestMode() {
  const mode = getMercadoPagoMode()
  if (mode === 'prod' || mode === 'production') return false
  if (mode === 'test' || mode === 'sandbox') return true
  const token = getMercadoPagoAccessToken()
  return String(token).startsWith('TEST-')
}

function getMercadoPagoPublicKey() {
  const legacy = readLegacyConfig()
  const cfgKey =
    legacy.mercadopago?.public_key_prod || legacy.mercadopago?.public_key || ''

  if (isMercadoPagoTestMode()) {
    return (
      process.env.MERCADOPAGO_PUBLIC_KEY_TEST ||
      process.env.MERCADOPAGO_PUBLIC_KEY ||
      cfgKey ||
      ''
    )
  }

  return (
    process.env.MERCADOPAGO_PUBLIC_KEY_PROD ||
    process.env.MERCADOPAGO_PUBLIC_KEY ||
    cfgKey ||
    ''
  )
}

module.exports = {
  readLegacyConfig,
  getMercadoPagoAccessToken,
  getMercadoPagoMode,
  isMercadoPagoTestMode,
  getMercadoPagoPublicKey,
}
