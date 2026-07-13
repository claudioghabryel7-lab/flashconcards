const admin = require('firebase-admin')
const axios = require('axios')
const { grantCourseAccess } = require('./courseAccessExpiry')

/**
 * PagBank / PagSeguro
 * - Sandbox (portaldev.pagbank.com.br/tokens): API REST Bearer → /checkouts
 * - Produção clássica (minhaconta integrações): email+token → /v2/checkout (pode estar desativada)
 */

function getPagBankMode() {
  return String(process.env.PAGBANK_MODE || process.env.PAGSEGURO_MODE || 'sandbox').toLowerCase()
}

function isSandbox() {
  const m = getPagBankMode()
  return m === 'sandbox' || m === 'test'
}

function getPagSeguroToken() {
  return (
    process.env.PAGBANK_TOKEN ||
    process.env.PAGSEGURO_TOKEN ||
    process.env.PAGSEGURO_API_TOKEN ||
    ''
  ).trim()
}

function getTokenCandidates() {
  const raw = getPagSeguroToken()
  const alt = (process.env.PAGBANK_TOKEN_ALT || '').trim()
  const list = []
  const push = (t) => {
    if (t && !list.includes(t)) list.push(t)
  }
  push(raw)
  push(alt)
  const m = raw.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(.+)$/i,
  )
  if (m) {
    push(m[1])
    push(m[2])
  }
  return list
}

function getPagSeguroEmail() {
  return (
    process.env.PAGSEGURO_EMAIL ||
    process.env.PAGBANK_EMAIL ||
    process.env.EMAIL_USER ||
    ''
  )
    .trim()
    .toLowerCase()
}

function getRestApiBase() {
  return isSandbox() ? 'https://sandbox.api.pagseguro.com' : 'https://api.pagseguro.com'
}

function getPagSeguroWsBase() {
  return isSandbox()
    ? 'https://ws.sandbox.pagseguro.uol.com.br'
    : 'https://ws.pagseguro.uol.com.br'
}

function getPagSeguroPayBase() {
  return isSandbox()
    ? 'https://sandbox.pagseguro.uol.com.br'
    : 'https://pagseguro.uol.com.br'
}

function getPagBankWebhookUrl() {
  return (
    process.env.PAGBANK_WEBHOOK_URL ||
    process.env.PAGSEGURO_WEBHOOK_URL ||
    'https://us-central1-plegi-d84c2.cloudfunctions.net/webhookPagSeguro'
  )
}

function toCents(amount) {
  return Math.round(Number(amount) * 100)
}

function formatAmount(amount) {
  return Number(amount).toFixed(2)
}

function extractXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i')
  const m = String(xml || '').match(re)
  return m ? m[1].trim() : null
}

function pickPayLink(links) {
  if (!Array.isArray(links)) return null
  const pay = links.find((l) => String(l.rel || '').toUpperCase() === 'PAY')
  return pay?.href || null
}

function buildPaymentMethods(checkoutKind) {
  if (checkoutKind === 'boleto') return [{ type: 'PIX' }, { type: 'BOLETO' }]
  if (checkoutKind === 'card') return [{ type: 'CREDIT_CARD' }, { type: 'DEBIT_CARD' }]
  return [{ type: 'CREDIT_CARD' }, { type: 'DEBIT_CARD' }, { type: 'PIX' }, { type: 'BOLETO' }]
}

