require('dotenv').config()
const functions = require('firebase-functions')
const admin = require('firebase-admin')
const nodemailer = require('nodemailer')
const { corsMiddleware: cors } = require('./corsConfig')
const {
  createEmailTransporter,
  buildBrandedEmailHtml,
  buildEmailVerificationHtml,
  paragraphsToHtml,
  escapeHtml,
  verifyAdminRequest,
  verifyAuthRequest,
  sendBrandedEmail,
  sendAccountWelcomeEmail,
  getEmailCredentials,
  DEFAULT_FROM_NAME,
} = require('./emailUtils')
const { MercadoPagoConfig, Payment, Preference, PreApproval } = require('mercadopago')
const axios = require('axios')
const { generateAiJson } = require('./generation/geminiServer')
const { collectGeminiApiKeys, collectMotherGeminiApiKey } = require('./generation/geminiKeyPool')
const {
  grantCourseAccess,
  revokeCourseAccess,
  toMercadoPagoRecurring,
  computeExpiresAt,
} = require('./courseAccessExpiry')

function getMercadoPagoAccessToken(options = {}) {
  const { forPix = false } = options
  const mode = String(
    process.env.MERCADOPAGO_MODE ||
      functions.config().mercadopago?.mode ||
      'test',
  ).toLowerCase()
  const cfgToken =
    functions.config().mercadopago?.access_token_prod ||
    functions.config().mercadopago?.access_token ||
    ''

  // Token TEST do MP geralmente não gera PIX (retorna internal_error).
  // Para PIX preferimos a chave de produção.
  if (forPix) {
    return (
      process.env.MERCADOPAGO_ACCESS_TOKEN_PIX ||
      process.env.MERCADOPAGO_ACCESS_TOKEN_PROD ||
      process.env.MERCADOPAGO_ACCESS_TOKEN ||
      cfgToken ||
      process.env.MERCADOPAGO_ACCESS_TOKEN_TEST ||
      ''
    )
  }

  if (mode === 'test' || mode === 'sandbox') {
    return (
      process.env.MERCADOPAGO_ACCESS_TOKEN_TEST ||
      process.env.MERCADOPAGO_ACCESS_TOKEN ||
      ''
    )
  }
  return (
    process.env.MERCADOPAGO_ACCESS_TOKEN_PROD ||
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    cfgToken ||
    ''
  )
}

function isMercadoPagoTestMode() {
  const mode = String(
    process.env.MERCADOPAGO_MODE ||
      functions.config().mercadopago?.mode ||
      'test',
  ).toLowerCase()
  if (mode === 'prod' || mode === 'production') return false
  if (mode === 'test' || mode === 'sandbox') return true
  // Fallback pelo prefixo do token ativo
  const token = getMercadoPagoAccessToken()
  return String(token).startsWith('TEST-')
}

function getMercadoPagoPublicKey() {
  const cfgKey =
    functions.config().mercadopago?.public_key_prod ||
    functions.config().mercadopago?.public_key ||
    ''
  if (isMercadoPagoTestMode()) {
    return (
      process.env.MERCADOPAGO_PUBLIC_KEY_TEST ||
      process.env.MERCADOPAGO_PUBLIC_KEY ||
      cfgKey ||
      ''
    )
  }
  return (
    process.env.MERCADOPAGO_PUBLIC_KEY_PROD ||
    process.env.MERCADOPAGO_PUBLIC_KEY ||
    cfgKey ||
    ''
  )
}

/** URL de checkout: em produção NUNCA usa sandbox (sandbox pede login de conta teste). */
function resolveCheckoutInitPoint(result, { testMode } = {}) {
  const initPoint = result?.init_point || null
  const sandboxPoint = result?.sandbox_init_point || null
  if (testMode) {
    return sandboxPoint || initPoint
  }
  return initPoint || null
}

function assertGeminiConfigured() {
  const keys = collectGeminiApiKeys()
  const mother = collectMotherGeminiApiKey()
  if (!keys.length && !mother) {
    const err = new Error('GEMINI_API_KEY não configurada')
    err.code = 'gemini_not_configured'
    throw err
  }
}

admin.initializeApp()
try {
  admin.firestore().settings({ ignoreUndefinedProperties: true })
} catch {
  /* já configurado */
}

const {
  getResumeModule,
  getDailyModule,
  getSupervisorQueueModule,
  getKickModule,
} = require('./generationLoader')

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
    const { runServerGenerationJob } = getKickModule()
    const result = await runServerGenerationJob(userId, jobId, data)
    console.log(`[onGenerationJobCreated] ${jobId}:`, result?.ok ? 'ok' : result?.reason || result)
    return null
  })

