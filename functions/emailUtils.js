const functions = require('firebase-functions')
const nodemailer = require('nodemailer')
const admin = require('firebase-admin')

const DEFAULT_FROM_NAME = 'Concurseiro Preditivo'
const SITE_LOGO_URL = 'https://www.flashconcards.com.br/course-icons/logo.png'
const SITE_URL = 'https://www.flashconcards.com.br'

const EMAIL_FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Syne:wght@600;700&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap'

const FEATURE_CHIPS = ['📚 Flashcards', '🤖 IA Preditiva', '🎯 Mentor', '📊 Progresso']
const BULLET_ACCENTS = ['#7c3aed', '#0891b2', '#db2777', '#d97706']

const D = {
  bg: '#f6f4ff',
  text: '#18181b',
  muted: '#71717a',
  faint: '#a1a1aa',
  body: '#3f3f46',
  divider: '#f0f0f2',
  accent: '#7c3aed',
  gradientBtn: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 50%, #0891b2 100%)',
  gradientStrip: 'linear-gradient(90deg, #7c3aed, #6366f1, #0891b2, #db2777)',
  heroBg:
    'radial-gradient(ellipse 140px 100px at 8% 15%, rgba(124,58,237,0.14), transparent), radial-gradient(ellipse 120px 120px at 92% 8%, rgba(8,145,178,0.12), transparent), radial-gradient(ellipse 160px 100px at 50% 100%, rgba(219,39,119,0.08), transparent), linear-gradient(180deg, #faf8ff 0%, #ffffff 100%)',
  gridBg: `radial-gradient(rgba(124,58,237,0.10) 1px, transparent 1px)`,
}

function getEmailCredentials() {
  const user =
    process.env.EMAIL_USER ||
    functions.config().email?.user ||
    'flashconcards@gmail.com'
  const rawPass =
    process.env.EMAIL_PASSWORD ||
    functions.config().email?.password ||
    ''
  const pass = String(rawPass).replace(/\s/g, '')
  return { user: String(user).trim(), pass }
}

