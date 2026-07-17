/**
 * Lógica compartilhada de confirmação de pagamento (webhook + reconciliação).
 */

const { grantCourseAccess } = require('./courseAccessExpiry')
const { createEmailTransporter } = require('./emailUtils')
const { readLegacyConfig } = require('./mercadopagoConfig')

function generatePassword() {
  const length = 12
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'
  let password = ''
  for (let i = 0; i < length; i += 1) {
    password += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return password
}

function mapMercadoPagoStatus(paymentStatus) {
  if (paymentStatus === 'approved') return 'paid'
  if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') return 'cancelled'
  return 'pending'
}

async function loadCourseDuration(admin, transactionData) {
  let courseDuration = transactionData.courseDuration || null
  let courseDurationUnit = transactionData.courseDurationUnit || null
  let courseDurationValue = transactionData.courseDurationValue ?? null
  const courseId = transactionData.courseId || null

  if ((!courseDuration && !courseDurationUnit) && courseId) {
    try {
      const courseSnap = await admin.firestore().collection('courses').doc(courseId).get()
      if (courseSnap.exists) {
        const c = courseSnap.data() || {}
        courseDuration = c.courseDuration || null
        courseDurationUnit = c.courseDurationUnit || null
        courseDurationValue = c.courseDurationValue ?? null
      }
    } catch (_) {
      /* ignore */
    }
  }

  return { courseDuration, courseDurationUnit, courseDurationValue, courseId }
}

/**
 * Atualiza transação e concede acesso quando pagamento aprovado.
 * @returns {{ newStatus: string, fulfilled: boolean }}
 */
async function syncTransactionPaymentStatus(admin, functions, {
  transactionDoc,
  transactionData,
  paymentId,
  paymentStatus,
}) {
  const newStatus = mapMercadoPagoStatus(paymentStatus)
  const currentStatus = String(transactionData.status || '').toLowerCase()

  if (
    (currentStatus === 'paid' || currentStatus === 'approved') &&
    newStatus === 'paid'
  ) {
    return { newStatus: 'paid', fulfilled: false }
  }

  await transactionDoc.ref.update({
    status: newStatus,
    mercadopagoStatus: paymentStatus,
    mercadopagoPaymentId: paymentId != null ? String(paymentId) : transactionData.mercadopagoPaymentId || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(newStatus === 'paid' && {
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
  })

  if (newStatus !== 'paid') {
    return { newStatus, fulfilled: false }
  }

  await fulfillApprovedPayment(admin, functions, { transactionDoc, transactionData })
  return { newStatus, fulfilled: true }
}

async function fulfillApprovedPayment(admin, functions, { transactionDoc, transactionData }) {
  const userId = transactionData.userId
  const userEmail = transactionData.userEmail
  const userName = transactionData.userName || userEmail?.split('@')[0] || 'Cliente'

  if (!transactionData.courseId) {
    console.warn(
      `⚠️ Transação ${transactionDoc.id} sem courseId — verifique seleção do curso.`,
    )
  }

  const { courseDuration, courseDurationUnit, courseDurationValue, courseId } =
    await loadCourseDuration(admin, transactionData)

  if (userId) {
    const userRef = admin.firestore().collection('users').doc(userId)
    const userDoc = await userRef.get()

    if (userDoc.exists) {
      if (courseId) {
        await grantCourseAccess(admin.firestore(), admin.firestore.FieldValue, {
          userId,
          courseId,
          courseDuration,
          courseDurationUnit,
          courseDurationValue,
          autoRenew: Boolean(transactionData.autoRenew),
          paymentMethod: transactionData.paymentMethod || null,
          transactionId: transactionDoc.id,
          amount: transactionData.amount || null,
          extendFromCurrent: Boolean(transactionData.isRenewal),
          preapprovalId: transactionData.mercadopagoPreapprovalId || null,
        })
      } else {
        await userRef.update({
          hasActiveSubscription: true,
          lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
        })
      }
      console.log(`✅ Acesso ativado para usuário: ${userId}, curso: ${courseId}`)
    } else {
      console.error(`Usuário ${userId} não encontrado no Firestore`)
    }
    return
  }

  if (!userEmail) return

  try {
    const password = generatePassword()
    const userRecord = await admin.auth().createUser({
      email: userEmail.toLowerCase().trim(),
      password,
      displayName: userName,
      emailVerified: false,
    })

    await admin.firestore().collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: userEmail.toLowerCase().trim(),
      displayName: userName,
      role: 'student',
      favorites: [],
      hasActiveSubscription: true,
      subscriptionStartDate: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      purchasedCourses: [],
      selectedCourseId: courseId || null,
    })

    if (courseId) {
      await grantCourseAccess(admin.firestore(), admin.firestore.FieldValue, {
        userId: userRecord.uid,
        courseId,
        courseDuration,
        courseDurationUnit,
        courseDurationValue,
        autoRenew: Boolean(transactionData.autoRenew),
        paymentMethod: transactionData.paymentMethod || null,
        transactionId: transactionDoc.id,
        amount: transactionData.amount || null,
        preapprovalId: transactionData.mercadopagoPreapprovalId || null,
      })
    }

    await transactionDoc.ref.update({ userId: userRecord.uid })

    const transporter = createEmailTransporter()
    if (transporter) {
      const legacy = readLegacyConfig()
      const fromEmail =
        process.env.EMAIL_USER ||
        legacy.email?.user ||
        'flashconcards@gmail.com'
      await transporter.sendMail({
        from: `"Plegimentoria ALEGO" <${fromEmail}>`,
        to: userEmail.toLowerCase().trim(),
        subject: '✅ Pagamento Confirmado - Suas Credenciais de Acesso',
        html: `
          <p>Olá, <strong>${userName}</strong>!</p>
          <p>Seu pagamento foi confirmado.</p>
          <p><strong>Email:</strong> ${userEmail.toLowerCase().trim()}</p>
          <p><strong>Senha:</strong> ${password}</p>
          <p><a href="https://www.flashconcards.com.br/login">Acessar plataforma</a></p>
        `,
      })
    }

    console.log(`✅ Novo usuário criado: ${userRecord.uid}`)
  } catch (error) {
    console.error('Erro ao criar usuário após pagamento:', error)
  }
}

module.exports = {
  mapMercadoPagoStatus,
  syncTransactionPaymentStatus,
  fulfillApprovedPayment,
}
