/**
 * Inicializa env + Firebase Admin para rotas API do Next.js (substituto das Cloud Functions).
 */
const path = require('path')

try {
  require('dotenv').config({ path: path.join(__dirname, '../../functions/.env') })
} catch {
  /* ignore */
}
try {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') })
} catch {
  /* ignore */
}
try {
  require('dotenv').config({ path: path.join(__dirname, '../../.env.local') })
} catch {
  /* ignore */
}

const { ensureInitialized, getAdmin } = require('../../functions/firebaseAdmin.js')

ensureInitialized()

function getSiteWebhookUrl() {
  const base = (
    process.env.MERCADOPAGO_WEBHOOK_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    'https://www.flashconcards.com.br'
  ).replace(/\/$/, '')

  if (base.includes('cloudfunctions.net')) {
    const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.flashconcards.com.br').replace(/\/$/, '')
    return `${site}/api/mercadopago/webhook`
  }
  return base.includes('/api/mercadopago/webhook') ? base : `${base}/api/mercadopago/webhook`
}

module.exports = { getAdmin, getSiteWebhookUrl }
