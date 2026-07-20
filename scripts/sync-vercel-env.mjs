/**
 * Sincroniza .env + functions/.env -> Vercel Production.
 * Uso: npx vercel login
 *      node scripts/sync-vercel-env.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

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

const geminiKeys = [
  'VITE_GEMINI_API_KEY',
  'GEMINI_API_KEY',
]

const keys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_VAPID_KEY',
  'NEXT_PUBLIC_FIREBASE_VAPID_KEY',
  ...geminiKeys,
  'VITE_USE_SUPABASE',
  'NEXT_PUBLIC_USE_SUPABASE',
  'NEXT_PUBLIC_SITE_URL',
  'CRON_SECRET',
  'EMAIL_USER',
  'EMAIL_PASSWORD',
  'MERCADOPAGO_WEBHOOK_URL',
  'MERCADOPAGO_ACCESS_TOKEN_PROD',
  'MERCADOPAGO_ACCESS_TOKEN',
  'MERCADOPAGO_PUBLIC_KEY_PROD',
  'MERCADOPAGO_PUBLIC_KEY',
  'NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY',
  'NEXT_PUBLIC_MERCADOPAGO_MODE',
  'MERCADOPAGO_MODE',
  'MERCADOPAGO_CLIENT_ID',
  'MERCADOPAGO_CLIENT_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_KEY',
]

console.log('Enviando variáveis para Vercel (Production)...')
let ok = 0
let skip = 0
for (const key of keys) {
  const val = map.get(key)
  if (!val || !String(val).trim()) {
    skip += 1
    continue
  }
  console.log(`  -> ${key}`)
  const res = spawnSync('npx', ['vercel', 'env', 'add', key, 'production', '--force'], {
    input: String(val),
    cwd: root,
    encoding: 'utf8',
    shell: true,
  })
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout)
    process.exit(1)
  }
  ok += 1
}
console.log(`Feito: ${ok} enviada(s), ${skip} omitida(s).`)
if (!map.get('FIREBASE_SERVICE_ACCOUNT_KEY')) {
  console.log('')
  console.log('IMPORTANTE: adicione FIREBASE_SERVICE_ACCOUNT_KEY no Vercel')
  console.log('(JSON da conta de serviço Firebase) para /api/* funcionar em produção.')
}
