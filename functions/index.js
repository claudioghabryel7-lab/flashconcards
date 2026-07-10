require('dotenv').config()
const functions = require('firebase-functions')
const admin = require('firebase-admin')
const nodemailer = require('nodemailer')
const { corsMiddleware: cors } = require('./corsConfig')
const {
  createEmailTransporter,
  buildBrandedEmailHtml,
  paragraphsToHtml,
  escapeHtml,
  verifyAdminRequest,
  sendBrandedEmail,
  getEmailCredentials,
  DEFAULT_FROM_NAME,
} = require('./emailUtils')
const { MercadoPagoConfig, Payment } = require('mercadopago')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const axios = require('axios')

admin.initializeApp()

const { processGenerationJob } = require('./generation/jobProcessor')

/** Processa jobs de geração IA no servidor — continua mesmo com aba/dispositivo fechado. */
exports.onGenerationJobCreated = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .firestore.document('users/{userId}/generationJobs/{jobId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {}
    if (!data.runOnServer || data.status !== 'pending') {
      return null
    }

    const { userId, jobId } = context.params

    try {
      await processGenerationJob(userId, jobId, data)
      return null
    } catch (error) {
      console.error(`[onGenerationJobCreated] job ${jobId}:`, error)
      await snap.ref.update({
        status: 'error',
        progress: 100,
        message: error?.message || 'Falha na geração com IA. Tente novamente.',
        errorCode: error?.code || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      return null
    }
  })

// createEmailTransporter movido para emailUtils.js

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

      const baseUrl = (req.body.baseUrl || 'https://www.flashconcards.com.br').replace(/\/$/, '')
      const resetLink = `${baseUrl}/reset/${token}`

      const html = buildBrandedEmailHtml({
        title: '🔒 Redefinir Senha',
        subtitle: 'Você solicitou a redefinição da sua senha',
        bodyHtml: `
          ${paragraphsToHtml([
            'Olá!',
            `Recebemos uma solicitação para redefinir a senha da conta ${emailLower}.`,
            'Clique no botão abaixo para criar uma nova senha. O link expira em 24 horas.',
            'Se você não solicitou esta redefinição, ignore este email — sua senha permanecerá inalterada.',
          ])}
        `,
        ctaLabel: 'Redefinir Minha Senha',
        ctaUrl: resetLink,
      })

      await sendBrandedEmail({
        to: emailLower,
        subject: `🔒 Redefinir Senha - ${DEFAULT_FROM_NAME}`,
        html,
        text: `Redefina sua senha em: ${resetLink}`,
      })

      console.log(`Email de redefinição de senha enviado para ${emailLower}`)

      return res.status(200).json({
        success: true,
        message: 'Email de redefinição de senha enviado com sucesso',
      })
    } catch (error) {
      console.error('Erro ao enviar email de redefinição:', error)
      const status = error.status || 500
      return res.status(status).json({
        error: error.message || 'Erro ao enviar email',
        details: error.message,
      })
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

// Envio de email formatado pelo admin (1, vários ou todos)
exports.sendAdminBroadcastEmail = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      return res.status(204).send('')
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    try {
      const adminUser = await verifyAdminRequest(req)
      const {
        subject,
        title,
        subtitle = '',
        message,
        highlight = '',
        bullets = [],
        recipientMode = 'one',
        recipients = [],
        ctaLabel = '',
        ctaUrl = '',
      } = req.body || {}

      if (!subject?.trim() || !title?.trim() || !message?.trim()) {
        return res.status(400).json({ error: 'Assunto, título e mensagem são obrigatórios.' })
      }

      let targetEmails = []

      if (recipientMode === 'all') {
        const usersSnap = await admin.firestore().collection('users').get()
        targetEmails = usersSnap.docs
          .map((docSnap) => docSnap.data())
          .filter((user) => user?.email && !user.deleted && user.role !== 'admin')
          .map((user) => user.email)
      } else {
        targetEmails = Array.isArray(recipients) ? recipients : [recipients]
      }

      targetEmails = [...new Set(
        targetEmails
          .filter((email) => email != null && String(email).trim())
          .map((email) => String(email).toLowerCase().trim())
          .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
      )]

      if (!targetEmails.length) {
        return res.status(400).json({ error: 'Nenhum destinatário válido encontrado.' })
      }

      const paragraphs = String(message)
        .split(/\n{2,}|\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      const html = buildBrandedEmailHtml({
        title: title.trim(),
        subtitle: (subtitle || subject).trim(),
        bodyHtml: paragraphsToHtml(paragraphs),
        highlight: String(highlight || '').trim(),
        bullets: Array.isArray(bullets) ? bullets.filter(Boolean) : [],
        ctaLabel: ctaLabel?.trim() || '',
        ctaUrl: ctaUrl?.trim() || '',
      })

      const results = []
      let sent = 0
      let failed = 0
      let errorSummary = ''

      for (const email of targetEmails) {
        try {
          await sendBrandedEmail({
            to: email,
            subject: subject.trim(),
            html,
            text: paragraphs.join('\n\n'),
          })
          sent += 1
          results.push({ email, status: 'sent' })
        } catch (sendErr) {
          failed += 1
          const errMsg = sendErr.message || 'Erro ao enviar'
          results.push({ email, status: 'error', error: errMsg, code: sendErr.code || null })
          if (!errorSummary) errorSummary = errMsg
          console.error(`Falha ao enviar para ${email}:`, sendErr)
        }
      }

      try {
        await admin.firestore().collection('broadcastEmailHistory').add({
          subject: subject.trim(),
          title: title.trim(),
          message: message.trim(),
          recipientMode,
          recipientCount: targetEmails.length,
          sent,
          failed,
          sentBy: adminUser.uid,
          sentByEmail: adminUser.email || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      } catch (historyErr) {
        console.error('Erro ao salvar histórico de email (envio não afetado):', historyErr)
      }

      return res.status(200).json({
        success: failed === 0,
        sent,
        failed,
        total: targetEmails.length,
        results,
        errorSummary: sent === 0 && failed > 0 ? errorSummary : '',
      })
    } catch (error) {
      console.error('Erro no envio em massa:', error)
      const status = error.status || 500
      return res.status(status).json({
        error: error.message || 'Erro ao enviar emails',
        details: error.message,
      })
    }
  })
})