/** Ao cancelar (X), limpa fila de retomada e atualiza painel do dia imediatamente. */
exports.onGenerationJobUpdated = functions.firestore
  .document('users/{userId}/generationJobs/{jobId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {}
    const after = change.after.data() || {}
    if (before.status === after.status || after.status !== 'cancelled') {
      return null
    }

    const { userId, jobId } = context.params
    const { handleGenerationJobCancelled } = getResumeModule()
    await handleGenerationJobCancelled(userId, jobId, after)
    console.log(`[onGenerationJobUpdated] job ${jobId} cancelado — fila limpa`)
    return null
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
      console.log(`Email enviado para ${emailLower}`)

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

      // Obter Access Token do Mercado Pago (PIX usa token de produção quando disponível)
      const accessToken = getMercadoPagoAccessToken({ forPix: true })
      if (!accessToken) {
        return res.status(500).json({
          error: 'Mercado Pago não configurado',
          message:
            'Access token ausente para PIX. Configure MERCADOPAGO_ACCESS_TOKEN_PROD (PIX não funciona com token TEST).',
        })
      }

      console.log('PIX usando token:', String(accessToken).startsWith('TEST') ? 'TEST' : 'PROD/APP_USR')

      // Configurar cliente do Mercado Pago
      const client = new MercadoPagoConfig({
        accessToken: accessToken,
        options: { timeout: 15000 }
      })

      const payment = new Payment(client)

      // Criar pagamento PIX
      const paymentData = {
        transaction_amount: Number(amountNumber.toFixed(2)),
        description: String(description).slice(0, 255),
        payment_method_id: 'pix',
        payer: {
          email: userEmail || 'cliente@exemplo.com',
          first_name: (userName || 'Cliente').split(' ')[0] || 'Cliente',
        },
        metadata: {
          transaction_id: transactionId,
        },
        notification_url:
          process.env.MERCADOPAGO_WEBHOOK_URL ||
          functions.config().app?.webhook_url ||
          'https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago',
      }

      console.log('Criando pagamento PIX no Mercado Pago:', {
        amount: paymentData.transaction_amount,
        description: paymentData.description,
        transactionId,
      })
      
      const result = await payment.create({
        body: paymentData,
        requestOptions: { idempotencyKey: `pix-${transactionId}` },
      })
      
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
        message: error.message || error.cause?.[0]?.description || 'Erro desconhecido',
        code: error.cause?.[0]?.code || error.code || 'PIX_CREATE_FAILED',
        details: error.cause || error.response?.data || null
      })
    }
  })
})

/** Public Key para Checkout Transparente (Payment Brick) — sem secrets. */
exports.getMercadoPagoPublicConfig = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }
    const publicKey = getMercadoPagoPublicKey()
    if (!publicKey) {
      return res.status(500).json({
        error: 'Public key ausente',
        message: 'Configure MERCADOPAGO_PUBLIC_KEY_PROD no ambiente das functions.',
      })
    }
    return res.status(200).json({
      publicKey,
      testMode: isMercadoPagoTestMode(),
      locale: 'pt-BR',
    })
  })
})

/**
 * Checkout Transparente — processa formData do Payment Brick (cartão / PIX / boleto).
 * Pagamento acontece no site; sem redirecionar ao login do MP.
 */
