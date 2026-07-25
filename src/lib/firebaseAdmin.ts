/**
 * Firebase Admin (somente servidor). Requer FIREBASE_SERVICE_ACCOUNT_JSON
 * ou GOOGLE_APPLICATION_CREDENTIALS. Sem credencial, grantAccess falha de forma segura.
 */
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let app: App | null = null
let db: Firestore | null = null

/** Inicializa (ou reutiliza) o app Admin. Null se não houver credencial. */
export function getFirebaseAdminApp(): App | null {
  try {
    if (!getApps().length) {
      const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ''
      if (json.trim()) {
        const sa = JSON.parse(json)
        app = initializeApp({ credential: cert(sa) })
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        app = initializeApp()
      } else {
        console.warn(
          '[firebaseAdmin] Sem credencial de service account — auth/API e webhook limitados.',
        )
        return null
      }
    } else {
      app = getApps()[0]!
    }
    return app
  } catch (err) {
    console.error('[firebaseAdmin] init falhou:', err)
    return null
  }
}

export function getFirebaseAdminDb(): Firestore | null {
  if (db) return db
  const adminApp = getFirebaseAdminApp()
  if (!adminApp) return null
  try {
    db = getFirestore(adminApp)
    return db
  } catch (err) {
    console.error('[firebaseAdmin] Firestore falhou:', err)
    return null
  }
}

export async function grantCourseAccess({
  userId,
  courseId,
  planType = 'lifetime',
  transactionId,
}: {
  userId: string
  courseId: string
  planType?: 'lifetime' | 'monthly'
  transactionId?: string
}) {
  const adminDb = getFirebaseAdminDb()
  if (!adminDb || !userId || !courseId) return false

  const userRef = adminDb.collection('users').doc(userId)
  const snap = await userRef.get()
  const data = snap.exists ? snap.data() || {} : {}
  const purchased: string[] = Array.isArray(data.purchasedCourses) ? [...data.purchasedCourses] : []
  if (!purchased.includes(courseId)) purchased.push(courseId)

  const patch: Record<string, unknown> = {
    purchasedCourses: purchased,
    selectedCourseId: data.selectedCourseId || courseId,
    hasActiveSubscription: true,
    lastPaymentDate: new Date(),
    updatedAt: new Date(),
  }

  if (planType === 'monthly') {
    patch.subscriptionPlan = 'monthly'
    patch.subscriptionCourseId = courseId
    patch.subscriptionStartDate = data.subscriptionStartDate || new Date()
  } else {
    patch.subscriptionPlan = 'lifetime'
  }

  await userRef.set(patch, { merge: true })

  if (transactionId) {
    await adminDb.collection('transactions').doc(transactionId).set(
      {
        status: 'paid',
        paidAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    )
  }

  return true
}
