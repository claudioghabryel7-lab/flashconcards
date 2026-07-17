/**
 * Handler compartilhado para createPixPayment (v1 e v2).
 */

const {
  createDedicatedPixPayment,
  createPaymentClient,
  isEmvPixCode,
  readCachedPixFromTransaction,
} = require('../pixPaymentService')

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ getMercadoPagoAccessToken: (opts?: object) => string }} deps
 */
async function handleCreatePixPayment(req, res, { getMercadoPagoAccessToken }) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    const { amount, description, transactionId, userEmail, userName, courseId } = req.body

    console.log('Recebido no createPixPayment:', {
      amount,
      description,
      transactionId,
      userEmail,
      userName,
    })

    if (!amount && amount !== 0) {
      return res.status(400).json({
        error: 'Campo obrigatório faltando: amount',
        message: 'O valor do pagamento é obrigatório',
      })
    }

    if (!description) {
      return res.status(400).json({
        error: 'Campo obrigatório faltando: description',
        message: 'A descrição do pagamento é obrigatória',
      })
    }

    if (!transactionId) {
      return res.status(400).json({
        error: 'Campo obrigatório faltando: transactionId',
        message: 'O ID da transação é obrigatório',
      })
    }

    const amountNumber = parseFloat(amount)
    if (isNaN(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({
        error: 'Valor inválido',
        message: `O valor do pagamento deve ser um número positivo. Recebido: ${amount}`,
      })
    }

    const cached = await readCachedPixFromTransaction(transactionId)
    if (cached?.pixCopyPaste) {
      return res.status(200).json({
        success: true,
        paymentId: cached.paymentId,
        status: cached.status,
        pixQrCode: cached.pixQrCode,
        pixCopyPaste: cached.pixCopyPaste,
        ticketUrl: cached.ticketUrl,
        cached: true,
      })
    }

    const accessToken = getMercadoPagoAccessToken({ forPix: true })
    if (!accessToken) {
      return res.status(500).json({
        error: 'Mercado Pago não configurado',
        message:
          'Access token ausente para PIX. Configure MERCADOPAGO_ACCESS_TOKEN_PROD (PIX não funciona com token TEST).',
      })
    }

    console.log('PIX usando token:', String(accessToken).startsWith('TEST') ? 'TEST' : 'PROD/APP_USR')

    const payment = createPaymentClient(accessToken)
    const result = await createDedicatedPixPayment(payment, {
      amount: amountNumber,
      description,
      transactionId,
      userEmail,
      userName,
      courseId: courseId || null,
    })

    if (!result?.paymentId) {
      return res.status(500).json({
        error: 'Erro ao gerar PIX',
        message: 'Pagamento não foi criado no Mercado Pago',
      })
    }

    if (!isEmvPixCode(result.pixCopyPaste)) {
      return res.status(400).json({
        error: 'PIX não gerado',
        message:
          result.statusDetail ||
          'Não foi possível gerar o código PIX. Verifique as configurações da conta do Mercado Pago.',
        paymentId: result.paymentId,
        status: result.status,
        details:
          'O código PIX não foi retornado pelo Mercado Pago. Verifique se a chave PIX está habilitada na sua conta.',
      })
    }

    return res.status(200).json({
      success: true,
      paymentId: result.paymentId,
      status: result.status,
      pixQrCode: result.pixQrCode,
      pixCopyPaste: result.pixCopyPaste,
      ticketUrl: result.ticketUrl,
    })
  } catch (error) {
    console.error('Erro ao criar pagamento PIX:', error)

    const errorString =
      String(error.message || '') + ' ' + JSON.stringify(error.cause || {})

    if (
      errorString.includes('Collector user without key enabled for QR') ||
      errorString.includes('key enabled for QR') ||
      errorString.includes('13253') ||
      errorString.includes('Financial Identity Use Case')
    ) {
      return res.status(400).json({
        error: 'PIX não habilitado na conta',
        message:
          'Sua conta do Mercado Pago não tem a chave PIX habilitada. Para habilitar, acesse o painel do Mercado Pago e configure sua chave PIX.',
        code: 'PIX_NOT_ENABLED',
      })
    }

    return res.status(500).json({
      error: 'Erro ao criar pagamento PIX',
      message: error.message || error.cause?.[0]?.description || 'Erro desconhecido',
      code: error.cause?.[0]?.code || error.code || 'PIX_CREATE_FAILED',
      details: error.cause || error.response?.data || null,
    })
  }
}

module.exports = { handleCreatePixPayment }