exports.processBrickPayment = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    try {
      const {
        transactionId,
        formData,
        amount,
        description,
        userEmail,
        userName,
        courseId,
      } = req.body || {}

      const amountNumber = parseFloat(amount)
      if (!transactionId || !formData || Number.isNaN(amountNumber) || amountNumber <= 0) {
        return res.status(400).json({
          error: 'Dados inválidos',
          message: 'Informe transactionId, formData e amount válidos.',
        })
      }

      const accessToken = getMercadoPagoAccessToken({ forPix: true })
      if (!accessToken || String(accessToken).startsWith('TEST-')) {
        // Checkout transparente em produção deve usar APP_USR
        if (!accessToken) {
          return res.status(500).json({
            error: 'Mercado Pago não configurado',
            message: 'Access token ausente.',
          })
        }
      }

      const client = new MercadoPagoConfig({
        accessToken,
        options: { timeout: 20000 },
      })
      const payment = new Payment(client)

      const payerFromBrick = formData.payer || {}
      const paymentBody = {
        ...formData,
        transaction_amount: Number(amountNumber.toFixed(2)),
        description: String(description || 'Curso').slice(0, 255),
        external_reference: String(transactionId),
        metadata: {
          ...(formData.metadata || {}),
          transaction_id: String(transactionId),
          course_id: courseId || null,
        },
        notification_url:
          process.env.MERCADOPAGO_WEBHOOK_URL ||
          'https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago',
        payer: {
          ...payerFromBrick,
          email: payerFromBrick.email || userEmail || undefined,
          first_name:
            payerFromBrick.first_name ||
            (userName || 'Cliente').split(' ')[0] ||
            'Cliente',
        },
      }

      // Garante amount coerente (Brick já manda, mas reforçamos)
      if (paymentBody.transaction_amount == null) {
        paymentBody.transaction_amount = Number(amountNumber.toFixed(2))
      }

      // Parcelas: crédito até 6x; débito/PIX/boleto ficam em 1x
      const rawInstallments = Number(paymentBody.installments)
      if (Number.isFinite(rawInstallments) && rawInstallments > 0) {
        paymentBody.installments = Math.min(6, Math.max(1, Math.floor(rawInstallments)))
      } else if (paymentBody.token) {
        paymentBody.installments = 1
      }

      console.log('processBrickPayment:', {
        transactionId,
        paymentMethodId: paymentBody.payment_method_id,
        installments: paymentBody.installments || null,
        tokenPrefix: String(accessToken).slice(0, 8),
      })

      const result = await payment.create({
        body: paymentBody,
        requestOptions: {
          idempotencyKey: `${transactionId}-${Date.now()}`,
        },
      })
      const status = result.status || 'pending'
      const statusDetail = result.status_detail || null
      const pointOfInteraction = result.point_of_interaction || {}
      const txData = pointOfInteraction.transaction_data || {}

      const pixCopyPaste = txData.qr_code || null
      const pixQrCode = txData.qr_code_base64 || null
      const ticketUrl = txData.ticket_url || result.transaction_details?.external_resource_url || null

      try {
        await admin.firestore().collection('transactions').doc(String(transactionId)).set(
          {
            mercadopagoPaymentId: result.id != null ? String(result.id) : null,
            mercadopagoStatus: status,
            mercadopagoStatusDetail: statusDetail,
            paymentMethodId: result.payment_method_id || paymentBody.payment_method_id || null,
            pixCopyPaste: pixCopyPaste || null,
            pixQrCode: pixQrCode || null,
            ticketUrl: ticketUrl || null,
            checkoutMode: 'transparent_brick',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(status === 'approved'
              ? { status: 'approved', paidAt: admin.firestore.FieldValue.serverTimestamp() }
              : {}),
          },
          { merge: true },
        )
      } catch (txErr) {
        console.warn('processBrickPayment: falha ao atualizar transaction', txErr?.message || txErr)
      }

      return res.status(200).json({
        success: true,
        paymentId: result.id,
        status,
        statusDetail,
        paymentMethodId: result.payment_method_id || null,
        pixCopyPaste,
        pixQrCode,
        ticketUrl,
        testMode: isMercadoPagoTestMode(),
      })
    } catch (error) {
      console.error('Erro processBrickPayment:', error)
      return res.status(500).json({
        error: 'Erro ao processar pagamento',
        message:
          error.message ||
          error.cause?.[0]?.description ||
          'Erro desconhecido',
        details: error.cause || error.response?.data || null,
      })
    }
  })
})

function isPublicHttpsUrl(url) {
  try {
    const u = new URL(String(url || ''))
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false
    return true
  } catch {
    return false
  }
}

function resolveMercadoPagoBackUrl(candidate, fallback) {
  if (isPublicHttpsUrl(candidate)) return String(candidate)
  return fallback
}