const { MENTORADO_DAILY_RELEASE_HOUR } = require('./generation/guiaMentoradoShared')
const { runDailyMentoradoAutomationForAllCourses } = require('./generation/guiaMentoradoDaily')

/** Libera conteúdos do Guia Mentorado dia a dia (só matérias do dia). */
exports.mentoradoDailyContentRelease = functions.pubsub
  .schedule(`0 ${MENTORADO_DAILY_RELEASE_HOUR} * * *`)
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    console.log('[mentoradoDailyContentRelease] Iniciando liberação diária…')
    const results = await runDailyMentoradoAutomationForAllCourses()
    console.log('[mentoradoDailyContentRelease] Concluído:', results.length, 'curso(s)')
    return null
  })

const { resumeWaitingGenerationJobs } = require('./generation/generationJobResume')

/** Retoma jobs pausados por API expirada (a cada 5 min). */
exports.resumeWaitingGenerationJobs = functions.pubsub
  .schedule('every 5 minutes')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    const result = await resumeWaitingGenerationJobs()
    if (result.resumed > 0 || result.waiting > 0) {
      console.log('[resumeWaitingGenerationJobs]', result)
    }
    return null
  })

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
      // Usar query simples sem orderBy para evitar necessidade de índice composto
      const recentNews = await postsRef
        .where('isConcursoNews', '==', true)
        .limit(50) // Buscar mais para depois ordenar em memória
        .get()
      
      // Ordenar em memória por data de criação (mais recente primeiro)
      const recentNewsList = recentNews.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(news => news.createdAt) // Filtrar apenas as que têm data
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0)
          const dateB = b.createdAt?.toDate?.() || new Date(0)
          return dateB.getTime() - dateA.getTime() // Mais recente primeiro
        })
        .slice(0, 10) // Pegar apenas as 10 mais recentes
        .map(news => news) // Remover o id, manter apenas os dados
      
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
        model: 'gemini-2.0-flash',
        generationConfig: {
          maxOutputTokens: 8000,
          temperature: 0.7,
        }
      })

      // Preparar lista de notícias recentes para a IA evitar repetição
      const recentTitlesText = recentNewsList.length > 0 
        ? `\n\nNOTÍCIAS RECENTES JÁ GERADAS (EVITE REPETIR):\n${recentNewsList.slice(0, 5).map((n, i) => `${i + 1}. "${n.seoTitle || n.text || ''}" - ${n.concursoData?.concursoName || 'N/A'} (${n.createdAt?.toDate?.()?.toLocaleDateString('pt-BR') || ''})`).join('\n')}\n\nIMPORTANTE: NÃO gere uma notícia sobre os mesmos concursos listados acima. Escolha um concurso DIFERENTE ou uma atualização significativa com informações novas.`
        : ''
      
      // Prompt para IA buscar e gerar notícia sobre concursos
      const prompt = `Você é um especialista em concursos públicos brasileiros. 
      Sua tarefa é criar uma notícia completa e atualizada sobre concursos públicos abertos ou iminentes.
      
      ${concursoEspecifico ? `CONCURSO ESPECÍFICO SOLICITADO: "${concursoEspecifico}"
      
      IMPORTANTE: Você DEVE gerar uma notícia sobre este concurso específico. Foque todas as informações neste concurso. Seja detalhado e específico sobre este concurso.
      
      ATENÇÃO: Se já existe uma notícia recente sobre este mesmo concurso (ver lista abaixo), você DEVE gerar uma ATUALIZAÇÃO com informações novas, diferentes ou mais recentes. Não repita o mesmo conteúdo.${recentTitlesText}` : `GERE UMA NOTÍCIA SOBRE:
      - Concurso público aberto (com inscrições abertas)
      - Concurso público previsto/iminente (com edital previsto)
      - Atualização sobre concursos já abertos (novas vagas, prorrogação de prazo, etc.)

      FOCO PRINCIPAL:
      - Polícia Militar (PMGO, PMSP, PMRJ, etc.)
      - Polícia Civil (PC)
      - Guarda Municipal (GCM)
      - Outros concursos públicos relevantes${recentTitlesText}`}

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
        model: 'gemini-2.0-flash',
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

/**
 * Gerar notícia de concurso a partir de um link de referência
 * O admin fornece um link e a IA lê o conteúdo e gera a notícia
 */
exports.generateNewsFromLink = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    // Responder a OPTIONS (preflight) imediatamente
    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    try {
      const { referenceLink, category } = req.body

      if (!referenceLink) {
        return res.status(400).json({ error: 'Link de referência é obrigatório' })
      }

      // Validar URL
      let url
      try {
        url = new URL(referenceLink)
      } catch {
        return res.status(400).json({ error: 'URL inválida' })
      }

      const apiKey = functions.config().gemini?.api_key || process.env.GEMINI_API_KEY
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY não configurada' })
      }

      console.log('🔗 Fazendo scraping do link:', referenceLink)

      // Fazer scraping do conteúdo da página
      let pageContent = ''
      try {
        const response = await axios.get(referenceLink, {
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        })
        
        // Extrair texto do HTML (método simples)
        const html = response.data
        // Remover scripts, styles, etc
        let text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        
        // Limitar tamanho (primeiros 50000 caracteres)
        pageContent = text.substring(0, 50000)
        
        if (!pageContent || pageContent.length < 100) {
          return res.status(400).json({ 
            error: 'Não foi possível extrair conteúdo suficiente da página',
            message: 'A página pode estar protegida ou não contém texto suficiente'
          })
        }
        
        console.log('✅ Conteúdo extraído:', pageContent.length, 'caracteres')
      } catch (scrapeError) {
        console.error('Erro ao fazer scraping:', scrapeError.message)
        return res.status(400).json({ 
          error: 'Erro ao acessar o link',
          message: scrapeError.message || 'Não foi possível acessar a página. Verifique se o link está correto e acessível.'
        })
      }

      // Gerar notícia com IA baseada no conteúdo
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash',
        generationConfig: {
          maxOutputTokens: 8000,
          temperature: 0.7,
        }
      })

      const prompt = `Você é um especialista em concursos públicos brasileiros e jornalista de notícias.

