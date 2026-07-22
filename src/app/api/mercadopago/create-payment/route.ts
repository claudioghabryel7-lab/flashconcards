import { NextResponse } from 'next/server'
import { mpFetch, siteOrigin, webhookNotificationUrl } from '@/lib/mercadopago'

export const runtime = 'nodejs'

/**
 * Cria pagamento PIX (Payments API) ou Preferência Checkout Pro (cartão/PIX hospedado).
 * Body: { mode: 'pix'|'checkout'|'subscription', amount, description, transactionId,
 *         userEmail, userName, userId, courseId, planType, installments? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const mode = String(body.mode || 'pix')
    const amount = Number(body.amount)
    const description = String(body.description || 'Curso Concurseiro Preditivo').slice(0, 200)
    const transactionId = String(body.transactionId || '')
    const userEmail = String(body.userEmail || 'cliente@flashconcards.com.br')
    const userName = String(body.userName || 'Cliente')
    const userId = String(body.userId || '')
    const courseId = String(body.courseId || '')
    const planType = body.planType === 'monthly' ? 'monthly' : 'lifetime'
    const origin = siteOrigin(req)
    const notificationUrl = webhookNotificationUrl(req)

    if (!amount || amount <= 0 || !transactionId) {
      return NextResponse.json({ error: 'amount e transactionId são obrigatórios' }, { status: 400 })
    }

    const metadata = {
      transaction_id: transactionId,
      user_id: userId,
      course_id: courseId,
      plan_type: planType,
    }

    if (mode === 'pix') {
      const payment = await mpFetch('/v1/payments', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': `pix-${transactionId}` },
        body: JSON.stringify({
          transaction_amount: Number(amount.toFixed(2)),
          description,
          payment_method_id: 'pix',
          payer: {
            email: userEmail,
            first_name: userName.split(' ')[0] || 'Cliente',
            last_name: userName.split(' ').slice(1).join(' ') || 'FlashCon',
          },
          metadata,
          external_reference: transactionId,
          notification_url: notificationUrl,
        }),
      })

      const tx = payment?.point_of_interaction?.transaction_data || {}
      return NextResponse.json({
        mode: 'pix',
        paymentId: payment.id,
        status: payment.status,
        qrCode: tx.qr_code || '',
        qrCodeBase64: tx.qr_code_base64 || '',
        ticketUrl: tx.ticket_url || '',
      })
    }

    if (mode === 'subscription') {
      // Assinatura mensal (preapproval)
      const preapproval = await mpFetch('/preapproval', {
        method: 'POST',
        body: JSON.stringify({
          reason: description,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: Number(amount.toFixed(2)),
            currency_id: 'BRL',
          },
          payer_email: userEmail,
          back_url: `${origin}/pagamento?course=${encodeURIComponent(courseId)}&status=success&tx=${encodeURIComponent(transactionId)}`,
          external_reference: transactionId,
          metadata,
          status: 'pending',
        }),
      })

      return NextResponse.json({
        mode: 'subscription',
        preapprovalId: preapproval.id,
        initPoint: preapproval.init_point || preapproval.sandbox_init_point,
        status: preapproval.status,
      })
    }

    // Checkout Pro — cartão (parcelas) + PIX na página do Mercado Pago
    const preference = await mpFetch('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          {
            id: courseId || 'course',
            title: description,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: Number(amount.toFixed(2)),
          },
        ],
        payer: { email: userEmail, name: userName },
        external_reference: transactionId,
        metadata,
        notification_url: notificationUrl,
        back_urls: {
          success: `${origin}/pagamento?course=${encodeURIComponent(courseId)}&status=success&tx=${encodeURIComponent(transactionId)}`,
          pending: `${origin}/pagamento?course=${encodeURIComponent(courseId)}&status=pending&tx=${encodeURIComponent(transactionId)}`,
          failure: `${origin}/pagamento?course=${encodeURIComponent(courseId)}&status=failure&tx=${encodeURIComponent(transactionId)}`,
        },
        auto_return: 'approved',
        payment_methods: {
          installments: 12,
        },
        statement_descriptor: 'FLASHCONCARDS',
      }),
    })

    return NextResponse.json({
      mode: 'checkout',
      preferenceId: preference.id,
      initPoint: preference.init_point || preference.sandbox_init_point,
    })
  } catch (err) {
    console.error('[create-payment]', err)
    const message = err instanceof Error ? err.message : 'Erro ao criar pagamento'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
