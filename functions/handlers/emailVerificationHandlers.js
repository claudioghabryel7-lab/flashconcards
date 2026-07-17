const admin = require('firebase-admin')
const {
  buildEmailVerificationHtml,
  verifyAuthRequest,
  sendBrandedEmail,
  createEmailTransporter,
  getEmailCredentials,
  sendAccountWelcomeEmail,
  DEFAULT_FROM_NAME,
} = require('../emailUtils')

async function resolveUserEmail(uid, decodedEmail = '') {
  const fromToken = String(decodedEmail || '').toLowerCase().trim()
  if (fromToken) return fromToken

  const userRecord = await admin.auth().getUser(uid)
  const fromAuth = String(userRecord.email || '').toLowerCase().trim()
  if (fromAuth) return fromAuth

  const userDoc = await admin.firestore().collection('users').doc(uid).get()
  return String(userDoc.exists ? userDoc.data()?.email || '' : '')
    .toLowerCase()
    .trim()
}

function assertEmailTransportReady() {
  const transporter = createEmailTransporter()
  if (!transporter) {
    const { user } = getEmailCredentials()
    const err = new Error(
      `Serviço de email indisponível no servidor (conta ${user || 'não definida'}). ` +
        'Configure EMAIL_PASSWORD (Senha de app Google) no Firebase Functions.',
    )
    err.status = 503
    err.code = 'email_not_configured'
    throw err
  }
  return transporter
}

async function handleSendEmailVerificationCode(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  try {
    assertEmailTransportReady()

    const decoded = await verifyAuthRequest(req)
    const uid = decoded.uid
    const email = await resolveUserEmail(uid, decoded.email)
    if (!email) {
      return res.status(400).json({ error: 'Email não encontrado na conta. Faça logout e cadastre-se novamente.' })
    }

    const userRecord = await admin.auth().getUser(uid)
    if (userRecord.emailVerified) {
      await admin.firestore().collection('users').doc(uid).set(
        { emailVerified: true, email },
        { merge: true },
      )
      return res.status(200).json({ success: true, alreadyVerified: true })
    }

    const codeRef = admin.firestore().collection('emailVerificationCodes').doc(uid)
    const existing = await codeRef.get()
    if (existing.exists) {
      const lastSent = existing.data().lastSentAt?.toDate?.()
      if (lastSent && Date.now() - lastSent.getTime() < 60 * 1000) {
        return res.status(429).json({ error: 'Aguarde 1 minuto antes de reenviar o código.' })
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

    const userDoc = await admin.firestore().collection('users').doc(uid).get()
    const displayName = userDoc.data()?.displayName || email.split('@')[0]

    const html = buildEmailVerificationHtml({ code, displayName, email })

    try {
      await sendBrandedEmail({
        to: email,
        subject: `${code} — Confirme seu email | ${DEFAULT_FROM_NAME}`,
        html,
        text: `Seu código de verificação é ${code}. Válido por 30 minutos. Verifique também spam e lixeira.`,
      })
    } catch (sendErr) {
      console.error('[sendEmailVerificationCode] Falha SMTP:', sendErr?.code, sendErr?.message)
      await codeRef.delete().catch(() => {})
      throw sendErr
    }

    await codeRef.set({
      email,
      code,
      expiresAt,
      attempts: 0,
      lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    await admin.firestore().collection('users').doc(uid).set(
      { emailVerified: false, email },
      { merge: true },
    )

    console.log(`[sendEmailVerificationCode] Código enviado para ${email} (uid ${uid})`)
    return res.status(200).json({ success: true, message: 'Código de verificação enviado.', email })
  } catch (error) {
    console.error('[sendEmailVerificationCode]', error)
    const status = error.status || 500
    return res.status(status).json({
      error: error.message || 'Erro ao enviar código.',
      code: error.code || null,
    })
  }
}

async function handleVerifyEmailCode(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  try {
    const decoded = await verifyAuthRequest(req)
    const uid = decoded.uid
    const code = String(req.body?.code || '').trim()
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Informe o código de 6 dígitos.' })
    }

    const codeRef = admin.firestore().collection('emailVerificationCodes').doc(uid)
    const snap = await codeRef.get()
    if (!snap.exists) {
      return res.status(404).json({ error: 'Nenhum código pendente. Solicite um novo envio.' })
    }

    const data = snap.data()
    const expiresAt = data.expiresAt?.toDate?.() || data.expiresAt
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      await codeRef.delete().catch(() => {})
      return res.status(400).json({ error: 'Código expirado. Solicite um novo envio.' })
    }

    if ((data.attempts || 0) >= 8) {
      return res.status(429).json({ error: 'Muitas tentativas. Solicite um novo código.' })
    }

    if (data.code !== code) {
      await codeRef.set({ attempts: (data.attempts || 0) + 1 }, { merge: true })
      return res.status(400).json({ error: 'Código incorreto. Tente novamente.' })
    }

    await admin.auth().updateUser(uid, { emailVerified: true })
    await admin.firestore().collection('users').doc(uid).set(
      {
        emailVerified: true,
        emailVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    await codeRef.delete().catch(() => {})

    try {
      await sendAccountWelcomeEmail(uid)
    } catch (welcomeErr) {
      console.error('[verifyEmailCode] Boas-vindas pós-verificação:', welcomeErr?.message || welcomeErr)
    }

    return res.status(200).json({ success: true, message: 'Email verificado com sucesso!' })
  } catch (error) {
    console.error('[verifyEmailCode]', error)
    const status = error.status || 500
    return res.status(status).json({ error: error.message || 'Erro ao verificar código.' })
  }
}

module.exports = {
  handleSendEmailVerificationCode,
  handleVerifyEmailCode,
  assertEmailTransportReady,
}