function createEmailTransporter() {
  const { user, pass } = getEmailCredentials()
  if (!user || !pass) {
    console.error('Credenciais de email não configuradas (EMAIL_USER / EMAIL_PASSWORD).')
    return null
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function paragraphsToHtml(paragraphs = []) {
  return paragraphs
    .filter(Boolean)
    .map(
      (text) =>
        `<p style="margin:0 0 18px;font-family:'DM Sans',Arial,sans-serif;font-size:16px;line-height:1.8;color:${D.body};">${escapeHtml(text)}</p>`,
    )
    .join('')
}

function buildOrnamentDivider() {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0;">
    <tr>
      <td style="padding:0 36px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="height:1px;background:linear-gradient(90deg,transparent,${D.divider},transparent);font-size:0;line-height:0;">&nbsp;</td>
            <td width="28" align="center" style="font-size:10px;color:#c4b5fd;line-height:1;">◆</td>
            <td style="height:1px;background:linear-gradient(90deg,transparent,${D.divider},transparent);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}

function buildBadgePill(label, color, border, bg) {
  return `<td style="padding:4px 12px;border-radius:9999px;border:1px solid ${border};background:${bg};font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${color};white-space:nowrap;">${escapeHtml(label)}</td>`
}

function buildVerificationEmailHeader({ title, subtitle = '' }) {
  return `<tr>
    <td style="padding:28px 36px 0;text-align:center;background:${D.heroBg};">
      <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
        <tr>
          ${buildBadgePill('✦ Verificação', D.accent, 'rgba(124,58,237,0.22)', 'rgba(124,58,237,0.08)')}
          <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
          ${buildBadgePill('Conta segura', '#0891b2', 'rgba(8,145,178,0.22)', 'rgba(8,145,178,0.08)')}
        </tr>
      </table>
      <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:18px auto 0;">
        <tr>
          <td style="padding:6px;border-radius:20px;background:linear-gradient(135deg,rgba(124,58,237,0.18),rgba(8,145,178,0.18));">
            <table role="presentation" cellspacing="0" cellpadding="0">
              <tr>
                <td style="padding:12px;border-radius:16px;background:#ffffff;box-shadow:0 8px 24px rgba(124,58,237,0.14);">
                  <img src="${SITE_LOGO_URL}" alt="${DEFAULT_FROM_NAME}" width="56" height="56" style="display:block;border-radius:14px;" />
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td bgcolor="#ffffff" style="padding:18px 36px 26px;text-align:center;background-color:#ffffff;">
      <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${D.faint};">Concurseiro Preditivo</p>
      <h1 style="margin:10px 0 0;font-family:'Syne',Arial,sans-serif;font-size:28px;line-height:1.15;font-weight:700;color:#18181b;letter-spacing:-.03em;mso-line-height-rule:exactly;">${escapeHtml(title)}</h1>
      <div style="width:48px;height:3px;margin:12px auto 0;border-radius:9999px;background:${D.gradientStrip};"></div>
      ${subtitle ? `<p style="margin:12px auto 0;max-width:420px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.55;color:${D.muted};">${escapeHtml(subtitle)}</p>` : ''}
    </td>
  </tr>
  ${buildOrnamentDivider()}`
}

function buildEmailHeader({ title, subtitle = '' }) {
  return `<tr>
    <td style="padding:32px 36px 28px;text-align:center;background:${D.heroBg};">
      <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
        <tr>
          ${buildBadgePill('✦ Comunicado', D.accent, 'rgba(124,58,237,0.22)', 'rgba(124,58,237,0.08)')}
          <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
          ${buildBadgePill('IA Preditiva', '#0891b2', 'rgba(8,145,178,0.22)', 'rgba(8,145,178,0.08)')}
        </tr>
      </table>

      <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:20px auto 0;">
        <tr>
          <td style="padding:6px;border-radius:20px;background:linear-gradient(135deg,rgba(124,58,237,0.18),rgba(8,145,178,0.18));">
            <table role="presentation" cellspacing="0" cellpadding="0">
              <tr>
                <td style="padding:12px;border-radius:16px;background:#ffffff;box-shadow:0 8px 24px rgba(124,58,237,0.14);">
                  <img src="${SITE_LOGO_URL}" alt="${DEFAULT_FROM_NAME}" width="56" height="56" style="display:block;border-radius:14px;" />
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:16px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${D.faint};">Concurseiro Preditivo</p>
      <h1 style="margin:10px 0 0;font-family:'Syne',Arial,sans-serif;font-size:28px;line-height:1.15;font-weight:700;color:${D.text};letter-spacing:-.03em;">${escapeHtml(title)}</h1>
      <div style="width:48px;height:3px;margin:12px auto 0;border-radius:9999px;background:${D.gradientStrip};"></div>
      ${subtitle ? `<p style="margin:12px auto 0;max-width:420px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.55;color:${D.muted};">${escapeHtml(subtitle)}</p>` : ''}
    </td>
  </tr>
  ${buildOrnamentDivider()}`
}

function highlightToHtml(highlight = '') {
  if (!highlight?.trim()) return ''
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-radius:16px;border:1px solid rgba(124,58,237,0.14);background:linear-gradient(135deg,rgba(124,58,237,0.07),rgba(8,145,178,0.05));overflow:hidden;">
    <tr>
      <td style="height:2px;background:${D.gradientStrip};font-size:0;line-height:0;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding:20px 22px;">
        <p style="margin:0 0 8px;font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${D.accent};">✦ Destaque</p>
        <p style="margin:0;font-family:'Syne',Arial,sans-serif;font-size:19px;line-height:1.4;font-weight:600;color:${D.text};letter-spacing:-.02em;">${escapeHtml(highlight.trim())}</p>
      </td>
    </tr>
  </table>`
}

function bulletsToHtml(bullets = []) {
  const items = bullets.filter(Boolean)
  if (!items.length) return ''
  const rows = items
    .map((item, index) => {
      const accent = BULLET_ACCENTS[index % BULLET_ACCENTS.length]
      const num = String(index + 1).padStart(2, '0')
      return `<tr>
        <td style="padding-bottom:10px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:12px;border:1px solid #f0f0f2;border-top:2px solid ${accent};background:#fafafa;">
            <tr>
              <td width="52" valign="middle" style="padding:14px 0 14px 16px;">
                <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:8px;background:${accent}18;font-family:'Syne',Arial,sans-serif;font-size:12px;font-weight:700;color:${accent};">${num}</span>
              </td>
              <td valign="middle" style="padding:14px 16px 14px 0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.65;color:#52525b;">${escapeHtml(item)}</td>
            </tr>
          </table>
        </td>
      </tr>`
    })
    .join('')
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:4px 0 22px;">${rows}</table>`
}

function buildFeatureChips() {
  const chips = FEATURE_CHIPS.map(
    (chip) =>
      `<td style="padding:3px;"><span style="display:inline-block;padding:6px 12px;border-radius:9999px;border:1px solid rgba(15,15,20,0.06);background:#ffffff;font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:500;color:${D.muted};white-space:nowrap;">${escapeHtml(chip)}</span></td>`,
  ).join(`<td width="4" style="font-size:0;line-height:0;">&nbsp;</td>`)
  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:20px auto 0;"><tr>${chips}</tr></table>`
}

function ctaToHtml(ctaLabel = '', ctaUrl = '') {
  if (!ctaLabel || !ctaUrl) return ''
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:28px;border-radius:16px;border:1px solid rgba(124,58,237,0.12);background:radial-gradient(ellipse 200px 120px at 20% 50%, rgba(124,58,237,0.10), transparent), radial-gradient(ellipse 180px 100px at 80% 50%, rgba(8,145,178,0.08), transparent), #f8f7ff;">
    <tr>
      <td style="padding:28px 24px;text-align:center;">
        <p style="margin:0 0 16px;font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${D.faint};">Seu próximo passo</p>
        <table role="presentation" cellspacing="0" cellpadding="0" align="center">
          <tr>
            <td style="border-radius:9999px;background:${D.gradientBtn};box-shadow:0 4px 24px rgba(124,58,237,0.28);">
              <a href="${ctaUrl}" style="display:inline-block;padding:14px 34px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff!important;text-decoration:none;border-radius:9999px;">
                ${escapeHtml(ctaLabel)} →
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;line-height:1.5;color:${D.faint};">
          Problemas com o botão?
          <a href="${ctaUrl}" style="color:${D.accent};text-decoration:none;font-weight:600;"> Abrir no navegador →</a>
        </p>
      </td>
    </tr>
  </table>`
}

function buildEmailFooter(footerNote = 'Este é um email automático. Não responda diretamente a esta mensagem.') {
  return `<tr>
    <td style="padding:24px 36px 28px;border-top:1px solid ${D.divider};background:#fafafa;text-align:center;">
      <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 14px;">
        <tr>
          <td valign="middle" style="padding-right:8px;">
            <img src="${SITE_LOGO_URL}" alt="" width="24" height="24" style="display:block;border-radius:6px;opacity:.85;" />
          </td>
          <td valign="middle" style="font-family:'Syne',Arial,sans-serif;font-size:14px;font-weight:600;color:${D.muted};">Concurseiro Preditivo</td>
        </tr>
      </table>
      <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:${D.faint};">
        <a href="${SITE_URL}" style="color:${D.accent};text-decoration:none;font-weight:500;">flashconcards.com.br</a>
        · Estudos inteligentes para concursos
      </p>
      <p style="margin:10px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;line-height:1.5;color:#d4d4d8;">${escapeHtml(footerNote)}</p>
    </td>
  </tr>`
}

function emailShell({ preheader = '', bodyInner = '' }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <link href="${EMAIL_FONT_LINK}" rel="stylesheet" />
  <title>${DEFAULT_FROM_NAME}</title>
</head>
<body style="margin:0;padding:0;background-color:${D.bg};background-image:${D.gridBg};background-size:24px 24px;font-family:'DM Sans',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${D.bg};background-image:${D.gridBg};background-size:24px 24px;padding:36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid rgba(15,15,20,.08);box-shadow:0 24px 60px rgba(124,58,237,.10),0 0 0 1px rgba(124,58,237,.04);">
          <tr>
            <td style="height:4px;background:${D.gradientStrip};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          ${bodyInner}
        </table>
        <p style="margin:20px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:${D.faint};text-align:center;">
          © ${new Date().getFullYear()} ${DEFAULT_FROM_NAME}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildBrandedEmailHtml({
  title,
  subtitle = '',
  bodyHtml = '',
  bullets = [],
  highlight = '',
  ctaLabel = '',
  ctaUrl = '',
  footerNote = 'Este é um email automático. Não responda diretamente a esta mensagem.',
}) {
  const bodyInner = `
    ${buildEmailHeader({ title, subtitle })}
    <tr>
      <td style="padding:28px 36px 32px;">
        ${highlightToHtml(highlight)}
        ${bodyHtml}
        ${bulletsToHtml(bullets)}
        ${ctaToHtml(ctaLabel, ctaUrl)}
        ${buildFeatureChips()}
      </td>
    </tr>
    ${buildEmailFooter(footerNote)}
  `

  return emailShell({ preheader: subtitle || title, bodyInner })
}

function buildVerificationCodeHtml(code) {
  const digits = String(code).split('')
  const digitCells = digits
    .map(
      (digit) =>
        `<td style="padding:0 4px;"><div style="width:44px;height:52px;line-height:52px;text-align:center;border-radius:12px;border:1px solid ${D.divider};background:#ffffff;box-shadow:0 4px 12px rgba(124,58,237,0.08);font-family:'Syne',Arial,sans-serif;font-size:28px;font-weight:700;color:${D.text};">${escapeHtml(digit)}</div></td>`,
    )
    .join('')

  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:28px auto;">
    <tr>
      <td style="padding:24px 28px;border-radius:18px;border:1px solid rgba(124,58,237,0.12);background:radial-gradient(ellipse 180px 100px at 50% 0%, rgba(124,58,237,0.08), transparent), #fafafa;text-align:center;">
        <p style="margin:0 0 16px;font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${D.faint};">Seu código de verificação</p>
        <table role="presentation" cellspacing="0" cellpadding="0" align="center"><tr>${digitCells}</tr></table>
        <p style="margin:14px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:${D.faint};">Válido por 30 minutos</p>
      </td>
    </tr>
  </table>`
}

function buildAccountWelcomeHtml({ displayName = '', hasCourse = false, courseCount = 0 }) {
  const greeting = displayName ? `Olá, ${displayName}!` : 'Olá!'
  const courseLine = hasCourse
    ? courseCount > 1
      ? `Parabéns pela aquisição! Você já tem acesso a ${courseCount} cursos na plataforma. Desejamos excelentes estudos, foco e muita determinação rumo à sua aprovação!`
      : 'Parabéns pela aquisição do curso! Desejamos excelentes estudos, foco e muita determinação rumo à sua aprovação!'
    : 'Sua conta está pronta para uso. Explore a plataforma e comece sua jornada de estudos com inteligência artificial ao seu lado.'

  return buildBrandedEmailHtml({
    title: 'Conta confirmada!',
    subtitle: 'Bem-vindo(a) ao Concurseiro Preditivo',
    bodyHtml: paragraphsToHtml([
      `${greeting} Seu email foi verificado com sucesso e sua conta está ativa.`,
      courseLine,
      'Abaixo estão dicas rápidas para você aproveitar ao máximo a plataforma desde o primeiro dia.',
    ]),
    highlight:
      'Importante: marque nossos emails como "Não é spam" para não perder avisos, novidades e lembretes de estudo.',
    bullets: [
      'Acesse o Dashboard e selecione seu curso para começar',
      'Estude com Flashcards inteligentes personalizados por IA',
      'Use o Flash Mentor para tirar dúvidas e revisar conteúdos',
      'Siga o Guia Mentorado para organizar sua rotina de estudos',
      'Adicione flashconcards@gmail.com aos contatos e marque como confiável',
    ],
    ctaLabel: 'Começar a estudar',
    ctaUrl: `${SITE_URL}/select-course`,
    footerNote: 'Bons estudos! Estamos na torcida pela sua aprovação.',
  })
}

async function sendAccountWelcomeEmail(uid) {
  const userRef = admin.firestore().collection('users').doc(uid)
  const userDoc = await userRef.get()
  const docExists = typeof userDoc.exists === 'function' ? userDoc.exists() : userDoc.exists
  if (!docExists) {
    return { skipped: true, reason: 'no_profile' }
  }

  const data = userDoc.data() || {}
  if (data.role === 'admin') {
    return { skipped: true, reason: 'admin' }
  }
  if (data.welcomeEmailSentAt) {
    return { skipped: true, reason: 'already_sent' }
  }

  const email = String(data.email || '').toLowerCase().trim()
  if (!email) {
    return { skipped: true, reason: 'no_email' }
  }

  const purchasedCourses = Array.isArray(data.purchasedCourses) ? data.purchasedCourses : []
  const hasCourse = purchasedCourses.length > 0 || data.hasActiveSubscription === true
  const displayName = data.displayName || email.split('@')[0]

  const html = buildAccountWelcomeHtml({
    displayName,
    hasCourse,
    courseCount: purchasedCourses.length,
  })

  await sendBrandedEmail({
    to: email,
    subject: `Conta confirmada — bons estudos! | ${DEFAULT_FROM_NAME}`,
    html,
    text: `${displayName}, sua conta foi confirmada! Acesse ${SITE_URL}/select-course para começar. Marque flashconcards@gmail.com como contato seguro.`,
  })

  await userRef.set(
    { welcomeEmailSentAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  )

  return { sent: true, email }
}

function buildEmailVerificationHtml({ code, displayName = '', email = '' }) {
  const bodyInner = `
    ${buildVerificationEmailHeader({
      title: 'Confirme seu email',
      subtitle: 'Última etapa para liberar seu acesso à plataforma',
    })}
    <tr>
      <td style="padding:28px 36px 32px;">
        ${paragraphsToHtml([
          displayName ? `Olá, ${displayName}!` : 'Olá!',
          `Digite o código abaixo para verificar ${email} e continuar no ${DEFAULT_FROM_NAME}.`,
        ])}
        ${buildVerificationCodeHtml(code)}
        ${highlightToHtml('Não recebeu? Verifique spam ou lixeira — pode demorar alguns minutos.')}
        ${bulletsToHtml([
          'Remetente: flashconcards@gmail.com',
          'Marque como “não é spam” se encontrar na lixeira',
          'Aguarde 1 minuto entre reenvios na tela de verificação',
          'Contas não verificadas em até 24 horas são removidas automaticamente',
        ])}
        ${buildFeatureChips()}
      </td>
    </tr>
    ${buildEmailFooter('Por segurança, não compartilhe este código com ninguém.')}
  `

  return emailShell({
    preheader: `Seu código de verificação: ${code}`,
    bodyInner,
  })
}

async function verifyAdminRequest(req) {
  const authHeader = req.headers.authorization || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!idToken) {
    const err = new Error('Token de autenticação obrigatório.')
    err.status = 401
    throw err
  }
  const decoded = await admin.auth().verifyIdToken(idToken)
  const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get()
  const docExists = typeof userDoc.exists === 'function' ? userDoc.exists() : userDoc.exists
  if (!docExists || userDoc.data()?.role !== 'admin') {
    const err = new Error('Apenas administradores podem executar esta ação.')
    err.status = 403
    throw err
  }
  return decoded
}

async function verifyAuthRequest(req) {
  const authHeader = req.headers.authorization || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!idToken) {
    const err = new Error('Token de autenticação obrigatório.')
    err.status = 401
    throw err
  }
  return admin.auth().verifyIdToken(idToken)
}

async function sendBrandedEmail({ to, subject, html, text }) {
  const transporter = createEmailTransporter()
  if (!transporter) {
    const err = new Error('Serviço de email não configurado no servidor. Configure EMAIL_USER e EMAIL_PASSWORD.')
    err.status = 500
    throw err
  }
  const { user } = getEmailCredentials()
  try {
    await transporter.sendMail({
      from: `"${DEFAULT_FROM_NAME}" <${user}>`,
      to,
      subject,
      html,
      text: text || undefined,
    })
  } catch (sendErr) {
    if (sendErr?.code === 'EAUTH' || String(sendErr?.message || '').includes('Application-specific password')) {
      const err = new Error(
        'Gmail rejeitou o login. Use uma Senha de app do Google (16 caracteres), não a senha normal da conta.',
      )
      err.status = 503
      err.code = 'EAUTH'
      throw err
    }
    throw sendErr
  }
}

module.exports = {
  createEmailTransporter,
  buildBrandedEmailHtml,
  buildAccountWelcomeHtml,
  buildEmailVerificationHtml,
  paragraphsToHtml,
  bulletsToHtml,
  highlightToHtml,
  escapeHtml,
  verifyAdminRequest,
  verifyAuthRequest,
  sendBrandedEmail,
  sendAccountWelcomeEmail,
  getEmailCredentials,
  DEFAULT_FROM_NAME,
  SITE_LOGO_URL,
}
