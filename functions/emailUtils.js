const functions = require('firebase-functions')
const nodemailer = require('nodemailer')
const admin = require('firebase-admin')

const DEFAULT_FROM_NAME = 'Concurseiro Preditivo'
const SITE_LOGO_URL = 'https://www.flashconcards.com.br/course-icons/logo.png'

function getEmailCredentials() {
  const user =
    process.env.EMAIL_USER ||
    functions.config().email?.user ||
    'flashconcards@gmail.com'
  const rawPass =
    process.env.EMAIL_PASSWORD ||
    functions.config().email?.password ||
    ''
  // Senhas de app do Gmail vêm com espaços — remover antes de autenticar
  const pass = String(rawPass).replace(/\s/g, '')
  return { user: String(user).trim(), pass }
}

function createEmailTransporter() {
  const { user, pass } = getEmailCredentials()
  if (!user || !pass) {
    console.error('Credenciais de email não configuradas (EMAIL_USER / EMAIL_PASSWORD).')
    return null
  }
  console.log(`Email transporter: usando conta ${user} (senha ${pass.length} chars)`)
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
    .map((text) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">${escapeHtml(text)}</p>`)
    .join('')
}

function bulletsToHtml(bullets = []) {
  const items = bullets.filter(Boolean)
  if (!items.length) return ''
  return `<ul style="margin:0 0 20px;padding-left:22px;color:#334155;">${items
    .map(
      (item) =>
        `<li style="margin:0 0 10px;font-size:15px;line-height:1.6;">${escapeHtml(item)}</li>`,
    )
    .join('')}</ul>`
}

function highlightToHtml(highlight = '') {
  if (!highlight?.trim()) return ''
  return `<div style="margin:0 0 20px;padding:16px 18px;border-radius:12px;background:linear-gradient(135deg,#f5f3ff,#ecfeff);border-left:4px solid #7c3aed;">
    <p style="margin:0;font-size:15px;line-height:1.6;color:#5b21b6;font-weight:600;">${escapeHtml(highlight.trim())}</p>
  </div>`
}

function buildBrandedEmailHtml({
  title,
  subtitle = '',
  bodyHtml = '',
  bullets = [],
  highlight = '',
  ctaLabel = '',
  ctaUrl = '',
  footerNote = 'Este é um email automático do Concurseiro Preditivo.',
  logoUrl = SITE_LOGO_URL,
}) {  const ctaBlock =
    ctaLabel && ctaUrl
      ? `
        <div style="text-align:center;margin:32px 0;">
          <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#0891b2);color:#fff!important;padding:14px 32px;border-radius:10px;font-size:16px;font-weight:700;text-decoration:none;">
            ${escapeHtml(ctaLabel)}
          </a>
        </div>
        <div style="margin-top:16px;padding:14px;background:#f8fafc;border-radius:8px;word-break:break-all;">
          <p style="margin:0 0 8px;font-size:12px;color:#64748b;font-weight:700;">Se o botão não funcionar, copie este link:</p>
          <a href="${ctaUrl}" style="font-size:12px;color:#7c3aed;">${escapeHtml(ctaUrl)}</a>
        </div>`
      : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;box-shadow:0 4px 24px rgba(15,23,42,.08);">
    <div style="background:linear-gradient(135deg,#7c3aed 0%,#0891b2 100%);color:#fff;padding:32px 28px 28px;text-align:center;">
      <img src="${logoUrl}" alt="${DEFAULT_FROM_NAME}" width="72" height="72" style="display:block;margin:0 auto 16px;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.2);" />
      <h1 style="margin:0;font-size:26px;line-height:1.3;">${escapeHtml(title)}</h1>
      ${subtitle ? `<p style="margin:10px 0 0;opacity:.92;font-size:15px;">${escapeHtml(subtitle)}</p>` : ''}
    </div>
    <div style="padding:36px 28px;">
      ${highlightToHtml(highlight)}
      ${bodyHtml}
      ${bulletsToHtml(bullets)}
      ${ctaBlock}
    </div>
    <div style="background:#f8fafc;padding:24px 28px;text-align:center;border-top:1px solid #e2e8f0;">
      <img src="${logoUrl}" alt="" width="36" height="36" style="display:block;margin:0 auto 10px;border-radius:10px;opacity:.85;" />
      <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Equipe ${DEFAULT_FROM_NAME}</strong></p>
      <p style="margin:0;font-size:12px;color:#94a3b8;">${escapeHtml(footerNote)}</p>
    </div>
  </div>
</body>
</html>`
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
  paragraphsToHtml,
  bulletsToHtml,
  highlightToHtml,
  escapeHtml,
  verifyAdminRequest,
  sendBrandedEmail,
  getEmailCredentials,
  DEFAULT_FROM_NAME,
  SITE_LOGO_URL,
}