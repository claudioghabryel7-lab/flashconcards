/** Google Ads — tag base no layout; conversão só via este helper após compra confirmada. */
export const GOOGLE_ADS_ID = 'AW-18321355755'
export const PURCHASE_CONVERSION_SEND_TO = 'AW-18321355755/lRkGCN_ixtAcEOvnpqBE'

const DEDUPE_PREFIX = 'gads_conv_'

function alreadyTracked(transactionId) {
  if (typeof window === 'undefined' || !transactionId) return false
  try {
    return window.sessionStorage.getItem(`${DEDUPE_PREFIX}${transactionId}`) === '1'
  } catch {
    return false
  }
}

function markTracked(transactionId) {
  if (typeof window === 'undefined' || !transactionId) return
  try {
    window.sessionStorage.setItem(`${DEDUPE_PREFIX}${transactionId}`, '1')
  } catch {
    /* ignore */
  }
}

/**
 * Dispara conversão de Compra no Google Ads.
 * Chamar apenas quando o pagamento estiver confirmado (ex.: status paid / approved).
 *
 * Assinatura legada: (conversionLabel, value, transactionId)
 * Também aceita: trackGoogleAdsConversion({ value, transactionId, conversionLabel })
 */
export const trackGoogleAdsConversion = (conversionLabel = null, value = 99.9, transactionId = null) => {
  if (typeof window === 'undefined') return

  let label = PURCHASE_CONVERSION_SEND_TO
  let conversionValue = 99.9
  let txId = null

  if (conversionLabel && typeof conversionLabel === 'object' && !Array.isArray(conversionLabel)) {
    const opts = conversionLabel
    label = opts.conversionLabel || opts.send_to || PURCHASE_CONVERSION_SEND_TO
    conversionValue =
      typeof opts.value === 'number' ? opts.value : parseFloat(opts.value) || 99.9
    txId = opts.transactionId ? String(opts.transactionId) : null
  } else {
    label = conversionLabel || PURCHASE_CONVERSION_SEND_TO
    conversionValue = typeof value === 'number' ? value : parseFloat(value) || 99.9
    txId = transactionId ? String(transactionId) : null
  }

  if (!txId) {
    console.warn('⚠️ Conversão Google Ads sem transaction_id — ignorada para evitar duplicatas.')
    return
  }

  if (alreadyTracked(txId)) {
    console.log('ℹ️ Conversão Google Ads já registrada para', txId)
    return
  }

  const sendConversion = () => {
    if (!window.gtag || typeof window.gtag !== 'function') {
      return false
    }

    try {
      window.gtag('event', 'conversion', {
        send_to: label,
        value: conversionValue,
        currency: 'BRL',
        transaction_id: txId,
      })
      markTracked(txId)
      console.log('✅ Conversão Google Ads (compra confirmada)', {
        label,
        value: conversionValue,
        transactionId: txId,
      })
      return true
    } catch (error) {
      console.error('❌ Erro ao rastrear conversão no Google Ads:', error)
      return false
    }
  }

  if (sendConversion()) return

  let attempts = 0
  const maxAttempts = 10
  const checkGtag = setInterval(() => {
    attempts += 1
    if (sendConversion() || attempts >= maxAttempts) {
      clearInterval(checkGtag)
      if (attempts >= maxAttempts && !alreadyTracked(txId)) {
        console.error('❌ Google Ads (gtag) não carregou. Verifique a tag no layout.')
      }
    }
  }, 500)
}

/** Dispara conversão de compra — usar SOMENTE após pagamento confirmado (paid/approved). */
export const trackPurchaseConversion = trackGoogleAdsConversion

/** Clique de engajamento (não é conversão de compra). */
export const trackButtonClick = () => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'click', {
      event_category: 'engagement',
      event_label: 'Garantir Promoção',
      value: 99.9,
    })
  }
}
