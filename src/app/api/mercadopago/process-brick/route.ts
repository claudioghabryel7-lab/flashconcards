import { NextResponse } from 'next/server'

/**
 * Fallback opcional: processa Brick no Next (same-origin) se
 * MERCADOPAGO_ACCESS_TOKEN_PROD estiver no ambiente da Vercel.
 * Preferência do client: Firestore trigger (não depende desta rota).
 */
function getAccessToken() {
  return (
    process.env.MERCADOPAGO_ACCESS_TOKEN_PROD ||
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    process.env.MERCADOPAGO_ACCESS_TOKEN_PIX ||
    ''
  )
}

export async function POST(request: Request) {
  try {
    const accessToken = getAccessToken()
    if (!accessToken) {
      return NextResponse.json(
        {
          error: 'Mercado Pago não configurado no Next',
          message:
            'Defina MERCADOPAGO_ACCESS_TOKEN_PROD no Vercel ou use o fluxo Firestore.',
        },
        { status: 503 },
      )
    }

    const body = await request.json()
    const {
      transactionId,
      formData,
      amount,
      description,
      userEmail,
      userName,
      courseId,
    } = body || {}

    const amountNumber = parseFloat(amount)
    if (!transactionId || !formData || Number.isNaN(amountNumber) || amountNumber <= 0) {
      return NextResponse.json(
        { error: 'Dados inválidos', message: 'Informe transactionId, formData e amount.' },
        { status: 400 },
      )
    }

    const payerFromBrick = formData.payer || {}
    const paymentBody = {
      ...formData,
      transaction_amount: Number(amountNumber.toFixed(2)),
      description: String(description || 'Curso').slice(0, 255),
      external_reference: String(transactionId),
      metadata: {
        ...(formData.metadata || {}),
        transaction_id: String(transactionId),
        course_id: courseId || null,
      },
      notification_url:
        process.env.MERCADOPAGO_WEBHOOK_URL ||
        'https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago',
      payer: {
        ...payerFromBrick,
        email: payerFromBrick.email || userEmail || undefined,
        first_name:
          payerFromBrick.first_name ||
          (userName || 'Cliente').split(' ')[0] ||
          'Cliente',
      },
    }

    const rawInstallments = Number(paymentBody.installments)
    if (Number.isFinite(rawInstallments) && rawInstallments > 0) {
      paymentBody.installments = Math.min(6, Math.max(1, Math.floor(rawInstallments)))
    } else if (paymentBody.token) {
      paymentBody.installments = 1
    }

    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${transactionId}-${Date.now()}`,
      },
      body: JSON.stringify(paymentBody),
    })

    const result = await mpRes.json().catch(() => ({}))
    if (!mpRes.ok) {
      return NextResponse.json(
        {
          error: 'Erro ao processar pagamento',
          message: result.message || result.error || 'Falha no Mercado Pago',
          details: result,
        },
        { status: 502 },
      )
    }

    const status = result.status || 'pending'
    const statusDetail = result.status_detail || null
    const txData = result.point_of_interaction?.transaction_data || {}

    return NextResponse.json({
      success: true,
      paymentId: result.id,
      status,
      statusDetail,
      paymentMethodId: result.payment_method_id || null,
      pixCopyPaste: txData.qr_code || null,
      pixQrCode: txData.qr_code_base64 || null,
      ticketUrl: txData.ticket_url || result.transaction_details?.external_resource_url || null,
      testMode: String(accessToken).startsWith('TEST-'),
    })
  } catch (error) {
    console.error('[api/mercadopago/process-brick]', error)
    return NextResponse.json(
      { error: 'Erro ao processar pagamento', message: error instanceof Error ? error.message : 'Erro' },
      { status: 500 },
    )
  }
}
