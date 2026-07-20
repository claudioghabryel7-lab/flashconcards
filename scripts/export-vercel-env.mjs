/**
 * Gera .env.vercel a partir de .env + functions/.env (para importar no Vercel).
 * Uso: node scripts/export-vercel-env.mjs
 *
 * Importar no Vercel:
 *   Dashboard → Project → Settings → Environment Variables → Import .env
 *   ou: npx vercel env pull / push após vercel login
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outFile = path.join(root, '.env.vercel')

function readEnv(filePath) {
  const map = new Map()
  if (!fs.existsSync(filePath)) return map
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    map.set(t.slice(0, i).trim(), t.slice(i + 1))
  }
  return map
}

const map = readEnv(path.join(root, '.env'))
const fnMap = readEnv(path.join(root, 'functions', '.env'))
for (const [k, v] of fnMap) {
  if (!map.has(k) || !String(map.get(k)).trim()) map.set(k, v)
}

map.set('VITE_USE_SUPABASE', 'false')
map.set('NEXT_PUBLIC_USE_SUPABASE', 'false')
map.set('NEXT_PUBLIC_SITE_URL', 'https://www.flashconcards.com.br')
map.set('MERCADOPAGO_WEBHOOK_URL', 'https://www.flashconcards.com.br/api/mercadopago/webhook')
map.set('MERCADOPAGO_MODE', 'prod')

if (map.get('MERCADOPAGO_PUBLIC_KEY_PROD') && !map.get('NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY')) {
  map.set('NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY', map.get('MERCADOPAGO_PUBLIC_KEY_PROD'))
}

const keys = [
  '# Flashconcards — Production (importar no Vercel)',
  '# Gerado por: node scripts/export-vercel-env.mjs',
  '',
  '# --- Firebase (cliente) ---',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_VAPID_KEY',
  'NEXT_PUBLIC_FIREBASE_VAPID_KEY',
  '',
  '# --- Firebase Admin (servidor /api/*) — cole JSON inteiro numa linha ---',
  'FIREBASE_SERVICE_ACCOUNT_KEY',
  '',
  '# --- Site ---',
  'NEXT_PUBLIC_SITE_URL',
  'VITE_USE_SUPABASE',
  'NEXT_PUBLIC_USE_SUPABASE',
  '',
  '# --- Gemini (somente uma chave) ---',
  'VITE_GEMINI_API_KEY',
  'GEMINI_API_KEY',
  '',
  '# --- Email ---',
  'EMAIL_USER',
  'EMAIL_PASSWORD',
  '',
  '# --- Mercado Pago ---',
  'MERCADOPAGO_MODE',
  'MERCADOPAGO_WEBHOOK_URL',
  'MERCADOPAGO_ACCESS_TOKEN_PROD',
  'MERCADOPAGO_ACCESS_TOKEN',
  'MERCADOPAGO_PUBLIC_KEY_PROD',
  'MERCADOPAGO_PUBLIC_KEY',
  'NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY',
  '',
  '# --- Crons Vercel (/api/cron/*) ---',
  'CRON_SECRET',
]

const lines = []
const included = []
const missing = []

for (const entry of keys) {
  if (entry.startsWith('#') || entry === '') {
    lines.push(entry)
    continue
  }
  const val = map.get(entry)
  if (val && String(val).trim()) {
    lines.push(`${entry}=${val}`)
    included.push(entry)
  } else {
    lines.push(`# ${entry}=`)
    missing.push(entry)
  }
}

lines.push('')
lines.push('# --- Pendências manuais ---')
if (missing.includes('FIREBASE_SERVICE_ACCOUNT_KEY')) {
  lines.push(
    '# FIREBASE_SERVICE_ACCOUNT_KEY: Firebase Console → Project Settings → Service accounts → Generate new private key',
  )
  lines.push('# Cole o JSON minificado numa linha (ou use Vercel UI para colar o JSON).')
}

fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8')

console.log(`Arquivo gerado: ${outFile}`)
console.log(`Variáveis preenchidas: ${included.length}`)
if (missing.length) {
  console.log(`Faltando (preencher manualmente): ${missing.join(', ')}`)
}
console.log('')
console.log('Importar no Vercel: Settings → Environment Variables → Import .env → selecione .env.vercel')
