/**
 * Handler HTTP — reconcilia status de pagamento (fallback ao webhook).
 */

const { reconcileTransactionById } = require('../pixReconciliation')

async function handleReconcilePayment(req, res, { getMercadoPagoAccessToken, admin, functions }) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const transactionId = req.body?.transactionId
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId obrigatório' })
  }

  try {
    const result = await reconcileTransactionById(String(transactionId), {
      getMercadoPagoAccessToken,
      adminSdk: admin,
      functions,
    })

    if (!result.ok && result.reason === 'not_found') {
      return res.status(404).json({ error: 'Transação não encontrada' })
    }

    return res.status(200).json({ success: true, ...result })
  } catch (error) {
    console.error('handleReconcilePayment:', error)
    return res.status(500).json({
      error: 'Erro ao reconciliar pagamento',
      message: error.message || 'Erro desconhecido',
    })
  }
}

module.exports = { handleReconcilePayment }
