/**
 * Jobs de ciclo de vida — trial, purge, expiração, renovação automática.
 */

const admin = require('firebase-admin')
const { revokeCourseAccess } = require('../courseAccessExpiry')

const TRIAL_BATCH_LIMIT = 100
const PURGE_MAX_DELETES_PER_RUN = 40
const UNVERIFIED_EMAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000
const RENEWAL_NOTIFY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const ENTITLEMENT_EXPIRE_BATCH = 120

const PROTECTED_ADMIN_EMAILS = new Set(['claudioghabryel.cg@gmail.com'])

async function runExpireTrialUsers() {
  const now = new Date()
  const db = admin.firestore()
  const usersSnapshot = await db
    .collection('users')
    .where('trialExpiresAt', '!=', null)
    .limit(TRIAL_BATCH_LIMIT)
    .get()

  let softExpired = 0
  let errorCount = 0

  for (const userDoc of usersSnapshot.docs) {
    try {
      const userData = userDoc.data()
      const trialExpiresAt = userData.trialExpiresAt
      if (!trialExpiresAt) continue

      const expiresAt =
        typeof trialExpiresAt === 'string' ? new Date(trialExpiresAt) : trialExpiresAt.toDate()

      if (expiresAt >= now) continue
      if (userData.trialSoftExpired === true) continue

      const userId = userDoc.id
      console.log(`[expireTrialUsers] soft-expire ${userId} (${userData.email})`)

      await userDoc.ref.set(
        {
          trialSoftExpired: true,
          hasActiveSubscription: false,
          trialSoftExpiredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      )

      try {
        await admin.auth().updateUser(userId, { disabled: true })
      } catch (authErr) {
        if (authErr?.code !== 'auth/user-not-found') {
          console.warn('[expireTrialUsers] auth disable falhou', userId, authErr?.message)
        }
      }

      softExpired += 1
    } catch (err) {
      console.error(`[expireTrialUsers] erro ${userDoc.id}:`, err)
      errorCount += 1
    }
  }

  console.log(
    `[expireTrialUsers] softExpired=${softExpired} errors=${errorCount} scanned=${usersSnapshot.size}`,
  )
  return { softExpired, errorCount, scanned: usersSnapshot.size }
}

async function runPurgeUnverifiedEmails() {
  const db = admin.firestore()
  const cutoffMs = Date.now() - UNVERIFIED_EMAIL_TTL_MS
  let nextPageToken
  let scanned = 0
  let deleted = 0
  let skipped = 0
  let errors = 0

  console.log('[purgeUnverifiedEmails] Iniciando (>7 dias, max deletes/run)...')

  do {
    const listed = await admin.auth().listUsers(1000, nextPageToken)
    for (const authUser of listed.users) {
      if (deleted >= PURGE_MAX_DELETES_PER_RUN) {
        console.log('[purgeUnverifiedEmails] limite de batch atingido — continua no próximo tick')
        return { scanned, deleted, skipped, errors, batchLimitReached: true }
      }

      scanned += 1
      try {
        if (authUser.emailVerified) {
          skipped += 1
          continue
        }

        const email = String(authUser.email || '').toLowerCase().trim()
        if (email && PROTECTED_ADMIN_EMAILS.has(email)) {
          skipped += 1
          continue
        }

        const createdMs = new Date(authUser.metadata.creationTime).getTime()
        if (!Number.isFinite(createdMs) || createdMs > cutoffMs) {
          skipped += 1
          continue
        }

        const userRef = db.collection('users').doc(authUser.uid)
        const userSnap = await userRef.get()
        const userData = userSnap.exists ? userSnap.data() || {} : {}

        if (userData.role === 'admin' || PROTECTED_ADMIN_EMAILS.has(String(userData.email || '').toLowerCase())) {
          skipped += 1
          continue
        }

        if (userData.emailVerified === true) {
          skipped += 1
          continue
        }

        try {
          await admin.auth().deleteUser(authUser.uid)
        } catch (authErr) {
          if (authErr?.code !== 'auth/user-not-found') throw authErr
        }

        if (userSnap.exists) await userRef.delete()
        await db.collection('emailVerificationCodes').doc(authUser.uid).delete().catch(() => {})

        deleted += 1
      } catch (err) {
        errors += 1
        console.error(`[purgeUnverifiedEmails] erro ${authUser.uid}:`, err)
      }
    }
    nextPageToken = listed.pageToken
  } while (nextPageToken && deleted < PURGE_MAX_DELETES_PER_RUN)

  console.log(
    `[purgeUnverifiedEmails] scanned=${scanned} deleted=${deleted} skipped=${skipped} errors=${errors}`,
  )
  return { scanned, deleted, skipped, errors, batchLimitReached: false }
}

async function runExpireCourseAccesses() {
  const db = admin.firestore()
  const now = admin.firestore.Timestamp.now()
  const snap = await db
    .collection('courseEntitlements')
    .where('status', '==', 'active')
    .where('lifetime', '==', false)
    .where('expiresAt', '<=', now)
    .limit(ENTITLEMENT_EXPIRE_BATCH)
    .get()

  let expired = 0
  for (const docSnap of snap.docs) {
    const data = docSnap.data()
    if (data.autoRenew && data.expiresAt) {
      const exp = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt)
      const grace = new Date(exp.getTime() + 2 * 24 * 60 * 60 * 1000)
      if (grace > new Date()) continue
    }
    try {
      await revokeCourseAccess(db, admin.firestore.FieldValue, {
        userId: data.userId,
        courseId: data.courseId,
        reason: 'expired',
      })
      expired += 1
    } catch (err) {
      console.error('[expireCourseAccesses] falha', docSnap.id, err)
    }
  }

  console.log(`[expireCourseAccesses] expired=${expired} batch=${snap.size}`)
  return { expired, batch: snap.size, hasMore: snap.size >= ENTITLEMENT_EXPIRE_BATCH }
}

