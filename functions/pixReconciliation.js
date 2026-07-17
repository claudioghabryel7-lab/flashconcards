/**
 * Reconciliação de pagamentos PIX/cartão pendentes — fallback quando webhook falha.
 */

const admin = require('firebase-admin')
const { MercadoPagoConfig, Payment } = require('mercadopago')
const { getMercadoPagoPaymentWithRetry } = require('./mercadopagoUtils')
const { syncTransactionPaymentStatus } = require('./mercadopagoPaymentFulfillment')

function createPaymentClient(accessToken) {
  const client = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 25000 },
  })
  return new Payment(client)
}

async function findTransactionByPaymentId(paymentId) {
  const transactionsRef = admin.firestore().collection('transactions')
  const idStr = String(paymentId)

  let snapshot = await transactionsRef
    .where('mercadopagoPaymentId', '==', idStr)
    .limit(1)
    .get()

  if (snapshot.empty && /^\d+$/.test(idStr)) {
    snapshot = await transactionsRef
      .where('mercadopagoPaymentId', '==', parseInt(idStr, 10))
      .limit(1)
      .get()
  }

  return snapshot.empty ? null : snapshot.docs[0]
}

async function resolveTransactionDoc(paymentId, paymentInfo, accessToken) {
  let doc = await findTransactionByPaymentId(paymentId)
  if (doc) return doc

  const transactionId =
    paymentInfo?.metadata?.transaction_id || paymentInfo?.external_reference
  if (!transactionId) return null

  const transactionDoc = await admin.firestore().collection('transactions').doc(String(transactionId)).get()
  return transactionDoc.exists ? transactionDoc : null
}

async function fetchPaymentInfo(paymentId, getMercadoPagoAccessToken) {
  const tokens = [
    getMercadoPagoAccessToken({ forPix: true }),
    getMercadoPagoAccessToken(),
  ].filter(Boolean)

  const unique = [...new Set(tokens)]
  let lastError = null

  for (const token of unique) {
    try {
      const payment = createPaymentClient(token)
      return await getMercadoPagoPaymentWithRetry(payment, paymentId)
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('Não foi possível consultar pagamento no Mercado Pago')
}

/**
 * Reconcilia uma transação pelo ID do documento Firestore.
 */
async function reconcileTransactionById(transactionId, { getMercadoPagoAccessToken, adminSdk, functions }) {
  const snap = await admin.firestore().collection('transactions').doc(String(transactionId)).get()
  if (!snap.exists) {
    return { ok: false, reason: 'not_found' }
  }

  const data = snap.data() || {}
  if (data.status === 'paid' || data.status === 'approved') {
    return { ok: true, status: data.status, alreadyPaid: true }
  }

  const paymentId = data.mercadopagoPaymentId
  if (!paymentId) {
    return { ok: false, reason: 'no_payment_id' }
  }

  const paymentInfo = await fetchPaymentInfo(paymentId, getMercadoPagoAccessToken)
  const paymentStatus = paymentInfo?.status || 'pending'

  if (paymentStatus === 'pending' || paymentStatus === 'in_process') {
    return { ok: true, status: 'pending', mercadopagoStatus: paymentStatus }
  }

  const result = await syncTransactionPaymentStatus(adminSdk, functions, {
    transactionDoc: snap,
    transactionData: data,
    paymentId,
    paymentStatus,
  })

  return { ok: true, status: result.newStatus, fulfilled: result.fulfilled }
}

/**
 * Varre transações pendentes recentes e sincroniza com Mercado Pago.
 */
async function reconcilePendingTransactions({ getMercadoPagoAccessToken, adminSdk, functions, limit = 40 }) {
  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000
  const snapshot = await admin
    .firestore()
    .collection('transactions')
    .where('status', '==', 'pending')
    .limit(Math.min(limit * 3, 120))
    .get()

  const results = { checked: 0, paid: 0, cancelled: 0, errors: 0, stillPending: 0 }

  const docs = snapshot.docs
    .filter((doc) => {
      const data = doc.data() || {}
      if (!data.mercadopagoPaymentId) return false
      const createdAt = data.createdAt?.toDate?.()?.getTime?.() || 0
      return createdAt >= sinceMs || !createdAt
    })
    .slice(0, limit)

  for (const doc of docs) {
    results.checked += 1
    const data = doc.data() || {}

    try {
      const paymentInfo = await fetchPaymentInfo(data.mercadopagoPaymentId, getMercadoPagoAccessToken)
      const paymentStatus = paymentInfo?.status || 'pending'

      if (paymentStatus === 'pending' || paymentStatus === 'in_process') {
        results.stillPending += 1
        continue
      }

      const result = await syncTransactionPaymentStatus(adminSdk, functions, {
        transactionDoc: doc,
        transactionData: data,
        paymentId: data.mercadopagoPaymentId,
        paymentStatus,
      })

      if (result.newStatus === 'paid') results.paid += 1
      else if (result.newStatus === 'cancelled') results.cancelled += 1
    } catch (err) {
      results.errors += 1
      console.warn('[reconcilePendingTransactions]', doc.id, err?.message || err)
    }
  }

  return results
}

module.exports = {
  findTransactionByPaymentId,
  resolveTransactionDoc,
  fetchPaymentInfo,
  reconcileTransactionById,
  reconcilePendingTransactions,
}
