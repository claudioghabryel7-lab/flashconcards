const { MercadoPagoConfig, Preference, PreApproval } = require('mercadopago')
const {
  getMercadoPagoAccessToken,
  isMercadoPagoTestMode,
} = require('../mercadopagoConfig')
const { mercadoPagoSdkCall } = require('../mercadopagoUtils')
const { toMercadoPagoRecurring } = require('../courseAccessExpiry')

function isPublicHttpsUrl(url) {
  try {
    const u = new URL(String(url || ''))
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false
    return true
  } catch {
    return false
  }
}

function resolveMercadoPagoBackUrl(candidate, fallback) {
  if (isPublicHttpsUrl(candidate)) return String(candidate)
  return fallback
}

function resolveCheckoutInitPoint(result, { testMode } = {}) {
  if (!result) return null
  if (testMode && result.sandbox_init_point) return result.sandbox_init_point
  return result.init_point || result.sandbox_init_point || null
}

function resolveWebhookUrl() {
  const env = process.env.MERCADOPAGO_WEBHOOK_URL || ''
  if (env && !env.includes('cloudfunctions.net')) return env
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.flashconcards.com.br').replace(/\/$/, '')
  return `${site}/api/mercadopago/webhook`
}

async function handleCreateCheckoutPreference(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  try {
    const {
      amount,
      description,
      transactionId,
      userEmail,
      userName,
      courseId,
      courseDuration,
      autoRenew,
      successUrl,
      failureUrl,
      pendingUrl,
      checkoutKind: checkoutKindRaw,
    } = req.body || {}

    const amountNumber = parseFloat(amount)
    if (!transactionId || !description || Number.isNaN(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({
        error: 'Dados inválidos',
        message: 'Informe amount, description e transactionId válidos.',
      })
    }

    const checkoutKind =
      checkoutKindRaw === 'boleto'
        ? 'boleto'
        : checkoutKindRaw === 'brick' || checkoutKindRaw === 'all'
          ? 'brick'
          : 'card'

    const accessToken = getMercadoPagoAccessToken()
    if (!accessToken) {
      return res.status(500).json({ error: 'Mercado Pago não configurado', message: 'Access token ausente.' })
    }

    const client = new MercadoPagoConfig({ accessToken, options: { timeout: 15000 } })
    const siteBase =
      process.env.PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'https://www.flashconcards.com.br'
    const originFallback = String(siteBase).replace(/\/$/, '')
    const successFallback = `${originFallback}/pagamento?status=success&txn=${encodeURIComponent(transactionId)}${courseId ? `&course=${encodeURIComponent(courseId)}` : ''}`
    const failureFallback = `${originFallback}/pagamento?status=failure&txn=${encodeURIComponent(transactionId)}${courseId ? `&course=${encodeURIComponent(courseId)}` : ''}`
    const pendingFallback = `${originFallback}/pagamento?status=pending&txn=${encodeURIComponent(transactionId)}${courseId ? `&course=${encodeURIComponent(courseId)}` : ''}`

    const success = resolveMercadoPagoBackUrl(successUrl, successFallback)
    const failure = resolveMercadoPagoBackUrl(failureUrl, failureFallback)
    const pending = resolveMercadoPagoBackUrl(pendingUrl, pendingFallback)

    const wantAutoRenew = checkoutKind === 'card' && Boolean(autoRenew)
    const recurring = wantAutoRenew
      ? toMercadoPagoRecurring({
          courseDuration,
          courseDurationUnit: req.body?.courseDurationUnit,
          courseDurationValue: req.body?.courseDurationValue,
        })
      : null

    if (wantAutoRenew && recurring) {
      const preApproval = new PreApproval(client)
      const preBody = {
        reason: String(description).slice(0, 256),
        external_reference: String(transactionId),
        payer_email: userEmail || undefined,
        auto_recurring: {
          frequency: recurring.frequency,
          frequency_type: recurring.frequency_type,
          transaction_amount: amountNumber,
          currency_id: 'BRL',
        },
        back_url: success,
        status: 'pending',
        metadata: {
          transaction_id: String(transactionId),
          course_id: courseId || null,
          auto_renew: true,
          course_duration: courseDuration || null,
        },
      }

      const result = await mercadoPagoSdkCall(() => preApproval.create({ body: preBody }))
      const testMode = isMercadoPagoTestMode()
      const checkoutUrl = resolveCheckoutInitPoint(result, { testMode })
      if (!checkoutUrl) {
        return res.status(500).json({ error: 'Assinatura sem URL', message: 'Mercado Pago não retornou init_point.' })
      }
      return res.status(200).json({
        success: true,
        mode: 'subscription',
        preferenceId: result.id,
        preapprovalId: result.id,
        checkoutUrl,
        testMode,
      })
    }

    const preference = new Preference(client)
    const paymentMethods =
      checkoutKind === 'boleto'
        ? {
            excluded_payment_types: [
              { id: 'credit_card' },
              { id: 'debit_card' },
              { id: 'prepaid_card' },
            ],
          }
        : checkoutKind === 'brick' || checkoutKind === 'all'
          ? { installments: 6 }
          : {
              installments: 6,
              excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }],
            }

    const body = {
      items: [
        {
          id: String(courseId || transactionId).slice(0, 256),
          title: String(description).slice(0, 256),
          quantity: 1,
          unit_price: Number(amountNumber.toFixed(2)),
          currency_id: 'BRL',
        },
      ],
      payer: { email: userEmail || undefined, name: userName || undefined },
      external_reference: String(transactionId),
      metadata: {
        transaction_id: String(transactionId),
        course_id: courseId || null,
        auto_renew: false,
        checkout_kind: checkoutKind,
        course_duration: courseDuration || null,
      },
      payment_methods: paymentMethods,
      back_urls: { success, failure, pending },
      notification_url: resolveWebhookUrl(),
      statement_descriptor: 'CONCURSEIRO PRED',
    }

    if (isPublicHttpsUrl(success) && isPublicHttpsUrl(failure) && isPublicHttpsUrl(pending)) {
      body.auto_return = 'approved'
    }

    const result = await mercadoPagoSdkCall(() => preference.create({ body }))
    const testMode = isMercadoPagoTestMode()
    const checkoutUrl = resolveCheckoutInitPoint(result, { testMode })
    if (!checkoutUrl) {
      return res.status(500).json({ error: 'Preferência sem URL', message: 'Mercado Pago não retornou init_point.' })
    }

    return res.status(200).json({
      success: true,
      mode: 'checkout',
      preferenceId: result.id,
      checkoutUrl,
      testMode,
    })
  } catch (error) {
    console.error('Erro createCheckoutPreference:', error)
    return res.status(500).json({
      error: 'Erro ao criar preferência',
      message: error.message || 'Erro desconhecido',
    })
  }
}

module.exports = { handleCreateCheckoutPreference }
