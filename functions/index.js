const functions = require('firebase-functions')
const admin = require('firebase-admin')
const nodemailer = require('nodemailer')
const cors = require('cors')({ 
  origin: ['https://www.flashconcards.com.br', 'https://flashconcards.com.br', 'http://localhost:5173'],
  credentials: true 
})
const { MercadoPagoConfig, Payment } = require('mercadopago')
const { GoogleGenerativeAI } = require('@google/generative-ai')

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
      
      // Código PIX copia-e-cola (string longa que começa com 000201...)
      // NÃO usar qr_code_base64 aqui, pois esse é a imagem, não o código
      let pixCopyPaste = pixData.qr_code || null
      
      // Imagem do QR Code em base64 (para exibir diretamente)
      // Este é um PNG em base64, NÃO é o código PIX copia-e-cola
      let pixQrCodeBase64 = pixData.qr_code_base64 || null
      
      // URL do ticket (link para pagamento)
      const ticketUrl = pixData.ticket_url || null

      // Se não tem código PIX copia-e-cola, verificar outros campos possíveis
      if (!pixCopyPaste) {
        // Tentar extrair de outros lugares possíveis
        if (result.transaction_details?.transaction_data?.qr_code) {
          pixCopyPaste = result.transaction_details.transaction_data.qr_code
        }
        
        // Tentar do próprio result
        if (!pixCopyPaste && result.qr_code) {
          pixCopyPaste = result.qr_code
        }
      }
      
      // Validar que pixCopyPaste não é uma imagem base64
      // O código PIX copia-e-cola começa com "000201" (EMV QR Code)
      if (pixCopyPaste && pixCopyPaste.startsWith('iVBORw0KGgo')) {
        // Isso é uma imagem PNG base64, não o código PIX
        console.warn('pixCopyPaste parece ser uma imagem base64, não um código PIX. Tentando encontrar o código correto...')
        pixCopyPaste = null
      }
      
      // Se não tem imagem base64, mas tem código PIX, podemos gerar a imagem depois
      // ou usar o ticket_url para exibir o QR Code
      
      console.log('Dados PIX extraídos:', {
        hasCopyPaste: !!pixCopyPaste,
        hasQrCodeBase64: !!pixQrCodeBase64,
        copyPasteLength: pixCopyPaste?.length || 0,
        copyPasteStart: pixCopyPaste?.substring(0, 20) || 'N/A'
      })

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
        pixQrCode: pixQrCodeBase64, // Imagem base64 do QR Code
        pixCopyPaste: pixCopyPaste, // Código PIX copia-e-cola (string)
        ticketUrl: ticketUrl,
        // Incluir resposta completa para debug
        rawResponse: result
      })

    } catch (error) {
      console.error('Erro ao criar pagamento PIX:', error)
      console.error('Stack:', error.stack)
      console.error('Response:', error.response?.data || error.response || error.cause || 'Sem resposta')
      
      // Verificar se é erro de PIX não habilitado
      const errorMessage = error.message || ''
      const errorCause = JSON.stringify(error.cause || {})
      const errorString = errorMessage + ' ' + errorCause
      
      console.log('Analisando erro:', { errorMessage, errorCause, errorString })
      
      if (errorString.includes('Collector user without key enabled for QR') || 
          errorString.includes('key enabled for QR') ||
          errorString.includes('13253') || // Código de erro do Mercado Pago
          errorString.includes('Financial Identity Use Case')) {
        console.log('Erro detectado: PIX não habilitado na conta')
        return res.status(400).json({ 
          error: 'PIX não habilitado na conta',
          message: 'Sua conta do Mercado Pago não tem a chave PIX habilitada. Para habilitar, acesse o painel do Mercado Pago e configure sua chave PIX.',
          code: 'PIX_NOT_ENABLED',
          solution: 'Habilite o PIX nas configurações da sua conta do Mercado Pago. Acesse: https://www.mercadopago.com.br/account/settings ou entre em contato com o suporte do Mercado Pago.',
          details: error.message || 'Chave PIX não configurada na conta'
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
        
        // Tentar buscar com diferentes formatos do paymentId
        let snapshot = await transactionsRef
          .where('mercadopagoPaymentId', '==', paymentId.toString())
          .limit(1)
          .get()
        
        // Se não encontrou, tentar com número
        if (snapshot.empty) {
          snapshot = await transactionsRef
            .where('mercadopagoPaymentId', '==', parseInt(paymentId))
            .limit(1)
            .get()
        }
        
        // Se ainda não encontrou, buscar por metadata no Mercado Pago e usar transactionId
        if (snapshot.empty) {
          console.log(`Transação não encontrada para paymentId: ${paymentId}, tentando buscar no Mercado Pago...`)
          
          try {
            const accessToken = functions.config().mercadopago?.access_token_prod || 
                               process.env.MERCADOPAGO_ACCESS_TOKEN_PROD ||
                               'APP_USR-3743437950896305-112812-559fadd346072c35f8cb81e21d4e562d-2583165550'
            
            const client = new MercadoPagoConfig({
              accessToken: accessToken,
              options: { timeout: 10000 }
            })
            
            const payment = new Payment(client)
            const paymentInfo = await payment.get({ id: paymentId.toString() })
            
            // Buscar transactionId no metadata
            const transactionId = paymentInfo?.metadata?.transaction_id
            
            if (transactionId) {
              console.log(`Encontrado transactionId no metadata: ${transactionId}`)
              const transactionDoc = await transactionsRef.doc(transactionId).get()
              
              if (transactionDoc.exists()) {
                // Processar com este documento
                snapshot = {
                  docs: [transactionDoc],
                  empty: false
                }
              }
            }
          } catch (error) {
            console.error('Erro ao buscar pagamento no Mercado Pago:', error)
          }
        }
        
        if (snapshot.empty) {
          console.log(`Transação não encontrada para paymentId: ${paymentId}`)
          console.log('Webhook completo recebido:', JSON.stringify(req.body, null, 2))
          // Retornar OK mesmo assim para o Mercado Pago não tentar reenviar
          return res.status(200).json({ received: true, message: 'Transação não encontrada' })
        }
        
        const transactionDoc = snapshot.docs[0]
        const transactionData = transactionDoc.data()
        
        // Buscar informações do pagamento no Mercado Pago usando a API
        const accessToken = functions.config().mercadopago?.access_token_prod || 
                           process.env.MERCADOPAGO_ACCESS_TOKEN_PROD ||
                           'APP_USR-3743437950896305-112812-559fadd346072c35f8cb81e21d4e562d-2583165550'
        
        const client = new MercadoPagoConfig({
          accessToken: accessToken,
          options: { timeout: 10000 }
        })
        
        const payment = new Payment(client)
        
        // Buscar status real do pagamento no Mercado Pago
        let paymentInfo = null
        try {
          paymentInfo = await payment.get({ id: paymentId.toString() })
          console.log('Status do pagamento no Mercado Pago:', paymentInfo.status)
        } catch (error) {
          console.error('Erro ao buscar pagamento no Mercado Pago:', error)
          // Continuar com os dados do webhook se falhar
        }
        
        // Usar status do pagamento buscado ou do webhook
        const paymentStatus = paymentInfo?.status || data?.status || 'pending'
        
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
        console.log(`Dados da transação:`, {
          userId: transactionData.userId,
          userEmail: transactionData.userEmail,
          courseId: transactionData.courseId,
          productName: transactionData.productName
        })
        
        // Se pagamento foi aprovado, criar usuário e enviar email
        if (newStatus === 'paid') {
          const userId = transactionData.userId
          const userEmail = transactionData.userEmail
          const userName = transactionData.userName || userEmail?.split('@')[0] || 'Cliente'
          
          // Verificar se courseId existe
          if (!transactionData.courseId) {
            console.warn(`⚠️ ATENÇÃO: Transação ${transactionDoc.id} não tem courseId! Verifique se o curso foi selecionado corretamente.`)
          }
          
          // Função auxiliar para gerar senha
          const generatePassword = () => {
            const length = 12
            const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'
            let password = ''
            for (let i = 0; i < length; i++) {
              password += charset.charAt(Math.floor(Math.random() * charset.length))
            }
            return password
          }
          
          // Obter courseId da transação
          const courseId = transactionData.courseId || null
          console.log(`CourseId da transação: ${courseId}, UserId: ${userId}, UserEmail: ${userEmail}`)
          
          if (userId) {
            // Usuário já existe - apenas ativar acesso e adicionar curso comprado
            const userRef = admin.firestore().collection('users').doc(userId)
            const userDoc = await userRef.get()
            
            if (userDoc.exists()) {
              const userData = userDoc.data()
              const currentPurchasedCourses = userData.purchasedCourses || []
              
              // Adicionar curso se não estiver na lista
              let updatedPurchasedCourses = [...currentPurchasedCourses]
              if (courseId && !updatedPurchasedCourses.includes(courseId)) {
                updatedPurchasedCourses.push(courseId)
                console.log(`Adicionando curso ${courseId} ao usuário ${userId}. Cursos anteriores: ${currentPurchasedCourses.join(', ')}, Cursos atualizados: ${updatedPurchasedCourses.join(', ')}`)
              } else if (courseId) {
                console.log(`Curso ${courseId} já está na lista do usuário ${userId}`)
              } else {
                console.warn(`CourseId é null ou undefined para transação ${transactionDoc.id}`)
              }
              
              const updateData = {
                hasActiveSubscription: true,
                lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
                purchasedCourses: updatedPurchasedCourses,
              }
              
              // Adicionar subscriptionStartDate apenas se não existir
              if (!userData.subscriptionStartDate) {
                updateData.subscriptionStartDate = admin.firestore.FieldValue.serverTimestamp()
              }
              
              // Se não tem curso selecionado, selecionar o curso comprado
              if (courseId && !userData.selectedCourseId) {
                updateData.selectedCourseId = courseId
              }
              
              await userRef.update(updateData)
              console.log(`✅ Acesso ativado para usuário: ${userId}, curso adicionado: ${courseId}, purchasedCourses: ${updatedPurchasedCourses.join(', ')}`)
            } else {
              console.error(`Usuário ${userId} não encontrado no Firestore`)
            }
          } else if (userEmail) {
            // Usuário não existe - criar usuário e enviar email
            try {
              const password = generatePassword()
              
              // Criar usuário no Firebase Authentication
              const userRecord = await admin.auth().createUser({
                email: userEmail.toLowerCase().trim(),
                password: password,
                displayName: userName,
                emailVerified: false
              })
              
              // Criar perfil no Firestore com curso comprado
              const purchasedCourses = courseId ? [courseId] : []
              
              console.log(`Criando novo usuário ${userRecord.uid} com curso ${courseId}, purchasedCourses: ${purchasedCourses.join(', ')}`)
              
              await admin.firestore().collection('users').doc(userRecord.uid).set({
                uid: userRecord.uid,
                email: userEmail.toLowerCase().trim(),
                displayName: userName,
                role: 'student',
                favorites: [],
                hasActiveSubscription: true,
                subscriptionStartDate: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                purchasedCourses: purchasedCourses,
                selectedCourseId: courseId || null,
              })
              
              console.log(`✅ Novo usuário criado: ${userRecord.uid} com curso ${courseId}`)
              
              // Atualizar transação com userId
              await transactionDoc.ref.update({
                userId: userRecord.uid
              })
              
              // Enviar email com credenciais
              const transporter = createEmailTransporter()
              if (transporter) {
                const mailOptions = {
                  from: `"Plegimentoria ALEGO" <${functions.config().email?.user || process.env.EMAIL_USER || 'flashconcards@gmail.com'}>`,
                  to: userEmail.toLowerCase().trim(),
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
                          <p>Olá, <strong>${userName}</strong>!</p>
                          
                          <p>Seu pagamento foi confirmado e sua conta foi criada automaticamente. Abaixo estão suas credenciais de acesso:</p>
                          
                          <div class="credentials">
                            <div class="credential-item">
                              <div class="label">📧 Email de Acesso:</div>
                              <div class="value">${userEmail.toLowerCase().trim()}</div>
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
                console.log(`Email enviado para ${userEmail} com credenciais`)
              } else {
                console.warn('Transporter não configurado - email não enviado')
              }
              
              console.log(`Usuário criado e email enviado para: ${userEmail}`)
            } catch (error) {
              console.error('Erro ao criar usuário:', error)
              // Não bloquear o webhook mesmo se falhar criar usuário
            }
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

// Função para enviar email com resultado do simulado compartilhado
exports.sendSimuladoResultEmail = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    try {
      const { email, results, simuladoName, courseName } = req.body

      if (!email || !results) {
        return res.status(400).json({ error: 'Email e resultados são obrigatórios' })
      }

      const transporter = createEmailTransporter()
      if (!transporter) {
        return res.status(500).json({ error: 'Serviço de email não configurado' })
      }

      // Formatar resultados
      const accuracy = results.accuracy || 0
      const finalScore = results.finalScore || 0
      const objectiveScore = results.objectiveScore || 0
      const redacaoNota = results.redacao?.nota || null
      const correct = results.correct || 0
      const total = results.total || 0

      const mailOptions = {
        from: `"FlashConCards" <${functions.config().email?.user || process.env.EMAIL_USER || 'flashconcards@gmail.com'}>`,
        to: email.toLowerCase().trim(),
        subject: `📊 Resultado do Simulado: ${simuladoName || courseName || 'Simulado'}`,
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
              .score-box { background: white; border: 3px solid #667eea; border-radius: 12px; padding: 30px; margin: 20px 0; text-align: center; }
              .final-score { font-size: 48px; font-weight: bold; color: #667eea; margin: 10px 0; }
              .score-label { font-size: 18px; color: #666; }
              .details { background: white; border-radius: 8px; padding: 20px; margin: 15px 0; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
              .detail-row:last-child { border-bottom: none; }
              .detail-label { font-weight: bold; color: #667eea; }
              .detail-value { color: #333; }
              .redacao-box { background: #f0f4ff; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 Parabéns!</h1>
                <p>Você concluiu o simulado</p>
              </div>
              <div class="content">
                <p>Olá!</p>
                
                <p>Segue abaixo o resultado do seu simulado <strong>${simuladoName || courseName || 'Simulado'}</strong>:</p>
                
                <div class="score-box">
                  <div class="score-label">Nota Final</div>
                  <div class="final-score">${finalScore}</div>
                  <div class="score-label">de 10 pontos</div>
                </div>

                <div class="details">
                  <div class="detail-row">
                    <span class="detail-label">Nota Objetiva:</span>
                    <span class="detail-value">${objectiveScore}/10</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Acertos:</span>
                    <span class="detail-value">${correct} de ${total} questões</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Taxa de Acerto:</span>
                    <span class="detail-value">${accuracy.toFixed(1)}%</span>
                  </div>
                  ${redacaoNota ? `
                  <div class="redacao-box">
                    <div class="detail-row">
                      <span class="detail-label">Nota da Redação:</span>
                      <span class="detail-value"><strong>${redacaoNota}/10</strong></span>
                    </div>
                  </div>
                  ` : ''}
                </div>

                <p style="margin-top: 30px;">Continue estudando e boa sorte na sua aprovação! 🚀</p>
                
                <p>Atenciosamente,<br><strong>Equipe FlashConCards</strong></p>
              </div>
            </div>
          </body>
          </html>
        `
      }

      await transporter.sendMail(mailOptions)
      console.log(`Email de resultado enviado para ${email}`)
      
      return res.status(200).json({ success: true, message: 'Email enviado com sucesso' })
    } catch (error) {
      console.error('Erro ao enviar email de resultado:', error)
      return res.status(500).json({ error: 'Erro ao enviar email', details: error.message })
    }
  })
})

// Função para enviar email personalizado de redefinição de senha
exports.sendPasswordResetEmail = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Tratar preflight request
    if (req.method === 'OPTIONS') {
      return res.status(204).send('')
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    try {
      const { email } = req.body

      if (!email) {
        return res.status(400).json({ error: 'Email é obrigatório' })
      }

      const emailLower = email.toLowerCase().trim()

      // Verificar se o email existe no Firebase Auth
      let userRecord
      try {
        userRecord = await admin.auth().getUserByEmail(emailLower)
      } catch (authError) {
        if (authError.code === 'auth/user-not-found') {
          return res.status(404).json({ error: 'Usuário não encontrado no Firebase Authentication' })
        }
        throw authError
      }

      // Gerar token aleatório seguro
      const token = require('crypto').randomUUID() + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15)
      
      // Criar token no Firestore (expira em 24 horas)
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + 24)

      await admin.firestore().collection('passwordResetTokens').doc(token).set({
        email: emailLower,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: expiresAt,
        used: false,
      })

      // URL base do site (ajuste conforme necessário)
      const baseUrl = req.body.baseUrl || 'https://flashconcards.vercel.app'
      const resetLink = `${baseUrl}/reset/${token}`

      // Enviar email personalizado
      const transporter = createEmailTransporter()
      
      if (transporter) {
        const mailOptions = {
          from: `"Plegimentoria ALEGO" <${functions.config().email?.user || process.env.EMAIL_USER || 'flashconcards@gmail.com'}>`,
          to: emailLower,
          subject: '🔒 Redefinir Senha - Plegimentoria ALEGO',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
                  line-height: 1.6; 
                  color: #333; 
                  margin: 0; 
                  padding: 0;
                  background-color: #f5f5f5;
                }
                .email-container {
                  max-width: 600px; 
                  margin: 0 auto; 
                  background-color: #ffffff;
                }
                .header { 
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; 
                  padding: 40px 30px; 
                  text-align: center; 
                }
                .header h1 {
                  margin: 0;
                  font-size: 28px;
                  font-weight: bold;
                }
                .header p {
                  margin: 10px 0 0 0;
                  font-size: 16px;
                  opacity: 0.9;
                }
                .content { 
                  background: #ffffff; 
                  padding: 40px 30px; 
                }
                .message {
                  font-size: 16px;
                  color: #333;
                  margin-bottom: 30px;
                  line-height: 1.8;
                }
                .button-container {
                  text-align: center;
                  margin: 35px 0;
                }
                .button { 
                  display: inline-block; 
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white !important; 
                  padding: 16px 40px; 
                  text-decoration: none; 
                  border-radius: 8px; 
                  font-size: 16px;
                  font-weight: bold;
                  box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
                  transition: transform 0.2s;
                }
                .button:hover {
                  transform: translateY(-2px);
                  box-shadow: 0 6px 12px rgba(102, 126, 234, 0.4);
                }
                .info-box {
                  background: #f8f9fa;
                  border-left: 4px solid #667eea;
                  padding: 20px;
                  margin: 30px 0;
                  border-radius: 4px;
                }
                .info-box p {
                  margin: 0;
                  font-size: 14px;
                  color: #666;
                  line-height: 1.6;
                }
                .warning {
                  background: #fff3cd;
                  border-left: 4px solid #ffc107;
                  padding: 15px;
                  margin: 25px 0;
                  border-radius: 4px;
                }
                .warning p {
                  margin: 0;
                  font-size: 14px;
                  color: #856404;
        }
                .footer {
                  background: #f8f9fa;
                  padding: 30px;
                  text-align: center;
                  font-size: 14px;
                  color: #666;
                  border-top: 1px solid #e9ecef;
                }
                .link-fallback {
                  margin-top: 20px;
                  padding: 15px;
                  background: #f8f9fa;
                  border-radius: 4px;
                  word-break: break-all;
                }
                .link-fallback p {
                  margin: 0 0 10px 0;
                  font-size: 12px;
                  color: #666;
                  font-weight: bold;
        }
                .link-fallback a {
                  color: #667eea;
                  font-size: 12px;
                  word-break: break-all;
                }
              </style>
            </head>
            <body>
              <div class="email-container">
                <div class="header">
                  <h1>🔒 Redefinir Senha</h1>
                  <p>Você solicitou a redefinição da sua senha</p>
                </div>
                <div class="content">
                  <div class="message">
                    <p>Olá!</p>
                    <p>Recebemos uma solicitação para redefinir a senha da sua conta <strong>${emailLower}</strong>.</p>
                    <p>Clique no botão abaixo para criar uma nova senha:</p>
                  </div>

                  <div class="button-container">
                    <a href="${resetLink}" class="button">Redefinir Minha Senha</a>
                  </div>

                  <div class="link-fallback">
                    <p>Se o botão não funcionar, copie e cole este link no seu navegador:</p>
                    <a href="${resetLink}">${resetLink}</a>
                  </div>

                  <div class="info-box">
                    <p><strong>⏰ Importante:</strong> Este link expira em 24 horas. Após esse período, será necessário solicitar uma nova redefinição de senha.</p>
                  </div>

                  <div class="warning">
                    <p><strong>⚠️ Não solicitou esta redefinição?</strong> Se você não solicitou a redefinição de senha, ignore este email. Sua senha permanecerá inalterada.</p>
                  </div>

                  <p style="margin-top: 30px; font-size: 14px; color: #666;">
                    Se tiver dúvidas ou precisar de ajuda, entre em contato conosco.
                  </p>
                </div>
                <div class="footer">
                  <p><strong>Equipe Plegimentoria ALEGO</strong></p>
                  <p>Este é um email automático, por favor não responda.</p>
                </div>
              </div>
            </body>
            </html>
          `
        }

        await transporter.sendMail(mailOptions)
        console.log(`Email de redefinição de senha enviado para ${emailLower}`)
        
        return res.status(200).json({ 
          success: true, 
          message: 'Email de redefinição de senha enviado com sucesso' 
        })
      } else {
        console.warn('Transporter não configurado - email não enviado')
        return res.status(500).json({ error: 'Serviço de email não configurado' })
      }
    } catch (error) {
      console.error('Erro ao enviar email de redefinição:', error)
      return res.status(500).json({ error: 'Erro ao enviar email', details: error.message })
    }
  })
})

// Função para atualizar senha do usuário (usado na página de reset)
exports.updateUserPassword = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Tratar preflight request
    if (req.method === 'OPTIONS') {
      return res.status(204).send('')
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    try {
      const { token, newPassword } = req.body

      if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token e nova senha são obrigatórios' })
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' })
      }

      // Verificar token no Firestore
      const tokenRef = admin.firestore().collection('passwordResetTokens').doc(token)
      const tokenDoc = await tokenRef.get()

      if (!tokenDoc.exists) {
        return res.status(404).json({ error: 'Token inválido ou expirado' })
      }

      const tokenData = tokenDoc.data()
      
      // Verificar se o token expirou (24 horas)
      const now = new Date()
      const expiresAt = tokenData.expiresAt?.toDate?.() || new Date(0)
      
      if (now > expiresAt) {
        await tokenRef.delete()
        return res.status(400).json({ error: 'Token expirado' })
      }

      // Verificar se já foi usado
      if (tokenData.used === true) {
        return res.status(400).json({ error: 'Token já foi usado' })
      }

      // Buscar usuário pelo email e atualizar senha usando Admin SDK
      try {
        const userRecord = await admin.auth().getUserByEmail(tokenData.email)
        await admin.auth().updateUser(userRecord.uid, { password: newPassword })
        
        // Marcar token como usado
        await tokenRef.update({
          used: true,
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
        })

        console.log(`Senha atualizada para usuário ${tokenData.email}`)
        
        return res.status(200).json({ 
          success: true, 
          message: 'Senha atualizada com sucesso' 
        })
      } catch (authError) {
        console.error('Erro ao atualizar senha:', authError)
        return res.status(500).json({ error: 'Erro ao atualizar senha', details: authError.message })
      }
    } catch (error) {
      console.error('Erro na função updateUserPassword:', error)
      return res.status(500).json({ error: 'Erro ao processar', details: error.message })
    }
  })
})

// Função agendada para expirar usuários trial automaticamente
// Roda diariamente às 00:00 UTC (21:00 horário de Brasília)
exports.expireTrialUsers = functions.pubsub.schedule('0 0 * * *').timeZone('America/Sao_Paulo').onRun(async (context) => {
  console.log('Iniciando verificação de usuários trial expirados...')
  
  try {
    const now = new Date()
    const db = admin.firestore()
    
    // Buscar todos os usuários com trialExpiresAt
    const usersRef = db.collection('users')
    const usersSnapshot = await usersRef
      .where('trialExpiresAt', '!=', null)
      .get()
    
    let deletedCount = 0
    let errorCount = 0
    
    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data()
        const trialExpiresAt = userData.trialExpiresAt
        
        if (!trialExpiresAt) continue
        
        // Converter para Date se for string
        const expiresAt = typeof trialExpiresAt === 'string' 
          ? new Date(trialExpiresAt) 
          : trialExpiresAt.toDate()
        
        // Se expirou, deletar usuário
        if (expiresAt < now) {
          const userId = userDoc.id
          console.log(`Deletando usuário trial expirado: ${userId} (${userData.email})`)
          
          // Deletar do Firebase Authentication
          try {
            await admin.auth().deleteUser(userId)
            console.log(`Usuário ${userId} deletado do Authentication`)
          } catch (authError) {
            console.error(`Erro ao deletar usuário ${userId} do Authentication:`, authError)
            // Continuar mesmo se falhar no Auth, pois pode já ter sido deletado
          }
          
          // Deletar do Firestore
          await userDoc.ref.delete()
          console.log(`Usuário ${userId} deletado do Firestore`)
          
          deletedCount++
        }
      } catch (err) {
        console.error(`Erro ao processar usuário ${userDoc.id}:`, err)
        errorCount++
      }
    }
    
    console.log(`Verificação concluída. ${deletedCount} usuários deletados, ${errorCount} erros`)
    return null
  } catch (error) {
    console.error('Erro na função de expiração de trial:', error)
    throw error
  }
})

// ============================================
// IA DE NOTÍCIAS DE CONCURSOS
// ============================================

/**
 * Gera notícias de concursos automaticamente usando IA
 * Busca informações sobre concursos abertos, vagas, remuneração, etc.
 */
exports.generateConcursoNews = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    // Responder a OPTIONS (preflight) imediatamente
    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    try {
      const apiKey = functions.config().gemini?.api_key || process.env.GEMINI_API_KEY
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY não configurada' })
      }

      const { concursoEspecifico } = req.body || {}
      
      // Verificar se já existe notícia similar (evitar duplicatas)
      const postsRef = admin.firestore().collection('posts')
      
      // Buscar todas as notícias recentes para evitar duplicatas
      const recentNews = await postsRef
        .where('isConcursoNews', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get()
      
      const recentNewsList = recentNews.docs.map(doc => doc.data())
      
      if (concursoEspecifico) {
        // Verificar se já existe notícia sobre este concurso específico (busca flexível)
        const concursoLower = concursoEspecifico.toLowerCase().trim()
        const existingNews = recentNewsList.find(news => {
          const newsConcursoName = (news.concursoData?.concursoName || '').toLowerCase().trim()
          const newsTitle = (news.seoTitle || news.text || '').toLowerCase().trim()
          const newsOrgao = (news.concursoData?.orgao || '').toLowerCase().trim()
          
          // Verificar se o nome do concurso, título ou órgão contém palavras-chave similares
          return newsConcursoName.includes(concursoLower) || 
                 concursoLower.includes(newsConcursoName) ||
                 newsTitle.includes(concursoLower) ||
                 newsOrgao.includes(concursoLower)
        })
        
        if (existingNews) {
          const lastNewsDate = existingNews.createdAt?.toDate?.() || new Date(0)
          const daysSinceLastNews = (Date.now() - lastNewsDate.getTime()) / (1000 * 60 * 60 * 24)
          
          // Se foi gerada há menos de 7 dias, não gerar novamente
          if (daysSinceLastNews < 7) {
            return res.status(400).json({ 
              error: 'Notícia sobre este concurso já foi gerada recentemente',
              message: `Uma notícia sobre "${existingNews.concursoData?.concursoName || existingNews.seoTitle || 'este concurso'}" foi gerada há ${Math.floor(daysSinceLastNews)} dias. Aguarde pelo menos 7 dias antes de gerar novamente.`
            })
          }
        }
      } else {
        // Verificar última notícia gerada para evitar repetição
        if (!recentNews.empty) {
          const lastNews = recentNewsList[0]
          const lastNewsDate = lastNews.createdAt?.toDate?.() || new Date(0)
          const hoursSinceLastNews = (Date.now() - lastNewsDate.getTime()) / (1000 * 60 * 60)
          
          // Se foi gerada há menos de 24 horas, não gerar novamente
          if (hoursSinceLastNews < 24) {
            return res.status(400).json({ 
              error: 'Notícia gerada recentemente',
              message: `Uma notícia foi gerada há ${Math.floor(hoursSinceLastNews)} horas. Aguarde pelo menos 24 horas antes de gerar novamente.`
            })
          }
        }
      }
      
      // Preparar lista de notícias recentes para a IA evitar repetição
      const recentTitles = recentNewsList.slice(0, 5).map(news => ({
        title: news.seoTitle || news.text || '',
        concurso: news.concursoData?.concursoName || '',
        date: news.createdAt?.toDate?.()?.toLocaleDateString('pt-BR') || ''
      }))

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          maxOutputTokens: 8000,
          temperature: 0.7,
        }
      })

      // Prompt para IA buscar e gerar notícia sobre concursos
      const prompt = `Você é um especialista em concursos públicos brasileiros. 
      Sua tarefa é criar uma notícia completa e atualizada sobre concursos públicos abertos ou iminentes.
      
      ${concursoEspecifico ? `CONCURSO ESPECÍFICO SOLICITADO: "${concursoEspecifico}"
      
      IMPORTANTE: Você DEVE gerar uma notícia sobre este concurso específico. Foque todas as informações neste concurso. Seja detalhado e específico sobre este concurso.` : `GERE UMA NOTÍCIA SOBRE:
      - Concurso público aberto (com inscrições abertas)
      - Concurso público previsto/iminente (com edital previsto)
      - Atualização sobre concursos já abertos (novas vagas, prorrogação de prazo, etc.)

      FOCO PRINCIPAL:
      - Polícia Militar (PMGO, PMSP, PMRJ, etc.)
      - Polícia Civil (PC)
      - Guarda Municipal (GCM)
      - Outros concursos públicos relevantes`}

      INFORMAÇÕES OBRIGATÓRIAS A INCLUIR:
      1. Nome do concurso e órgão
      2. Número de vagas (se disponível)
      3. Remuneração/salário (se disponível)
      4. Data de abertura das inscrições (se aplicável)
      5. Data de encerramento das inscrições (se aplicável)
      6. Data prevista da prova (se disponível)
      7. Conteúdo programático (principais matérias)
      8. Requisitos básicos (escolaridade, idade, etc.)
      9. Link do edital (se disponível)
      10. Banca organizadora (se conhecida)

      FORMATO DE RESPOSTA (JSON VÁLIDO):
      {
        "title": "Título da notícia (SEO otimizado)",
        "summary": "Resumo curto em 1-2 frases",
        "content": "Conteúdo completo da notícia em HTML (use <p>, <h2>, <h3>, <ul>, <li>, <strong>)",
        "concursoName": "Nome do concurso",
        "orgao": "Órgão/Instituição",
        "vagas": "Número de vagas ou 'A definir'",
        "remuneracao": "Remuneração/salário ou 'A definir'",
        "dataInscricaoInicio": "Data de início das inscrições ou null",
        "dataInscricaoFim": "Data de fim das inscrições ou null",
        "dataProva": "Data prevista da prova ou null",
        "banca": "Banca organizadora ou 'A definir'",
        "requisitos": "Requisitos básicos",
        "conteudoProgramatico": "Principais matérias do conteúdo programático",
        "linkEdital": "Link do edital ou null",
        "status": "aberto|previsto|atualizacao",
        "tags": ["concurso público", "PMGO", "polícia militar", "vagas", etc],
        "keywords": "palavras-chave para SEO separadas por vírgula"
      }

      IMPORTANTE:
      - Seja específico e atualizado
      - Use informações reais quando possível
      - Se não souber alguma informação, use "A definir" ou null
      - O título deve ser otimizado para SEO
      - O conteúdo deve ser rico em palavras-chave relacionadas
      - Retorne APENAS o JSON, sem markdown, sem explicações adicionais
      - Comece diretamente com { e termine com }`

      console.log('🤖 Gerando notícia de concurso com IA...')
      const result = await model.generateContent(prompt)
      const aiResponse = result.response.text()

      // Limpar resposta da IA (remover markdown se houver)
      let jsonText = aiResponse.trim()
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '')
      }

      // Parsear JSON
      let newsData
      try {
        newsData = JSON.parse(jsonText)
      } catch (parseError) {
        console.error('Erro ao parsear JSON da IA:', parseError)
        console.error('Resposta da IA:', aiResponse.substring(0, 500))
        return res.status(500).json({ error: 'Erro ao processar resposta da IA', raw: aiResponse.substring(0, 500) })
      }

      // Validar dados obrigatórios
      if (!newsData.title || !newsData.content) {
        return res.status(500).json({ error: 'IA não retornou dados completos', data: newsData })
      }

      // Criar slug do título
      const slug = newsData.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      // Salvar no Firestore
      const newsRef = admin.firestore().collection('posts')
      
      const newsDoc = {
        text: newsData.summary || newsData.title,
        fullText: newsData.content,
        authorName: 'FlashConCards IA',
        authorId: 'system-ai-news', // ID especial para notícias geradas por IA
        isNews: true,
        isConcursoNews: true, // Flag especial para notícias de concursos
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Dados específicos de concurso
        concursoData: {
          concursoName: newsData.concursoName || '',
          orgao: newsData.orgao || '',
          vagas: newsData.vagas || 'A definir',
          remuneracao: newsData.remuneracao || 'A definir',
          dataInscricaoInicio: newsData.dataInscricaoInicio || null,
          dataInscricaoFim: newsData.dataInscricaoFim || null,
          dataProva: newsData.dataProva || null,
          banca: newsData.banca || 'A definir',
          requisitos: newsData.requisitos || '',
          conteudoProgramatico: newsData.conteudoProgramatico || '',
          linkEdital: newsData.linkEdital || null,
          status: newsData.status || 'aberto',
        },
        tags: newsData.tags || [],
        keywords: newsData.keywords || '',
        slug: slug,
        seoTitle: newsData.title,
        seoDescription: newsData.summary || newsData.title.substring(0, 160),
      }

      const docRef = await newsRef.add(newsDoc)

      console.log('✅ Notícia gerada e salva com sucesso:', docRef.id)

      return res.status(200).json({
        success: true,
        newsId: docRef.id,
        data: newsDoc
      })

    } catch (error) {
      console.error('Erro ao gerar notícia de concurso:', error)
      return res.status(500).json({ 
        error: 'Erro ao gerar notícia', 
        message: error.message 
      })
    }
  })
})