/** Cria preferência Checkout Pro ou assinatura (renovação automática no cartão) */
exports.createCheckoutPreference = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    try {
      const {
        amount,
        description,
        transactionId,
        userEmail,
        userName,
        courseId,
        courseDuration,
        autoRenew,
        successUrl,
        failureUrl,
        pendingUrl,
        checkoutKind: checkoutKindRaw,
      } = req.body || {}

      const amountNumber = parseFloat(amount)
      if (!transactionId || !description || Number.isNaN(amountNumber) || amountNumber <= 0) {
        return res.status(400).json({
          error: 'Dados inválidos',
          message: 'Informe amount, description e transactionId válidos.',
        })
      }

      // boleto = ticket + PIX; card = só cartão; brick/all = todas as formas (Payment Brick)
      const checkoutKind =
        checkoutKindRaw === 'boleto'
          ? 'boleto'
          : checkoutKindRaw === 'brick' || checkoutKindRaw === 'all'
            ? 'brick'
            : 'card'

      const accessToken = getMercadoPagoAccessToken()
      if (!accessToken) {
        return res.status(500).json({
          error: 'Mercado Pago não configurado',
          message: 'Access token ausente.',
        })
      }

      const client = new MercadoPagoConfig({
        accessToken,
        options: { timeout: 15000 },
      })

      // MP exige HTTPS público em back_urls quando auto_return está ativo (localhost falha).
      const siteBase =
        process.env.PUBLIC_SITE_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        'https://www.flashconcards.com.br'
      const originFallback = String(siteBase).replace(/\/$/, '')
      const successFallback = `${originFallback}/pagamento?status=success&txn=${encodeURIComponent(transactionId)}${courseId ? `&course=${encodeURIComponent(courseId)}` : ''}`
      const failureFallback = `${originFallback}/pagamento?status=failure&txn=${encodeURIComponent(transactionId)}${courseId ? `&course=${encodeURIComponent(courseId)}` : ''}`
      const pendingFallback = `${originFallback}/pagamento?status=pending&txn=${encodeURIComponent(transactionId)}${courseId ? `&course=${encodeURIComponent(courseId)}` : ''}`

      const success = resolveMercadoPagoBackUrl(successUrl, successFallback)
      const failure = resolveMercadoPagoBackUrl(failureUrl, failureFallback)
      const pending = resolveMercadoPagoBackUrl(pendingUrl, pendingFallback)

      const wantAutoRenew = checkoutKind === 'card' && Boolean(autoRenew)
      const recurring = wantAutoRenew
        ? toMercadoPagoRecurring({
            courseDuration,
            courseDurationUnit: req.body?.courseDurationUnit,
            courseDurationValue: req.body?.courseDurationValue,
          })
        : null

      // Assinatura Mercado Pago (cartão com renovação automática)
      if (wantAutoRenew && recurring) {
        const preApproval = new PreApproval(client)
        const preBody = {
          reason: String(description).slice(0, 256),
          external_reference: String(transactionId),
          payer_email: userEmail || undefined,
          auto_recurring: {
            frequency: recurring.frequency,
            frequency_type: recurring.frequency_type,
            transaction_amount: amountNumber,
            currency_id: 'BRL',
          },
          back_url: success,
          status: 'pending',
          metadata: {
            transaction_id: String(transactionId),
            course_id: courseId || null,
            auto_renew: true,
            course_duration: courseDuration || null,
          },
        }

        const result = await preApproval.create({ body: preBody })
        const testMode = isMercadoPagoTestMode()
        const checkoutUrl = resolveCheckoutInitPoint(result, { testMode })

        if (!checkoutUrl) {
          return res.status(500).json({
            error: 'Assinatura sem URL',
            message: testMode
              ? 'Mercado Pago não retornou init_point da assinatura.'
              : 'Conta de produção sem init_point. Verifique se o aplicativo MP está em produção e com checkout habilitado.',
            details: { hasInit: Boolean(result.init_point), hasSandbox: Boolean(result.sandbox_init_point) },
          })
        }

        return res.status(200).json({
          success: true,
          mode: 'subscription',
          preferenceId: result.id,
          preapprovalId: result.id,
          checkoutUrl,
          initPoint: result.init_point,
          sandboxInitPoint: result.sandbox_init_point,
          testMode,
        })
      }

      const preference = new Preference(client)
      // brick = todas as formas (PIX/boleto/crédito/débito) com até 6x no crédito
      const paymentMethods =
        checkoutKind === 'boleto'
          ? {
              // Só boleto (ticket) + PIX (bank_transfer) no Checkout Pro
              excluded_payment_types: [
                { id: 'credit_card' },
                { id: 'debit_card' },
                { id: 'prepaid_card' },
              ],
            }
          : checkoutKind === 'brick' || checkoutKind === 'all'
            ? {
                installments: 6,
              }
            : {
              // Só cartão no fluxo de cartão — até 6x
              installments: 6,
              excluded_payment_types: [
                { id: 'ticket' },
                { id: 'bank_transfer' },
              ],
            }

      const body = {
        items: [
          {
            id: String(courseId || transactionId).slice(0, 256),
            title: String(description).slice(0, 256),
            quantity: 1,
            unit_price: Number(amountNumber.toFixed(2)),
            currency_id: 'BRL',
          },
        ],
        payer: {
          email: userEmail || undefined,
          name: userName || undefined,
        },
        external_reference: String(transactionId),
        metadata: {
          transaction_id: String(transactionId),
          course_id: courseId || null,
          auto_renew: false,
          checkout_kind: checkoutKind,
          course_duration: courseDuration || null,
        },
        payment_methods: paymentMethods,
        back_urls: {
          success,
          failure,
          pending,
        },
        notification_url:
          process.env.MERCADOPAGO_WEBHOOK_URL ||
          'https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago',
        statement_descriptor: 'CONCURSEIRO PRED',
      }

      // Só usa auto_return se as 3 URLs forem HTTPS públicas (exigência do MP)
      if (isPublicHttpsUrl(success) && isPublicHttpsUrl(failure) && isPublicHttpsUrl(pending)) {
        body.auto_return = 'approved'
      }

      console.log(
        'createCheckoutPreference kind:',
        checkoutKind,
        'back_urls:',
        body.back_urls,
        'auto_return:',
        body.auto_return,
      )

      const result = await preference.create({ body })
      const testMode = isMercadoPagoTestMode()
      const checkoutUrl = resolveCheckoutInitPoint(result, { testMode })

      console.log('createCheckoutPreference result:', {
        testMode,
        tokenPrefix: String(getMercadoPagoAccessToken()).slice(0, 8),
        hasInitPoint: Boolean(result.init_point),
        hasSandbox: Boolean(result.sandbox_init_point),
        preferenceId: result.id,
      })

      if (!checkoutUrl) {
        return res.status(500).json({
          error: 'Preferência sem URL',
          message: testMode
            ? 'Mercado Pago não retornou init_point.'
            : 'Produção sem link de pagamento (init_point). Confira no painel do MP se a aplicação está ativa em produção e com Checkout Pro/pagamentos online habilitados.',
          details: {
            hasInitPoint: Boolean(result.init_point),
            hasSandbox: Boolean(result.sandbox_init_point),
            testMode,
          },
        })
      }

      return res.status(200).json({
        success: true,
        mode: 'checkout',
        preferenceId: result.id,
        checkoutUrl,
        initPoint: result.init_point,
        sandboxInitPoint: result.sandbox_init_point,
        testMode,
      })
    } catch (error) {
      console.error('Erro createCheckoutPreference:', error)
      return res.status(500).json({
        error: 'Erro ao criar preferência',
        message:
          error.message ||
          error.cause?.[0]?.description ||
          'Erro desconhecido',
        details: error.cause || error.response?.data || null,
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
            const accessToken = getMercadoPagoAccessToken()
            
            const client = new MercadoPagoConfig({
              accessToken: accessToken,
              options: { timeout: 10000 }
            })
            
            const payment = new Payment(client)
            const paymentInfo = await payment.get({ id: paymentId.toString() })
            
            // Buscar transactionId no metadata
            const transactionId =
              paymentInfo?.metadata?.transaction_id || paymentInfo?.external_reference
            
            if (transactionId) {
              console.log(`Encontrado transactionId no metadata: ${transactionId}`)
              const transactionDoc = await transactionsRef.doc(transactionId).get()
              
              if (transactionDoc.exists) {
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
        const accessToken = getMercadoPagoAccessToken()
        
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
            // Usuário já existe - ativar / renovar acesso ao curso
            const userRef = admin.firestore().collection('users').doc(userId)
            const userDoc = await userRef.get()
            
            if (userDoc.exists) {
              let courseDuration = transactionData.courseDuration || null
              let courseDurationUnit = transactionData.courseDurationUnit || null
              let courseDurationValue = transactionData.courseDurationValue ?? null
              if ((!courseDuration && !courseDurationUnit) && courseId) {
                try {
                  const courseSnap = await admin.firestore().collection('courses').doc(courseId).get()
                  if (courseSnap.exists) {
                    const c = courseSnap.data() || {}
                    courseDuration = c.courseDuration || null
                    courseDurationUnit = c.courseDurationUnit || null
                    courseDurationValue = c.courseDurationValue ?? null
                  }
                } catch (_) { /* ignore */ }
              }

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
              
              // Criar perfil no Firestore (acesso ao curso via grantCourseAccess)
              console.log(`Criando novo usuário ${userRecord.uid} com curso ${courseId}`)
              
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

              let courseDuration = transactionData.courseDuration || null
              let courseDurationUnit = transactionData.courseDurationUnit || null
              let courseDurationValue = transactionData.courseDurationValue ?? null
              if ((!courseDuration && !courseDurationUnit) && courseId) {
                try {
                  const courseSnap = await admin.firestore().collection('courses').doc(courseId).get()
                  if (courseSnap.exists) {
                    const c = courseSnap.data() || {}
                    courseDuration = c.courseDuration || null
                    courseDurationUnit = c.courseDurationUnit || null
                    courseDurationValue = c.courseDurationValue ?? null
                  }
                } catch (_) { /* ignore */ }
              }

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

exports.sendEmailVerificationCode = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method === 'OPTIONS') return res.status(204).send('')
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

    try {
      const decoded = await verifyAuthRequest(req)
      const uid = decoded.uid
      const email = (decoded.email || '').toLowerCase().trim()
      if (!email) return res.status(400).json({ error: 'Email não encontrado na conta.' })

      const userRecord = await admin.auth().getUser(uid)
      if (userRecord.emailVerified) {
        await admin.firestore().collection('users').doc(uid).set(
          { emailVerified: true, email: email },
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

      await codeRef.set({
        email,
        code,
        expiresAt,
        attempts: 0,
        lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      const userDoc = await admin.firestore().collection('users').doc(uid).get()
      const displayName = userDoc.data()?.displayName || email.split('@')[0]

      const html = buildEmailVerificationHtml({ code, displayName, email })
      await sendBrandedEmail({
        to: email,
        subject: `${code} — Confirme seu email | ${DEFAULT_FROM_NAME}`,
        html,
        text: `Seu código de verificação é ${code}. Válido por 30 minutos. Verifique também spam e lixeira.`,
      })

      await admin.firestore().collection('users').doc(uid).set(
        { emailVerified: false, email },
        { merge: true },
      )

      return res.status(200).json({ success: true, message: 'Código de verificação enviado.' })
    } catch (error) {
      console.error('Erro ao enviar código de verificação:', error)
      const status = error.status || 500
      return res.status(status).json({ error: error.message || 'Erro ao enviar código.' })
    }
  })
})

exports.verifyEmailCode = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
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
        await codeRef.set(
          { attempts: (data.attempts || 0) + 1 },
          { merge: true },
        )
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
      await codeRef.delete()

      try {
        await sendAccountWelcomeEmail(uid)
      } catch (welcomeErr) {
        console.error('Erro ao enviar email de boas-vindas pós-verificação:', welcomeErr)
      }

      return res.status(200).json({ success: true, message: 'Email verificado com sucesso!' })
    } catch (error) {
      console.error('Erro ao verificar código:', error)
      const status = error.status || 500
      return res.status(status).json({ error: error.message || 'Erro ao verificar código.' })
    }
  })
})