/** API REST nova (Bearer) — sandbox/prod developer */
async function createRestCheckout(opts) {
  const tokens = getTokenCandidates()
  if (!tokens.length) {
    const err = new Error('Token PagBank ausente.')
    err.code = 'pagbank_token_missing'
    throw err
  }

  const amountCents = toCents(opts.amount)
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    const err = new Error('Valor inválido.')
    err.code = 'pagbank_invalid_amount'
    throw err
  }

  const body = {
    reference_id: String(opts.transactionId).slice(0, 64),
    customer: {
      name: String(opts.userName || 'Cliente').slice(0, 120),
      email: String(opts.userEmail || '').toLowerCase().trim(),
    },
    customer_modifiable: true,
    items: [
      {
        reference_id: String(opts.courseId || 'curso').slice(0, 55),
        name: String(opts.description || 'Curso').slice(0, 100),
        quantity: 1,
        unit_amount: amountCents,
      },
    ],
    payment_methods: buildPaymentMethods(opts.checkoutKind || 'all'),
    payment_methods_configs: [
      {
        type: 'CREDIT_CARD',
        config_options: [{ option: 'INSTALLMENTS_LIMIT', value: '12' }],
      },
    ],
    redirect_url: String(opts.redirectUrl || '').slice(0, 255),
    return_url: String(opts.returnUrl || opts.redirectUrl || '').slice(0, 255),
    notification_urls: [getPagBankWebhookUrl()],
    payment_notification_urls: [getPagBankWebhookUrl()],
  }

  const url = `${getRestApiBase()}/checkouts`
  let response = null
  for (const token of tokens) {
    response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 25000,
      validateStatus: () => true,
    })
    if (response.status < 400) break
    if (response.status !== 401 && response.status !== 403) break
  }

  if (!response || response.status >= 400) {
    const detail =
      response?.data?.error_messages ||
      response?.data?.message ||
      response?.data ||
      'Falha ao criar checkout PagBank'
    const err = new Error(
      typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500),
    )
    err.code = 'pagbank_rest_failed'
    err.status = response?.status || 500
    err.details = response?.data
    throw err
  }

  const data = response.data || {}
  const checkoutUrl = pickPayLink(data.links)
  if (!checkoutUrl) {
    const err = new Error('PagBank não retornou link PAY.')
    err.code = 'pagbank_no_pay_link'
    err.details = data
    throw err
  }

  return {
    checkoutId: data.id || null,
    checkoutUrl,
    status: data.status || null,
    referenceId: data.reference_id || opts.transactionId,
    api: 'rest',
    sandbox: isSandbox(),
    raw: data,
  }
}

/** API clássica email+token (pode retornar 11192 Product disabled) */
async function createClassicCheckout(opts) {
  const token = getPagSeguroToken()
  const email = getPagSeguroEmail()
  if (!token || !email) {
    const err = new Error('E-mail/token clássico ausentes.')
    err.code = 'pagseguro_classic_missing'
    throw err
  }

  const params = new URLSearchParams()
  params.set('currency', 'BRL')
  params.set('reference', String(opts.transactionId).slice(0, 200))
  params.set('itemId1', String(opts.courseId || 'curso').slice(0, 100))
  params.set('itemDescription1', String(opts.description || 'Curso').slice(0, 100))
  params.set('itemAmount1', formatAmount(opts.amount))
  params.set('itemQuantity1', '1')
  params.set('shippingAddressRequired', 'false')
  if (opts.userName) params.set('senderName', String(opts.userName).slice(0, 50))
  if (opts.userEmail) {
    params.set('senderEmail', String(opts.userEmail).toLowerCase().trim().slice(0, 60))
  }
  if (opts.redirectUrl) params.set('redirectURL', String(opts.redirectUrl).slice(0, 255))
  params.set('notificationURL', getPagBankWebhookUrl().slice(0, 255))

  const url = `${getPagSeguroWsBase()}/v2/checkout?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`
  const response = await axios.post(url, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=ISO-8859-1' },
    timeout: 25000,
    validateStatus: () => true,
    responseType: 'text',
    transformRequest: [
      (data, headers) => {
        if (headers) {
          delete headers.Accept
          delete headers.accept
        }
        return data
      },
    ],
  })

  const xml = typeof response.data === 'string' ? response.data : String(response.data || '')
  if (response.status >= 400 || /<errors>/i.test(xml) || /<error>/i.test(xml)) {
    const code = extractXmlTag(xml, 'code')
    const message = extractXmlTag(xml, 'message') || xml.slice(0, 400)
    const err = new Error(message || `Falha PagSeguro (${response.status})`)
    err.code = 'pagseguro_classic_failed'
    err.status = response.status
    err.details = { xmlCode: code, xml }
    throw err
  }

  const checkoutCode = extractXmlTag(xml, 'code')
  if (!checkoutCode) {
    const err = new Error('PagSeguro não retornou código de checkout.')
    err.code = 'pagseguro_no_code'
    throw err
  }

  return {
    checkoutId: checkoutCode,
    checkoutUrl: `${getPagSeguroPayBase()}/v2/checkout/payment.html?code=${encodeURIComponent(checkoutCode)}`,
    status: 'ACTIVE',
    referenceId: opts.transactionId,
    api: 'classic',
    sandbox: isSandbox(),
    raw: { code: checkoutCode },
  }
}