/**
 * Scheduler para gerar notícias automaticamente
 * Roda diariamente às 8h da manhã
 */
exports.scheduledGenerateConcursoNews = functions.pubsub
  .schedule('0 8 * * *') // Todo dia às 8h
  .timeZone('America/Sao_Paulo')
  .onRun(async (context) => {
    try {
      console.log('🔄 Iniciando geração automática de notícias de concursos...')
      
      const apiKey = functions.config().gemini?.api_key || process.env.GEMINI_API_KEY
      if (!apiKey) {
        console.error('GEMINI_API_KEY não configurada')
        return null
      }

      // Chamar a função de geração diretamente (sem HTTP)
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          maxOutputTokens: 8000,
          temperature: 0.7,
        }
      })

      const prompt = `Você é um especialista em concursos públicos brasileiros. 
      Sua tarefa é criar uma notícia completa e atualizada sobre concursos públicos abertos ou iminentes.

      GERE UMA NOTÍCIA SOBRE:
      - Concurso público aberto (com inscrições abertas)
      - Concurso público previsto/iminente (com edital previsto)
      - Atualização sobre concursos já abertos (novas vagas, prorrogação de prazo, etc.)

      FOCO PRINCIPAL:
      - Polícia Militar (PMGO, PMSP, PMRJ, etc.)
      - Polícia Civil (PC)
      - Guarda Municipal (GCM)
      - Outros concursos públicos relevantes

      INFORMAÇÕES OBRIGATÓRIAS A INCLUIR:
      1. Nome do concurso e órgão
      2. Número de vagas (se disponível)
      3. Remuneração/salário (se disponível)
      4. Data de abertura das inscrições (se aplicável)
      5. Data de encerramento das inscrições (se aplicável)
      6. Data prevista da prova (se disponível)
      7. Conteúdo programático (principais matérias)
      8. Requisitos básicos (escolaridade, idade, etc.)
      9. Link do edital (se disponível)
      10. Banca organizadora (se conhecida)

      FORMATO DE RESPOSTA (JSON VÁLIDO):
      {
        "title": "Título da notícia (SEO otimizado)",
        "summary": "Resumo curto em 1-2 frases",
        "content": "Conteúdo completo da notícia em HTML (use <p>, <h2>, <h3>, <ul>, <li>, <strong>)",
        "concursoName": "Nome do concurso",
        "orgao": "Órgão/Instituição",
        "vagas": "Número de vagas ou 'A definir'",
        "remuneracao": "Remuneração/salário ou 'A definir'",
        "dataInscricaoInicio": "Data de início das inscrições ou null",
        "dataInscricaoFim": "Data de fim das inscrições ou null",
        "dataProva": "Data prevista da prova ou null",
        "banca": "Banca organizadora ou 'A definir'",
        "requisitos": "Requisitos básicos",
        "conteudoProgramatico": "Principais matérias do conteúdo programático",
        "linkEdital": "Link do edital ou null",
        "status": "aberto|previsto|atualizacao",
        "tags": ["concurso público", "PMGO", "polícia militar", "vagas", etc],
        "keywords": "palavras-chave para SEO separadas por vírgula"
      }

      IMPORTANTE:
      - Seja específico e atualizado
      - Use informações reais quando possível
      - Se não souber alguma informação, use "A definir" ou null
      - O título deve ser otimizado para SEO
      - O conteúdo deve ser rico em palavras-chave relacionadas
      - Retorne APENAS o JSON, sem markdown, sem explicações adicionais
      - Comece diretamente com { e termine com }`

      const result = await model.generateContent(prompt)
      const aiResponse = result.response.text()

      // Limpar resposta da IA
      let jsonText = aiResponse.trim()
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '')
      }

      // Parsear JSON
      const newsData = JSON.parse(jsonText)

      // Validar dados obrigatórios
      if (!newsData.title || !newsData.content) {
        console.error('IA não retornou dados completos')
        return null
      }

      // Criar slug do título
      const slug = newsData.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      // Salvar no Firestore
      const db = admin.firestore()
      const newsRef = db.collection('posts')
      
      const newsDoc = {
        text: newsData.summary || newsData.title,
        fullText: newsData.content,
        authorName: 'FlashConCards IA',
        authorId: 'system-ai-news',
        isNews: true,
        isConcursoNews: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        concursoData: {
          concursoName: newsData.concursoName || '',
          orgao: newsData.orgao || '',
          vagas: newsData.vagas || 'A definir',
          remuneracao: newsData.remuneracao || 'A definir',
          dataInscricaoInicio: newsData.dataInscricaoInicio || null,
          dataInscricaoFim: newsData.dataInscricaoFim || null,
          dataProva: newsData.dataProva || null,
          banca: newsData.banca || 'A definir',
          requisitos: newsData.requisitos || '',
          conteudoProgramatico: newsData.conteudoProgramatico || '',
          linkEdital: newsData.linkEdital || null,
          status: newsData.status || 'aberto',
        },
        tags: newsData.tags || [],
        keywords: newsData.keywords || '',
        slug: slug,
        seoTitle: newsData.title,
        seoDescription: newsData.summary || newsData.title.substring(0, 160),
      }

      await newsRef.add(newsDoc)

      console.log('✅ Notícia gerada automaticamente com sucesso')
      return null
    } catch (error) {
      console.error('Erro no scheduler de notícias:', error)
      return null
    }
  })
