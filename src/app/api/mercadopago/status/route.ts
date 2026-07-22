import { NextResponse } from 'next/server'
import { grantCourseAccess, getFirebaseAdminDb } from '@/lib/firebaseAdmin'
import { mpFetch } from '@/lib/mercadopago'

export const runtime = 'nodejs'

/** Consulta status do pagamento e libera acesso se aprovado (backup do webhook). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const paymentId = url.searchParams.get('paymentId') || ''
    const transactionId = url.searchParams.get('transactionId') || ''
    const userId = url.searchParams.get('userId') || ''
    const courseId = url.searchParams.get('courseId') || ''
    const planType = url.searchParams.get('planType') === 'monthly' ? 'monthly' : 'lifetime'

    if (!paymentId && !transactionId) {
      return NextResponse.json({ error: 'paymentId ou transactionId obrigatório' }, { status: 400 })
    }

    let payment: Record<string, unknown> | null = null
    if (paymentId) {
      payment = await mpFetch(`/v1/payments/${paymentId}`)
    }

    const status = String(payment?.status || '')
    const approved = status === 'approved' || status === 'authorized'

    if (approved) {
      const txId = String(payment?.external_reference || transactionId || '')
      const uid = String((payment?.metadata as { user_id?: string })?.user_id || userId)
      const cid = String((payment?.metadata as { course_id?: string })?.course_id || courseId)
      const plan =
        (payment?.metadata as { plan_type?: string })?.plan_type === 'monthly' ? 'monthly' : planType

      const adminDb = getFirebaseAdminDb()
      if (adminDb && txId) {
        await adminDb.collection('transactions').doc(txId).set(
          {
            status: 'paid',
            mercadopagoStatus: status,
            mercadopagoPaymentId: String(payment?.id || paymentId),
            paidAt: new Date(),
            updatedAt: new Date(),
          },
          { merge: true },
        )
      }

      if (uid && cid) {
        await grantCourseAccess({ userId: uid, courseId: cid, planType: plan, transactionId: txId })
      }
    }

    return NextResponse.json({
      status: status || 'unknown',
      approved,
      paymentId: payment?.id || paymentId,
    })
  } catch (err) {
    console.error('[mp status]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'erro' }, { status: 500 })
  }
}