// Envia email de boas-vindas retroativo para usuários já verificados
exports.sendRetroactiveWelcomeEmails = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method === 'OPTIONS') return res.status(204).send('')
      if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

      try {
        await verifyAdminRequest(req)

        const usersSnap = await admin.firestore().collection('users').get()
        let sent = 0
        let skipped = 0
        let failed = 0
        const errors = []

        for (const docSnap of usersSnap.docs) {
          const data = docSnap.data() || {}
          const uid = docSnap.id

          const isVerified =
            data.emailVerified === true ||
            (await admin.auth().getUser(uid).then((u) => u.emailVerified).catch(() => false))

          if (!isVerified) {
            skipped += 1
            continue
          }

          try {
            const result = await sendAccountWelcomeEmail(uid)
            if (result.sent) sent += 1
            else skipped += 1
          } catch (err) {
            failed += 1
            errors.push({ uid, email: data.email, error: err.message })
            console.error(`Falha welcome retroativo ${uid}:`, err)
          }

          // Pequena pausa para não sobrecarregar o Gmail
          await new Promise((r) => setTimeout(r, 350))
        }

        return res.status(200).json({
          success: true,
          sent,
          skipped,
          failed,
          errors: errors.slice(0, 20),
        })
      } catch (error) {
        console.error('Erro no envio retroativo de boas-vindas:', error)
        const status = error.status || 500
        return res.status(status).json({ error: error.message || 'Erro ao enviar emails.' })
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

/** Libera conteúdos do Guia Mentorado dia a dia (só matérias do dia). */
exports.mentoradoDailyContentRelease = functions.pubsub
  .schedule(`0 ${MENTORADO_DAILY_RELEASE_HOUR} * * *`)
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    console.log('[mentoradoDailyContentRelease] Iniciando liberação diária…')
    const { runDailyMentoradoAutomationForAllCourses } = getDailyModule()
    const results = await runDailyMentoradoAutomationForAllCourses()
    console.log('[mentoradoDailyContentRelease] Concluído:', results.length, 'curso(s)')
    return null
  })

