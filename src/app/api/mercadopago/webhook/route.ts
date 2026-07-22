import { NextResponse } from 'next/server'
import { grantCourseAccess, getFirebaseAdminDb } from '@/lib/firebaseAdmin'
import { mpFetch } from '@/lib/mercadopago'

export const runtime = 'nodejs'

async function processPaymentId(paymentId: string) {
  const payment = await mpFetch(`/v1/payments/${paymentId}`)
  const status = String(payment.status || '')
  const transactionId = String(
    payment.external_reference || payment.metadata?.transaction_id || '',
  )
  const userId = String(payment.metadata?.user_id || '')
  const courseId = String(payment.metadata?.course_id || '')
  const planType = payment.metadata?.plan_type === 'monthly' ? 'monthly' : 'lifetime'

  if (status !== 'approved' && status !== 'authorized') {
    // Atualiza status pendente/rejeitado se possível
    const adminDb = getFirebaseAdminDb()
    if (adminDb && transactionId) {
      await adminDb.collection('transactions').doc(transactionId).set(
        {
          status: status === 'rejected' || status === 'cancelled' ? 'error' : 'pending',
          mercadopagoStatus: status,
          mercadopagoPaymentId: String(payment.id),
          updatedAt: new Date(),
        },
        { merge: true },
      )
    }
    return { ok: true, status, unlocked: false }
  }

  const adminDb = getFirebaseAdminDb()
  if (adminDb && transactionId) {
    await adminDb.collection('transactions').doc(transactionId).set(
      {
        status: 'paid',
        mercadopagoStatus: status,
        mercadopagoPaymentId: String(payment.id),
        paidAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    )
  }

  let unlocked = false
  if (userId && courseId) {
    unlocked = await grantCourseAccess({ userId, courseId, planType, transactionId })
  }

  return { ok: true, status, unlocked, transactionId, userId, courseId }
}

/**
 * Webhook Mercado Pago — libera acesso na confirmação.
 * Também aceita ?id= / topic=payment (query IPN clássico).
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    let paymentId =
      url.searchParams.get('data.id') ||
      url.searchParams.get('id') ||
      ''

    const body = await req.json().catch(() => ({}))
    if (!paymentId) {
      paymentId = String(body?.data?.id || body?.id || '')
    }

    const type = String(body?.type || body?.action || url.searchParams.get('topic') || 'payment')

    if (type.includes('subscription') || type.includes('preapproval')) {
      // Assinatura: busca preapproval e libera se authorized
      const preapprovalId = String(body?.data?.id || paymentId || '')
      if (preapprovalId) {
        const pre = await mpFetch(`/preapproval/${preapprovalId}`)
        const status = String(pre.status || '')
        const transactionId = String(pre.external_reference || pre.metadata?.transaction_id || '')
        const userId = String(pre.metadata?.user_id || '')
        const courseId = String(pre.metadata?.course_id || '')
        if ((status === 'authorized' || status === 'approved') && userId && courseId) {
          await grantCourseAccess({
            userId,
            courseId,
            planType: 'monthly',
            transactionId,
          })
          const adminDb = getFirebaseAdminDb()
          if (adminDb && transactionId) {
            await adminDb.collection('transactions').doc(transactionId).set(
              {
                status: 'paid',
                mercadopagoStatus: status,
                mercadopagoPreapprovalId: preapprovalId,
                paidAt: new Date(),
                updatedAt: new Date(),
              },
              { merge: true },
            )
          }
        }
      }
      return NextResponse.json({ received: true })
    }

    if (!paymentId) {
      return NextResponse.json({ received: true, message: 'sem payment id' })
    }

    const result = await processPaymentId(paymentId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[mp webhook]', err)
    // Sempre 200 para o MP não reenviar em loop infinito por erro nosso
    return NextResponse.json({ received: true, error: String(err) })
  }
}

export async function GET(req: Request) {
  // IPN legado via querystring
  return POST(req)
}