CONTEÚDO DA PÁGINA DE REFERÊNCIA (extraído do link fornecido):
${pageContent}

REFERÊNCIA OBRIGATÓRIA:
- A referência desta notícia é SEMPRE o FlashConCards (https://www.flashconcards.com.br)
- FlashConCards é uma plataforma especializada em flashcards para concursos públicos
- Ao final do artigo, mencione que o FlashConCards oferece materiais de estudo para este concurso
- Inclua links contextuais para o FlashConCards quando mencionar matérias ou áreas de estudo

TAREFA:
Crie uma notícia completa, profissional e atualizada sobre o concurso público mencionado no conteúdo acima.

INSTRUÇÕES OBRIGATÓRIAS:
1. Analise o conteúdo da página de referência acima EXTREMAMENTE DETALHADAMENTE
2. Extraia TODAS as informações relevantes sobre o concurso
3. **OBRIGATÓRIO**: Extraia o CONTEÚDO PROGRAMÁTICO COMPLETO - liste TODAS as matérias/disciplinas que serão cobradas
4. **OBRIGATÓRIO**: Extraia a QUANTIDADE DE VAGAS/BARRAS - informe quantas vagas estão disponíveis, se houver distribuição por cargo/área, inclua
5. **OBRIGATÓRIO**: Organize as matérias por área de conhecimento (se aplicável)
6. **OBRIGATÓRIO**: Se houver informações sobre peso ou pontuação de cada matéria, inclua
7. Crie uma notícia jornalística profissional e objetiva
8. Use linguagem clara e acessível
9. Organize as informações de forma lógica
10. Destaque informações importantes como número de vagas, salário, datas de inscrição

ESTRUTURA DO CONTEÚDO (HTML):
- Use <h2>Conteúdo Programático</h2> seguido de uma lista completa de TODAS as matérias encontradas
- Use <h2>Vagas e Remuneração</h2> com informações detalhadas sobre quantidade de vagas, distribuição, etc.
- Use <h2>Etapas do Concurso</h2> com todas as fases (prova objetiva, discursiva, física, psicológica, etc.)
- Organize as matérias em listas <ul><li> ou tabelas quando apropriado
- Se houver distribuição de vagas, crie uma seção específica para isso

FORMATO DE RESPOSTA (JSON VÁLIDO):
{
  "title": "Título da notícia (SEO otimizado, chamativo)",
  "summary": "Resumo curto em 1-2 frases para chamada",
  "content": "Conteúdo completo da notícia em HTML formatado. Use tags HTML: <p> para parágrafos, <h2> para seções principais (ex: 'Conteúdo Programático', 'Vagas e Remuneração', 'Etapas do Concurso'), <h3> para subseções, <ul> e <li> para listas de matérias, <strong> e <b> para negrito, <a href='...'> para links, <table> para tabelas se necessário. Seja EXTREMAMENTE detalhado sobre o conteúdo programático - liste TODAS as matérias encontradas no conteúdo de referência. Inclua informações sobre quantidade de barras/vagas se disponível.",
  "concursoName": "Nome completo do concurso",
  "orgao": "Órgão/Instituição responsável",
  "vagas": "Número de vagas detalhado (ex: '500 vagas' ou '300 vagas + 200 CR' ou 'A definir')",
  "remuneracao": "Remuneração/salário inicial completo (ex: 'R$ 5.000,00' ou 'A definir')",
  "dataInscricaoInicio": "Data de início das inscrições (formato: DD/MM/YYYY ou null)",
  "dataInscricaoFim": "Data de fim das inscrições (formato: DD/MM/YYYY ou null)",
  "dataProva": "Data prevista da prova (formato: DD/MM/YYYY ou null)",
  "banca": "Banca organizadora (ex: 'FGV', 'CESPE', 'A definir')",
  "requisitos": "Requisitos básicos completos (escolaridade, idade mínima, experiência, etc.)",
  "conteudoProgramatico": "Lista COMPLETA de todas as matérias do conteúdo programático encontradas no conteúdo de referência, organizadas por área quando aplicável",
  "linkEdital": "Link do edital se mencionado no conteúdo ou null",
  "status": "aberto|previsto|atualizacao",
  "tags": ["concurso público", "nome do órgão", "categoria", etc],
  "keywords": "palavras-chave para SEO separadas por vírgula"
}

IMPORTANTE:
- Baseie-se EXCLUSIVAMENTE no conteúdo fornecido acima
- A REFERÊNCIA é sempre o FlashConCards (https://www.flashconcards.com.br)
- Inclua menções ao FlashConCards como plataforma de estudo para o concurso
- Se alguma informação não estiver no conteúdo, use "A definir" ou null
- O título deve ser atrativo e otimizado para SEO
- O conteúdo deve ser completo e informativo
- **SEJA EXTREMAMENTE DETALHADO sobre o conteúdo programático - liste TODAS as matérias encontradas**
- **INCLUA informações sobre quantidade de barras/vagas se disponível no conteúdo**
- Ao mencionar matérias ou áreas de estudo, inclua links contextuais para o FlashConCards
- Use HTML para formatação (não markdown)
- Retorne APENAS o JSON válido, sem markdown, sem explicações
- Comece diretamente com { e termine com }`

      console.log('🤖 Gerando notícia com IA baseada no link...')
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
      let newsData
      try {
        newsData = JSON.parse(jsonText)
      } catch (parseError) {
        console.error('Erro ao parsear JSON da IA:', parseError)
        console.error('Resposta da IA:', aiResponse.substring(0, 500))
        return res.status(500).json({ 
          error: 'Erro ao processar resposta da IA', 
          raw: aiResponse.substring(0, 500) 
        })
      }

      // Validar dados obrigatórios
      if (!newsData.title || !newsData.content) {
        return res.status(500).json({ 
          error: 'IA não retornou dados completos', 
          data: newsData 
        })
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
        authorId: 'system-ai-news',
        isNews: true,
        isConcursoNews: true,
        category: category || 'CONCURSOS',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        referenceLink: referenceLink, // Salvar link de referência
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
        tags: newsData.tags || [category ? category.toLowerCase() : 'concursos'],
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
      console.error('Erro ao gerar notícia do link:', error)
      return res.status(500).json({ 
        error: 'Erro ao gerar notícia', 
        message: error.message 
      })
    }
  })
})