async function runProcessCourseAutoRenewals() {
  const db = admin.firestore()
  const now = new Date()
  const inThreeDays = admin.firestore.Timestamp.fromDate(
    new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
  )

  const snap = await db
    .collection('courseEntitlements')
    .where('status', '==', 'active')
    .where('autoRenew', '==', true)
    .where('lifetime', '==', false)
    .where('expiresAt', '<=', inThreeDays)
    .limit(80)
    .get()

  let notified = 0
  let skipped = 0

  for (const docSnap of snap.docs) {
    const data = docSnap.data()
    if (!data.userId || !data.courseId) continue
    if (data.preapprovalId || data.mercadopagoPreapprovalId) continue

    if (data.pendingRenewalTransactionId) {
      try {
        const pendingSnap = await db
          .collection('transactions')
          .doc(String(data.pendingRenewalTransactionId))
          .get()
        if (pendingSnap.exists) {
          const pendingStatus = pendingSnap.data()?.status
          if (pendingStatus === 'pending' || pendingStatus === 'approved' || pendingStatus === 'paid') {
            skipped += 1
            continue
          }
        }
      } catch (_) {
        /* ignore — segue para nova cobrança se txn sumiu */
      }
    }

    if (data.renewalNotifiedAt) {
      const notifiedAt = data.renewalNotifiedAt.toDate
        ? data.renewalNotifiedAt.toDate()
        : new Date(data.renewalNotifiedAt)
      if (now.getTime() - notifiedAt.getTime() < RENEWAL_NOTIFY_COOLDOWN_MS) {
        skipped += 1
        continue
      }
    }

    try {
      const userSnap = await db.collection('users').doc(data.userId).get()
      if (!userSnap.exists) continue
      const user = userSnap.data()
      const courseSnap = await db.collection('courses').doc(data.courseId).get()
      const course = courseSnap.exists ? courseSnap.data() : {}
      const amount = data.amount || course.price || 99.9
      const txnId = `REN-${Date.now()}-${String(data.userId).slice(0, 6)}`

      await db.collection('transactions').doc(txnId).set({
        userId: data.userId,
        userEmail: user.email || null,
        userName: user.displayName || null,
        productName: course.name || 'Renovação de curso',
        amount,
        paymentMethod: 'card',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        transactionId: txnId,
        courseId: data.courseId,
        courseDuration: data.courseDuration || course.courseDuration || null,
        autoRenew: true,
        isRenewal: true,
      })

      await db.collection('users').doc(data.userId).collection('notifications').add({
        type: 'course_renewal',
        title: 'Renovação do seu curso',
        message: `Seu acesso a "${course.name || 'curso'}" vence em breve. Conclua o pagamento para manter o acesso.`,
        courseId: data.courseId,
        transactionId: txnId,
        href: `/pagamento?course=${encodeURIComponent(data.courseId)}&txn=${encodeURIComponent(txnId)}&renew=1`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      await docSnap.ref.set(
        {
          renewalNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          pendingRenewalTransactionId: txnId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      notified += 1
    } catch (err) {
      console.error('[processCourseAutoRenewals] falha', docSnap.id, err)
    }
  }

  console.log(`[processCourseAutoRenewals] notified=${notified} skipped=${skipped}`)
  return { notified, skipped }
}

module.exports = {
  runExpireTrialUsers,
  runPurgeUnverifiedEmails,
  runExpireCourseAccesses,
  runProcessCourseAutoRenewals,
}