/** Retoma jobs pausados — backup a cada 1 min (retomada principal: fila + nudge). */
exports.resumeWaitingGenerationJobs = functions.pubsub
  .schedule('every 1 minutes')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    const { processStuckPendingGenerationJobs } = getKickModule()
    const stuck = await processStuckPendingGenerationJobs()

    const { resumeWaitingGenerationJobs } = getResumeModule()
    const result = await resumeWaitingGenerationJobs()
    if (stuck.kicked > 0 || result.resumed > 0 || result.waiting > 0 || result.stalled > 0) {
      console.log('[resumeWaitingGenerationJobs]', { stuck, ...result })
    }
    return null
  })

/** Agenda retomada ~15s após pausa — só o job afetado (não interfere nos outros). */
exports.onGenerationResumeQueueWrite = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .firestore.document('generationResumeQueue/{jobId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null

    const jobId = context.params.jobId
    const data = change.after.data() || {}
    const nextMs = data.nextRetryAt?.toMillis?.() || Date.now()
    const waitMs = Math.min(Math.max(0, nextMs - Date.now()), 90 * 1000)

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }

    const { resumeSingleGenerationJob, isJobCancelled } = getResumeModule()
    const userId = data.userId
    if (userId && (await isJobCancelled(userId, jobId))) {
      return null
    }

    try {
      const result = await resumeSingleGenerationJob(jobId, data)
      if (result.resumed) {
        console.log('[onGenerationResumeQueueWrite] retomado:', jobId, result.jobType)
      } else if (result.reason && result.reason !== 'not_due') {
        console.log('[onGenerationResumeQueueWrite]', jobId, result.reason)
      }
    } catch (err) {
      console.error('[onGenerationResumeQueueWrite] erro', jobId, err)
    }
    return null
  })

