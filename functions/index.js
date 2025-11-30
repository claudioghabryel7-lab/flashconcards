const functions = require('firebase-functions')
const admin = require('firebase-admin')
const nodemailer = require('nodemailer')
const cors = require('cors')({ origin: true })
const { MercadoPagoConfig, Payment } = require('mercadopago')

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

// Função para criar pagamento PIX real no Mercado Pago
exports.createPixPayment = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    try {
      const { amount, description, transactionId, userEmail, userName } = req.body

      console.log('Recebido no createPixPayment:', { amount, description, transactionId, userEmail, userName })

      // Validação mais detalhada
      if (!amount && amount !== 0) {
        console.error('Campo amount não fornecido')
        return res.status(400).json({ 
          error: 'Campo obrigatório faltando: amount',
          message: 'O valor do pagamento é obrigatório'
        })
      }
      
      if (!description) {
        console.error('Campo description não fornecido')
        return res.status(400).json({ 
          error: 'Campo obrigatório faltando: description',
          message: 'A descrição do pagamento é obrigatória'
        })
      }
      
      if (!transactionId) {
        console.error('Campo transactionId não fornecido')
        return res.status(400).json({ 
          error: 'Campo obrigatório faltando: transactionId',
          message: 'O ID da transação é obrigatório'
        })
      }

      // Validar que amount é um número válido
      const amountNumber = parseFloat(amount)
      if (isNaN(amountNumber) || amountNumber <= 0) {
        console.error('Valor inválido:', amount)
        return res.status(400).json({ 
          error: 'Valor inválido',
          message: `O valor do pagamento deve ser um número positivo. Recebido: ${amount}`
        })
      }

      // Obter Access Token do Mercado Pago
      const accessToken = functions.config().mercadopago?.access_token_prod || 
                         process.env.MERCADOPAGO_ACCESS_TOKEN_PROD ||
                         'APP_USR-3743437950896305-112812-559fadd346072c35f8cb81e21d4e562d-2583165550'

      // Configurar cliente do Mercado Pago
      const client = new MercadoPagoConfig({
        accessToken: accessToken,
        options: { timeout: 10000 }
      })

      const payment = new Payment(client)

      // Criar pagamento PIX
      const paymentData = {
        transaction_amount: amountNumber,
        description: description,
        payment_method_id: 'pix',
        payer: {
          email: userEmail || 'cliente@exemplo.com',
          first_name: userName || 'Cliente',
        },
        metadata: {
          transaction_id: transactionId,
        },
        notification_url: `${functions.config().app?.webhook_url || 'https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago'}`,
      }

      console.log('Criando pagamento PIX no Mercado Pago:', { amount, description, transactionId })
      
      const result = await payment.create({ body: paymentData })
      
      console.log('Resposta do Mercado Pago:', JSON.stringify(result, null, 2))

      // Verificar se o pagamento foi criado com sucesso
      if (!result || !result.id) {
        console.error('Pagamento não criado:', result)
        return res.status(500).json({ 
          error: 'Erro ao gerar PIX',
          message: 'Pagamento não foi criado no Mercado Pago',
          details: result
        })
      }

      // Extrair dados do PIX de várias formas possíveis
      const pixData = result.point_of_interaction?.transaction_data || {}
      let pixQrCode = pixData.qr_code || pixData.qr_code_base64 || null
      let pixCopyPaste = pixData.qr_code_base64 || pixData.qr_code || pixData.qr_code_base64_qr || null
      const ticketUrl = pixData.ticket_url || null

      // Se não tem código PIX, verificar outros campos possíveis
      if (!pixCopyPaste) {
        // Tentar extrair de outros lugares possíveis
        if (result.transaction_details?.transaction_data?.qr_code) {
          pixCopyPaste = result.transaction_details.transaction_data.qr_code
        }
      }
      
      // Se ainda não tem, tentar do próprio result
      if (!pixCopyPaste && result.qr_code) {
        pixCopyPaste = result.qr_code
      }
      if (!pixQrCode && pixCopyPaste) {
        pixQrCode = pixCopyPaste
      }

      // Se não tem código PIX, retornar erro mais descritivo
      if (!pixCopyPaste) {
        console.warn('Resposta do Mercado Pago sem código PIX:', {
          status: result.status,
          payment_method_id: result.payment_method_id,
          point_of_interaction: result.point_of_interaction,
          status_detail: result.status_detail
        })
        
        // Retornar erro mais claro
        return res.status(400).json({
          error: 'PIX não gerado',
          message: result.status_detail || 'Não foi possível gerar o código PIX. Verifique as configurações da conta do Mercado Pago.',
          paymentId: result.id,
          status: result.status,
          details: 'O código PIX não foi retornado pelo Mercado Pago. Verifique se a chave PIX está habilitada na sua conta.',
          rawResponse: result
        })
      }

      // Retornar sucesso com dados do PIX
      return res.status(200).json({
        success: true,
        paymentId: result.id,
        status: result.status,
        pixQrCode: pixQrCode,
        pixCopyPaste: pixCopyPaste,
        ticketUrl: ticketUrl,
      })

    } catch (error) {
      console.error('Erro ao criar pagamento PIX:', error)
      console.error('Stack:', error.stack)
      console.error('Response:', error.response?.data || error.response || error.cause || 'Sem resposta')
      
      // Verificar se é erro de PIX não habilitado
      const errorMessage = error.message || JSON.stringify(error.cause || {})
      if (errorMessage.includes('Collector user without key enabled for QR') || 
          errorMessage.includes('key enabled for QR')) {
        return res.status(400).json({ 
          error: 'PIX não habilitado na conta',
          message: 'Sua conta do Mercado Pago não tem a chave PIX habilitada. Acesse https://www.mercadopago.com.br/account/settings para habilitar o PIX.',
          code: 'PIX_NOT_ENABLED',
          solution: 'Habilite o PIX nas configurações da sua conta do Mercado Pago'
        })
      }
      
      return res.status(500).json({ 
        error: 'Erro ao criar pagamento PIX',
        message: error.message || 'Erro desconhecido',
        details: error.cause || error.response?.data || null
      })
    }
  })
})

