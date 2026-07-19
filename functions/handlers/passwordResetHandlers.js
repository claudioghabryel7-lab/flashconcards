const admin = require('firebase-admin')
const crypto = require('crypto')
const {
  buildBrandedEmailHtml,
  paragraphsToHtml,
  sendBrandedEmail,
  DEFAULT_FROM_NAME,
} = require('../emailUtils')

async function handleSendPasswordResetEmail(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  try {
    const { email } = req.body || {}
    if (!email) return res.status(400).json({ error: 'Email é obrigatório' })

    const emailLower = email.toLowerCase().trim()

    try {
      await admin.auth().getUserByEmail(emailLower)
    } catch (authError) {
      if (authError.code === 'auth/user-not-found') {
        return res.status(404).json({ error: 'Usuário não encontrado no Firebase Authentication' })
      }
      throw authError
    }

    const token = `${crypto.randomUUID()}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 15)}`
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    await admin.firestore().collection('passwordResetTokens').doc(token).set({
      email: emailLower,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      used: false,
    })

    const baseUrl = (req.body.baseUrl || 'https://www.flashconcards.com.br').replace(/\/$/, '')
    const resetLink = `${baseUrl}/reset/${token}`

    const html = buildBrandedEmailHtml({
      title: '🔒 Redefinir Senha',
      subtitle: 'Você solicitou a redefinição da sua senha',
      bodyHtml: paragraphsToHtml([
        'Olá!',
        `Recebemos uma solicitação para redefinir a senha da conta ${emailLower}.`,
        'Clique no botão abaixo para criar uma nova senha. O link expira em 24 horas.',
        'Se você não solicitou esta redefinição, ignore este email — sua senha permanecerá inalterada.',
      ]),
      ctaLabel: 'Redefinir Minha Senha',
      ctaUrl: resetLink,
    })

    await sendBrandedEmail({
      to: emailLower,
      subject: `🔒 Redefinir Senha - ${DEFAULT_FROM_NAME}`,
      html,
      text: `Redefina sua senha em: ${resetLink}`,
    })

    return res.status(200).json({ success: true, message: 'Email de redefinição de senha enviado com sucesso' })
  } catch (error) {
    console.error('Erro ao enviar email de redefinição:', error)
    return res.status(error.status || 500).json({
      error: error.message || 'Erro ao enviar email',
      details: error.message,
    })
  }
}

async function handleUpdateUserPassword(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  try {
    const { token, newPassword } = req.body || {}
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' })
    }

    const tokenRef = admin.firestore().collection('passwordResetTokens').doc(token)
    const tokenDoc = await tokenRef.get()
    if (!tokenDoc.exists) {
      return res.status(404).json({ error: 'Token inválido ou expirado' })
    }

    const tokenData = tokenDoc.data()
    const now = new Date()
    const expiresAt = tokenData.expiresAt?.toDate?.() || new Date(0)

    if (now > expiresAt) {
      await tokenRef.delete()
      return res.status(400).json({ error: 'Token expirado' })
    }
    if (tokenData.used === true) {
      return res.status(400).json({ error: 'Token já foi usado' })
    }

    const userRecord = await admin.auth().getUserByEmail(tokenData.email)
    await admin.auth().updateUser(userRecord.uid, { password: newPassword })
    await tokenRef.update({
      used: true,
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    return res.status(200).json({ success: true, message: 'Senha atualizada com sucesso' })
  } catch (error) {
    console.error('Erro na função updateUserPassword:', error)
    return res.status(500).json({ error: 'Erro ao processar', details: error.message })
  }
}

module.exports = { handleSendPasswordResetEmail, handleUpdateUserPassword }