async function createPagBankCheckout(opts) {
  // Preferência: REST (token do portaldev / app) — clássico só se REST falhar e não for sandbox
  try {
    return await createRestCheckout(opts)
  } catch (restErr) {
    if (isSandbox()) throw restErr
    // Produção: tenta clássico se REST falhar
    try {
      return await createClassicCheckout(opts)
    } catch (classicErr) {
      const err = new Error(
        `PagBank REST: ${restErr.message} | Clássico: ${classicErr.message}`,
      )
      err.code = 'pagbank_all_failed'
      err.details = { rest: restErr.details, classic: classicErr.details }
      err.status = restErr.status || classicErr.status || 500
      throw err
    }
  }
}

function mapPagSeguroStatus(statusCode) {
  const n = Number(statusCode)
  if (n === 3 || n === 4) return 'paid'
  if (n === 7 || n === 6) return 'cancelled'
  return 'pending'
}

async function fetchNotificationTransaction(notificationCode) {
  const token = getPagSeguroToken()
  const email = getPagSeguroEmail()
  const url = `${getPagSeguroWsBase()}/v3/transactions/notifications/${encodeURIComponent(notificationCode)}`
  const response = await axios.get(url, {
    params: { email, token },
    timeout: 20000,
    validateStatus: () => true,
    responseType: 'text',
  })
  const xml = typeof response.data === 'string' ? response.data : String(response.data || '')
  if (response.status >= 400) {
    const err = new Error(extractXmlTag(xml, 'message') || 'Falha ao consultar notificação PagSeguro')
    err.details = xml.slice(0, 500)
    throw err
  }
  return {
    code: extractXmlTag(xml, 'code'),
    reference: extractXmlTag(xml, 'reference'),
    status: extractXmlTag(xml, 'status'),
    xml,
  }
}

function isPaidWebhookPayload(body) {
  if (body && typeof body === 'object' && !body.notificationCode) {
    const status = String(body.status || '').toUpperCase()
    if (status === 'PAID' || status === 'AVAILABLE' || status === 'AUTHORIZED') return true
    const charges = body.charges || []
    if (Array.isArray(charges) && charges.some((c) => String(c.status || '').toUpperCase() === 'PAID')) {
      return true
    }
  }
  return false
}

function extractReferenceId(body) {
  return (
    body?.reference_id ||
    body?.referenceId ||
    body?.reference ||
    body?.charges?.[0]?.reference_id ||
    null
  )
}

async function fulfillPaidTransaction(transactionDoc, extras = {}) {
  const transactionData = transactionDoc.data() || {}
  if (transactionData.status === 'paid' || transactionData.status === 'approved') {
    return { alreadyPaid: true }
  }

  await transactionDoc.ref.set(
    {
      status: 'paid',
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...extras,
    },
    { merge: true },
  )

  const userId = transactionData.userId
  const courseId = transactionData.courseId || null
  if (!userId || !courseId) {
    console.warn('fulfillPaidTransaction: userId/courseId ausente', transactionDoc.id)
    return { granted: false }
  }

  let courseDuration = transactionData.courseDuration || null
  let courseDurationUnit = transactionData.courseDurationUnit || null
  let courseDurationValue = transactionData.courseDurationValue ?? null
  if (!courseDuration && !courseDurationUnit) {
    try {
      const courseSnap = await admin.firestore().collection('courses').doc(courseId).get()
      if (courseSnap.exists) {
        const c = courseSnap.data() || {}
        courseDuration = c.courseDuration || null
        courseDurationUnit = c.courseDurationUnit || null
        courseDurationValue = c.courseDurationValue ?? null
      }
    } catch (_) {
      /* ignore */
    }
  }

  await grantCourseAccess(admin.firestore(), admin.firestore.FieldValue, {
    userId,
    courseId,
    courseDuration,
    courseDurationUnit,
    courseDurationValue,
    autoRenew: Boolean(transactionData.autoRenew),
    paymentMethod: transactionData.paymentMethod || extras.paymentMethod || null,
    transactionId: transactionDoc.id,
    amount: transactionData.amount || null,
    extendFromCurrent: Boolean(transactionData.isRenewal),
  })

  return { granted: true }
}

module.exports = {
  getPagSeguroToken,
  getPagSeguroEmail,
  createPagBankCheckout,
  isPaidWebhookPayload,
  extractReferenceId,
  fulfillPaidTransaction,
  fetchNotificationTransaction,
  mapPagSeguroStatus,
  isSandbox,
}
