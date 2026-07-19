/**
 * Converte o JSON da service account em FIREBASE_SERVICE_ACCOUNT_KEY
 * nos arquivos .env (gitignored).
 *
 * Uso:
 * 1) Firebase Console → Project settings → Service accounts → Generate new private key
 * 2) Salve como firebase-service-account.json na raiz do projeto
 * 3) node scripts/install-firebase-admin-key.mjs
 * 4) (opcional) npm run sync:vercel-env
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const saPath = path.join(root, 'firebase-service-account.json')

if (!fs.existsSync(saPath)) {
  console.error('Arquivo não encontrado:', saPath)
  console.error('Baixe a chave em Firebase Console → Service accounts → Generate new private key')
  process.exit(1)
}

const parsed = JSON.parse(fs.readFileSync(saPath, 'utf8'))
if (!parsed.private_key || !parsed.client_email) {
  console.error('JSON inválido: precisa de private_key e client_email.')
  process.exit(1)
}

const compact = JSON.stringify(parsed)

function upsert(filePath) {
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  if (text && !text.endsWith('\n')) text += '\n'
  const line = `FIREBASE_SERVICE_ACCOUNT_KEY=${compact}`
  if (/^FIREBASE_SERVICE_ACCOUNT_KEY=/m.test(text)) {
    text = text.replace(/^FIREBASE_SERVICE_ACCOUNT_KEY=.*$/m, line)
  } else {
    text += `${line}\n`
  }
  fs.writeFileSync(filePath, text)
  console.log('OK:', path.relative(root, filePath))
}

upsert(path.join(root, '.env.local'))
upsert(path.join(root, 'functions', '.env'))
if (fs.existsSync(path.join(root, '.env'))) upsert(path.join(root, '.env'))

console.log('')
console.log('Service account instalada localmente.')
console.log('Para produção: npm run sync:vercel-env')
console.log('(ou cole FIREBASE_SERVICE_ACCOUNT_KEY no Vercel → Settings → Environment Variables)')