// Função para processar webhook do Mercado Pago
exports.webhookMercadoPago = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      // O Mercado Pago envia os dados no body
      const { type, data } = req.body
      
      console.log('Webhook recebido:', { type, data })
      
      // Verificar se é um evento de pagamento
      if (type === 'payment' || type === 'payment.updated') {
        const paymentId = data?.id
        
        if (!paymentId) {
          console.error('Payment ID não encontrado')
          return res.status(400).json({ error: 'Payment ID não encontrado' })
        }
        
        // Buscar transação no Firestore pelo paymentId do Mercado Pago
        const transactionsRef = admin.firestore().collection('transactions')
        const snapshot = await transactionsRef
          .where('mercadopagoPaymentId', '==', paymentId.toString())
          .limit(1)
          .get()
        
        if (snapshot.empty) {
          console.log(`Transação não encontrada para paymentId: ${paymentId}`)
          // Retornar OK mesmo assim (pode ser um pagamento de teste ou de outro sistema)
          return res.status(200).json({ received: true, message: 'Transação não encontrada' })
        }
        
        const transactionDoc = snapshot.docs[0]
        const transactionData = transactionDoc.data()
        
        // Buscar informações do pagamento no Mercado Pago usando o Access Token
        // Nota: Em produção, você precisaria instalar o SDK: npm install mercadopago
        // Por enquanto, vamos atualizar baseado nos dados recebidos do webhook
        
        // O webhook do Mercado Pago envia o status do pagamento
        const paymentStatus = data?.status || 'pending'
        
        // Mapear status do Mercado Pago para nosso sistema
        let newStatus = 'pending'
        if (paymentStatus === 'approved') {
          newStatus = 'paid'
        } else if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
          newStatus = 'cancelled'
        }
        
        // Atualizar transação no Firestore
        await transactionDoc.ref.update({
          status: newStatus,
          mercadopagoStatus: paymentStatus,
          mercadopagoPaymentId: paymentId.toString(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(newStatus === 'paid' && {
            paidAt: admin.firestore.FieldValue.serverTimestamp()
          })
        })
        
        console.log(`Transação ${transactionDoc.id} atualizada para status: ${newStatus}`)
        
        // Se pagamento foi aprovado, ativar acesso do usuário
        if (newStatus === 'paid') {
          const userId = transactionData.userId
          const userEmail = transactionData.userEmail
          
          if (userId) {
            // Usuário já existe - apenas ativar acesso
            const userRef = admin.firestore().collection('users').doc(userId)
            const userDoc = await userRef.get()
            
            if (userDoc.exists()) {
              await userRef.update({
                hasActiveSubscription: true,
                subscriptionStartDate: admin.firestore.FieldValue.serverTimestamp(),
                lastPaymentDate: admin.firestore.FieldValue.serverTimestamp()
              })
              console.log(`Acesso ativado para usuário: ${userId}`)
            }
          } else if (userEmail) {
            // Usuário ainda não existe - será criado quando processar o pagamento
            // Por enquanto, apenas logar
            console.log(`Pagamento aprovado para email: ${userEmail}, mas usuário ainda não criado`)
          }
        }
        
        return res.status(200).json({ 
          received: true, 
          transactionId: transactionDoc.id,
          status: newStatus
        })
      }
      
      // Se não for um evento de pagamento, apenas confirmar recebimento
      return res.status(200).json({ received: true, message: 'Evento não processado' })
      
    } catch (error) {
      console.error('Erro ao processar webhook do Mercado Pago:', error)
      // Sempre retornar 200 para o Mercado Pago não tentar reenviar
      return res.status(200).json({ 
        received: true, 
        error: error.message 
      })
    }
  })
})
