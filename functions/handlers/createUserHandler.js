const admin = require('firebase-admin')
const {
  buildBrandedEmailHtml,
  paragraphsToHtml,
  sendBrandedEmail,
} = require('../emailUtils')

async function handleCreateUserAndSendEmail(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    const { email, name, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' })
    }

    const emailLower = email.toLowerCase().trim()

    const userRecord = await admin.auth().createUser({
      email: emailLower,
      password,
      displayName: name || emailLower.split('@')[0],
      emailVerified: false,
    })

    await admin.firestore().collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: emailLower,
      displayName: name || emailLower.split('@')[0],
      role: 'student',
      favorites: [],
      hasActiveSubscription: true,
      subscriptionStartDate: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      emailVerified: false,
    })

    const displayName = name || emailLower.split('@')[0]
    const loginUrl = 'https://www.flashconcards.com.br/login'
    const html = buildBrandedEmailHtml({
      title: 'Pagamento confirmado!',
      subtitle: 'Sua conta foi criada — verifique o email no primeiro acesso',
      bodyHtml: paragraphsToHtml([
        `Olá, ${displayName}!`,
        'Seu pagamento foi confirmado e sua conta foi criada automaticamente.',
        `Email de acesso: ${emailLower}`,
        `Senha temporária: ${password}`,
        'No primeiro login, você precisará confirmar seu email com um código de 6 dígitos. Se não receber, verifique spam ou lixeira.',
      ]),
      highlight: 'Guarde suas credenciais com segurança. Você pode alterar a senha após o primeiro acesso.',
      bullets: [
        'Flashcards inteligentes de todas as matérias',
        'FlashQuestões geradas por IA',
        'Flash Mentor — assistente personalizado',
        'Dashboard de progresso e ranking',
      ],
      ctaLabel: 'Acessar plataforma',
      ctaUrl: loginUrl,
      footerNote: 'Por segurança, não compartilhe sua senha com ninguém.',
    })

    await sendBrandedEmail({
      to: emailLower,
      subject: 'Pagamento confirmado — suas credenciais de acesso',
      html,
      text: `Olá, ${displayName}! Pagamento confirmado. Email: ${emailLower} Senha: ${password}. Acesse: ${loginUrl}`,
    })

    return res.status(200).json({
      success: true,
      uid: userRecord.uid,
      email: emailLower,
      message: 'Usuário criado e email enviado com sucesso',
    })
  } catch (error) {
    console.error('Erro ao criar usuário:', error)
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Este email já está cadastrado', code: 'EMAIL_EXISTS' })
    }
    return res.status(500).json({ error: 'Erro ao criar usuário', message: error.message })
  }
}

module.exports = { handleCreateUserAndSendEmail }
