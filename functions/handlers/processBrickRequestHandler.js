const admin = require('firebase-admin')
const { processBrickPaymentPayload } = require('../mercadopagoBrickPayment')
const { getMercadoPagoAccessToken, isMercadoPagoTestMode } = require('../mercadopagoConfig')

async function handleProcessBrickRequest(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  const { requestId } = req.body || {}
  if (!requestId) return res.status(400).json({ error: 'requestId obrigatório' })

  const ref = admin.firestore().collection('paymentBrickRequests').doc(String(requestId))
  const snap = await ref.get()
  if (!snap.exists) return res.status(404).json({ error: 'Request não encontrado' })

  const data = snap.data() || {}
  if (data.state === 'done' || data.state === 'error') {
    return res.status(200).json({ ok: true, state: data.state })
  }

  if (data.state === 'processing') {
    const processingMs = data.processingAt?.toMillis?.() || 0
    if (processingMs && Date.now() - processingMs < 3 * 60 * 1000) {
      return res.status(202).json({ ok: true, state: 'processing' })
    }
  }

  try {
    await ref.set(
      {
        state: 'processing',
        processingAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    const result = await processBrickPaymentPayload(
      {
        transactionId: data.transactionId,
        formData: data.formData,
        amount: data.amount,
        description: data.description,
        userEmail: data.userEmail,
        userName: data.userName,
        courseId: data.courseId,
      },
      { getMercadoPagoAccessToken, isMercadoPagoTestMode },
    )

    await ref.set(
      {
        state: 'done',
        result,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        formData: admin.firestore.FieldValue.delete(),
      },
      { merge: true },
    )

    return res.status(200).json({ ok: true, state: 'done', result })
  } catch (error) {
    console.error('[processBrickRequest]', error)
    await ref.set(
      {
        state: 'error',
        errorMessage:
          error.message || error.cause?.[0]?.description || 'Erro ao processar pagamento',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        formData: admin.firestore.FieldValue.delete(),
      },
      { merge: true },
    )
    return res.status(500).json({ error: error.message || 'Erro ao processar pagamento' })
  }
}

module.exports = { handleProcessBrickRequest }