/** Cliente força retomada de job travado ou aguardando. */
exports.nudgeGenerationJobResume = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' })
      }
      try {
        const authUser = await verifyAuthRequest(req)
        const { userId, jobId } = req.body || {}
        if (!userId || !jobId) {
          return res.status(400).json({ error: 'userId e jobId são obrigatórios' })
        }
        if (authUser.uid !== userId) {
          try {
            await verifyAdminRequest(req)
          } catch {
            return res.status(403).json({ error: 'Não autorizado' })
          }
        }
        const { nudgeStalledGenerationJob } = getResumeModule()
        const result = await nudgeStalledGenerationJob(userId, jobId)
        return res.status(200).json(result)
      } catch (err) {
        console.error('[nudgeGenerationJobResume]', err)
        return res.status(500).json({ error: err.message || 'Erro ao retomar job' })
      }
    })
  })

/** Dispara processamento imediato de job pendente (fallback se onCreate não disparar). */
exports.kickGenerationJob = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' })
      }
      try {
        const authUser = await verifyAuthRequest(req)
        const { userId, jobId } = req.body || {}
        if (!userId || !jobId) {
          return res.status(400).json({ error: 'userId e jobId são obrigatórios' })
        }
        if (authUser.uid !== userId) {
          try {
            await verifyAdminRequest(req)
          } catch {
            return res.status(403).json({ error: 'Não autorizado' })
          }
        }
        const { kickGenerationJob } = getKickModule()
        const result = await kickGenerationJob(userId, jobId, { wait: false })
        return res.status(200).json(result)
      } catch (err) {
        console.error('[kickGenerationJob]', err)
        return res.status(500).json({ error: err.message || 'Erro ao iniciar job' })
      }
    })
  })

/** Cancela job no servidor — para retomadas e libera slot. */
exports.cancelGenerationJob = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }
    try {
      const authUser = await verifyAuthRequest(req)
      const { userId, jobId, all, global } = req.body || {}

      if (global) {
        await verifyAdminRequest(req)
        const { cancelAllActiveJobsGlobally } = getResumeModule()
        const result = await cancelAllActiveJobsGlobally()
        return res.status(200).json(result)
      }

      if (!userId) {
        return res.status(400).json({ error: 'userId é obrigatório' })
      }
      if (authUser.uid !== userId) {
        try {
          await verifyAdminRequest(req)
        } catch {
          return res.status(403).json({ error: 'Não autorizado' })
        }
      }
      const { cancelGenerationJob, cancelAllGenerationJobs } = getResumeModule()
      if (all) {
        const result = await cancelAllGenerationJobs(userId)
        return res.status(200).json(result)
      }
      if (!jobId) {
        return res.status(400).json({ error: 'jobId é obrigatório (ou all: true)' })
      }
      const result = await cancelGenerationJob(userId, jobId)
      return res.status(200).json(result)
    } catch (err) {
      console.error('[cancelGenerationJob]', err)
      return res.status(500).json({ error: err.message || 'Erro ao cancelar job' })
    }
  })
})

