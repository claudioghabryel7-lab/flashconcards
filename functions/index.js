const functions = require('firebase-functions')
const admin = require('firebase-admin')
const nodemailer = require('nodemailer')
const cors = require('cors')({ origin: true })

admin.initializeApp()

// Configurar transporte de email (usando Gmail)
const createEmailTransporter = () => {
  // Pegar credenciais do Firebase Config ou variáveis de ambiente ou valores padrão
  const emailUser = functions.config().email?.user || process.env.EMAIL_USER || 'flashconcards@gmail.com'
  const emailPass = functions.config().email?.password || process.env.EMAIL_PASSWORD || 'rasw vyoj inal ginb'

  if (!emailUser || !emailPass) {
    console.error('Credenciais de email não configuradas!')
    return null
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass
    }
  })
}

// Função para criar usuário e enviar email com credenciais
exports.createUserAndSendEmail = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    try {
      const { email, name, password, transactionId } = req.body

      if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios' })
      }

      const emailLower = email.toLowerCase().trim()

      // Criar usuário no Firebase Authentication
      const userRecord = await admin.auth().createUser({
        email: emailLower,
        password: password,
        displayName: name || emailLower.split('@')[0],
        emailVerified: false
      })

      // Criar perfil no Firestore
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        uid: userRecord.uid,
        email: emailLower,
        displayName: name || emailLower.split('@')[0],
        role: 'student',
        favorites: [],
        hasActiveSubscription: true,
        subscriptionStartDate: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Enviar email com credenciais
      const transporter = createEmailTransporter()
      
      if (transporter) {
        const mailOptions = {
          from: `"Plegimentoria ALEGO" <${functions.config().email?.user || process.env.EMAIL_USER || 'flashconcards@gmail.com'}>`,
          to: emailLower,
          subject: '✅ Pagamento Confirmado - Suas Credenciais de Acesso',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .credentials { background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; }
                .credential-item { margin: 15px 0; }
                .label { font-weight: bold; color: #667eea; }
                .value { font-family: monospace; font-size: 16px; color: #333; background: #f5f5f5; padding: 10px; border-radius: 4px; margin-top: 5px; }
                .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🎉 Pagamento Confirmado!</h1>
                  <p>Sua compra foi processada com sucesso</p>
                </div>
                <div class="content">
                  <p>Olá, <strong>${name || emailLower.split('@')[0]}</strong>!</p>
                  
                  <p>Seu pagamento foi confirmado e sua conta foi criada automaticamente. Abaixo estão suas credenciais de acesso:</p>
                  
                  <div class="credentials">
                    <div class="credential-item">
                      <div class="label">📧 Email de Acesso:</div>
                      <div class="value">${emailLower}</div>
                    </div>
                    <div class="credential-item">
                      <div class="label">🔑 Senha:</div>
                      <div class="value">${password}</div>
                    </div>
                  </div>

                  <div class="warning">
                    <strong>⚠️ Importante:</strong> Guarde essas informações com segurança! Você pode alterar sua senha após o primeiro login.
                  </div>

                  <div style="text-align: center;">
                    <a href="https://flashconcards.vercel.app/login" class="button">Acessar Plataforma Agora</a>
                  </div>

                  <p>Com sua conta, você terá acesso a:</p>
                  <ul>
                    <li>📚 Flashcards Inteligentes de todas as matérias</li>
                    <li>❓ FlashQuestões geradas por IA</li>
                    <li>🤖 Flash Mentor - Assistente de IA personalizado</li>
                    <li>📊 Dashboard de progresso</li>
                    <li>🏆 Ranking de alunos</li>
                  </ul>

                  <p>Se tiver dúvidas, entre em contato conosco!</p>
                  
                  <p>Atenciosamente,<br><strong>Equipe Plegimentoria ALEGO</strong></p>
                </div>
              </div>
            </body>
            </html>
          `
        }

        await transporter.sendMail(mailOptions)
        console.log(`Email enviado para ${emailLower}`)
      } else {
        console.warn('Transporter não configurado - email não enviado')
      }

      // Retornar sucesso
      return res.status(200).json({
        success: true,
        uid: userRecord.uid,
        email: emailLower,
        message: 'Usuário criado e email enviado com sucesso'
      })

    } catch (error) {
      console.error('Erro ao criar usuário:', error)
      
      if (error.code === 'auth/email-already-exists') {
        return res.status(400).json({ 
          error: 'Este email já está cadastrado',
          code: 'EMAIL_EXISTS'
        })
      }

      return res.status(500).json({ 
        error: 'Erro ao criar usuário',
        message: error.message
      })
    }
  })
})

// Função para processar webhook do Mercado Pago (quando integrar)
exports.webhookMercadoPago = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Implementar quando integrar com Mercado Pago
    // Por enquanto, apenas retornar OK
    return res.status(200).json({ received: true })
  })
})
