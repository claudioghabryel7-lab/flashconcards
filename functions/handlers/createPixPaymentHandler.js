/**
 * Handler compartilhado para createPixPayment (v1 e v2).
 */

const functions = require('firebase-functions')
const { MercadoPagoConfig, Payment } = require('mercadopago')
const { createMercadoPagoPayment } = require('../mercadopagoUtils')

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
    const { amount, description, transactionId, userEmail, userName } = req.body

    console.log('Recebido no createPixPayment:', { amount, description, transactionId, userEmail, userName })

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

    const accessToken = getMercadoPagoAccessToken({ forPix: true })
    if (!accessToken) {
      return res.status(500).json({
        error: 'Mercado Pago não configurado',
        message:
          'Access token ausente para PIX. Configure MERCADOPAGO_ACCESS_TOKEN_PROD (PIX não funciona com token TEST).',
      })
    }

    console.log('PIX usando token:', String(accessToken).startsWith('TEST') ? 'TEST' : 'PROD/APP_USR')

    const client = new MercadoPagoConfig({
      accessToken,
      options: { timeout: 15000 },
    })
    const payment = new Payment(client)

    const paymentData = {
      transaction_amount: Number(amountNumber.toFixed(2)),
      description: String(description).slice(0, 255),
      payment_method_id: 'pix',
      payer: {
        email: userEmail || 'cliente@exemplo.com',
        first_name: (userName || 'Cliente').split(' ')[0] || 'Cliente',
      },
      metadata: {
        transaction_id: transactionId,
      },
      notification_url:
        process.env.MERCADOPAGO_WEBHOOK_URL ||
        functions.config().app?.webhook_url ||
        'https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago',
    }

    const result = await createMercadoPagoPayment(payment, {
      body: paymentData,
      idempotencyKey: `pix-${transactionId}`,
      maxAttempts: 3,
    })

    if (!result || !result.id) {
      return res.status(500).json({
        error: 'Erro ao gerar PIX',
        message: 'Pagamento não foi criado no Mercado Pago',
      })
    }

    const pixData = result.point_of_interaction?.transaction_data || {}
    let pixCopyPaste = pixData.qr_code || null
    const pixQrCodeBase64 = pixData.qr_code_base64 || null
    const ticketUrl = pixData.ticket_url || null

    if (!pixCopyPaste && result.transaction_details?.transaction_data?.qr_code) {
      pixCopyPaste = result.transaction_details.transaction_data.qr_code
    }
    if (!pixCopyPaste && result.qr_code) {
      pixCopyPaste = result.qr_code
    }
    if (pixCopyPaste && pixCopyPaste.startsWith('iVBORw0KGgo')) {
      pixCopyPaste = null
    }

    if (!pixCopyPaste) {
      return res.status(400).json({
        error: 'PIX não gerado',
        message:
          result.status_detail ||
          'Não foi possível gerar o código PIX. Verifique as configurações da conta do Mercado Pago.',
        paymentId: result.id,
        status: result.status,
        details:
          'O código PIX não foi retornado pelo Mercado Pago. Verifique se a chave PIX está habilitada na sua conta.',
      })
    }

    return res.status(200).json({
      success: true,
      paymentId: result.id,
      status: result.status,
      pixQrCode: pixQrCodeBase64,
      pixCopyPaste,
      ticketUrl,
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