/** Professor fiscalizador — 1 item por vez; backup a cada 1 min se a cadeia falhar. */
exports.professorSupervisorTick = functions.pubsub
  .schedule('every 1 minutes')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    try {
      const { tickProfessorSupervisor } = getSupervisorQueueModule()
      const result = await tickProfessorSupervisor()
      if (result.started || result.skipped) {
        console.log('[professorSupervisorTick]', result)
      }
    } catch (err) {
      console.error('[professorSupervisorTick]', err)
    }
    return null
  })

/** Ao ativar, dispara fiscalização imediata. */
exports.onProfessorFiscalizadorConfigUpdated = functions.firestore
  .document('config/professorFiscalizador')
  .onUpdate(async (change) => {
    const before = change.before.data() || {}
    const after = change.after.data() || {}
    if (!after.enabled || before.enabled === after.enabled) return null
    try {
      const { tickProfessorSupervisor } = getSupervisorQueueModule()
      const result = await tickProfessorSupervisor({ force: true })
      console.log('[onProfessorFiscalizadorConfigUpdated]', result)
    } catch (err) {
      console.error('[onProfessorFiscalizadorConfigUpdated]', err)
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

/** Expira acessos de curso com expiresAt vencido (sem renovação pendente). */
exports.expireCourseAccesses = functions.pubsub
  .schedule('15 0 * * *')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    const db = admin.firestore()
    const now = admin.firestore.Timestamp.now()
    const snap = await db
      .collection('courseEntitlements')
      .where('status', '==', 'active')
      .where('lifetime', '==', false)
      .where('expiresAt', '<=', now)
      .get()

    let expired = 0
    for (const docSnap of snap.docs) {
      const data = docSnap.data()
      // Auto-renew: deixa o job de renovação tentar primeiro; se já passou 2 dias, expira
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
        console.error('Falha ao expirar entitlement', docSnap.id, err)
      }
    }
    console.log(`expireCourseAccesses: ${expired} acessos expirados`)
    return null
  })

/**
 * Renovações automáticas: cria cobrança Checkout Pro (cartão) e notifica o usuário.
 * A assinatura MP (PreApproval) renova sozinha; este job cobre quem marcou autoRenew
 * e ainda precisa renovar via preferência quando a assinatura falhar / não existir.
 */
exports.processCourseAutoRenewals = functions.pubsub
  .schedule('0 8 * * *')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
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
      .get()

    let notified = 0
    for (const docSnap of snap.docs) {
      const data = docSnap.data()
      if (!data.userId || !data.courseId) continue
      if (data.preapprovalId) {
        // Assinatura MP ativa — cobrança recorrente cuidará da renovação
        continue
      }

      try {
        const userSnap = await db.collection('users').doc(data.userId).get()
        if (!userSnap.exists) continue
        const user = userSnap.data()
        const courseSnap = await db.collection('courses').doc(data.courseId).get()
        const course = courseSnap.exists ? courseSnap.data() : {}
        const amount = data.amount || course.price || 99.9
        const txnId = `REN-${Date.now()}-${data.userId.slice(0, 6)}`

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
          message: `Seu acesso a "${course.name || 'curso'}" vence em breve. Com a renovação automática ativada, conclua o pagamento no Mercado Pago para manter o acesso.`,
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
        console.error('Falha auto-renew', docSnap.id, err)
      }
    }

    console.log(`processCourseAutoRenewals: ${notified} avisos/transações de renovação`)
    return null
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
      try {
        assertGeminiConfigured()
      } catch {
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
      let newsData
      try {
        newsData = await generateAiJson(prompt, {
          useGoogleSearch: true,
          generationConfig: { maxOutputTokens: 8000, temperature: 0.7 },
        })
      } catch (aiError) {
        console.error('Erro ao gerar/parsear JSON da IA:', aiError)
        return res.status(500).json({
          error: 'Erro ao processar resposta da IA',
          message: aiError?.message || 'Falha na geração',
        })
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

      try {
        assertGeminiConfigured()
      } catch {
        console.error('GEMINI_API_KEY não configurada')
        return null
      }

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

      const newsData = await generateAiJson(prompt, {
        useGoogleSearch: true,
        generationConfig: { maxOutputTokens: 8000, temperature: 0.7 },
      })

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

      try {
        assertGeminiConfigured()
      } catch {
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
      let newsData
      try {
        newsData = await generateAiJson(prompt, {
          useGoogleSearch: false,
          generationConfig: { maxOutputTokens: 8000, temperature: 0.7 },
        })
      } catch (parseError) {
        console.error('Erro ao parsear JSON da IA:', parseError)
        return res.status(500).json({
          error: 'Erro ao processar resposta da IA',
          message: parseError?.message || 'Falha na geração',
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
