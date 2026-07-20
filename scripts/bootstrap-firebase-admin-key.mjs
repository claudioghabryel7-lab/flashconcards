/**
 * Gera FIREBASE_SERVICE_ACCOUNT_KEY usando o login do Firebase CLI
 * e envia para Vercel Production. Não imprime a chave.
 *
 * Uso: node scripts/bootstrap-firebase-admin-key.mjs
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const PROJECT_ID = 'plegi-d84c2'
const saOut = path.join(root, 'firebase-service-account.json')

function loadFirebaseToolsConfig() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  if (!fs.existsSync(cfgPath)) {
    throw new Error('Firebase CLI sem login. Rode: firebase login')
  }
  return JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
}

async function getAccessToken() {
  const cfg = loadFirebaseToolsConfig()
  const tokens = cfg.tokens || cfg
  const refresh =
    tokens.refresh_token || (tokens.tokens && tokens.tokens.refresh_token) || null
  let access =
    tokens.access_token || (tokens.tokens && tokens.tokens.access_token) || null
  const expiresAt =
    tokens.expires_at || (tokens.tokens && tokens.tokens.expires_at) || 0

  if (access && expiresAt && Date.now() < Number(expiresAt) - 60_000) {
    return access
  }

  if (!refresh) {
    throw new Error('Sem refresh_token do Firebase CLI. Rode: firebase login')
  }

  // Client ID público do Firebase CLI / Google installed-app
  const body = new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekela8fddmbv31tgjtkd.apps.googleusercontent.com',
    client_secret: 'jZyWTrPPvFX8mYr_dTxe8wMF',
    refresh_token: refresh,
    grant_type: 'refresh_token',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(`Falha ao renovar token Google: ${data.error || res.status}`)
  }
  return data.access_token
}

async function api(accessToken, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || text || res.status
    const err = new Error(String(msg))
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

async function pickServiceAccount(accessToken) {
  const listed = await api(
    accessToken,
    `https://iam.googleapis.com/v1/projects/${PROJECT_ID}/serviceAccounts`,
  )
  const accounts = listed.accounts || []
  const preferred =
    accounts.find((a) => String(a.email).includes('firebase-adminsdk')) ||
    accounts.find((a) => String(a.email).endsWith('@appspot.gserviceaccount.com')) ||
    accounts[0]

  if (!preferred?.email) {
    throw new Error(
      `Nenhuma service account no projeto ${PROJECT_ID}. Ative o Firebase Admin SDK no console.`,
    )
  }
  return preferred.email
}

async function createKey(accessToken, email) {
  const name = `projects/${PROJECT_ID}/serviceAccounts/${email}`
  const created = await api(
    accessToken,
    `https://iam.googleapis.com/v1/${name}/keys`,
    {
      method: 'POST',
      body: JSON.stringify({
        privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE',
        keyAlgorithm: 'KEY_ALG_RSA_2048',
      }),
    },
  )

  if (!created.privateKeyData) {
    throw new Error('IAM não retornou privateKeyData')
  }

  const json = Buffer.from(created.privateKeyData, 'base64').toString('utf8')
  const parsed = JSON.parse(json)
  if (!parsed.private_key || !parsed.client_email) {
    throw new Error('JSON da service account inválido')
  }
  return parsed
}

function upsertEnv(filePath, compact) {
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  if (text && !text.endsWith('\n')) text += '\n'
  const line = `FIREBASE_SERVICE_ACCOUNT_KEY=${compact}`
  if (/^FIREBASE_SERVICE_ACCOUNT_KEY=/m.test(text)) {
    text = text.replace(/^FIREBASE_SERVICE_ACCOUNT_KEY=.*$/m, line)
  } else {
    text += `${line}\n`
  }
  fs.writeFileSync(filePath, text)
  console.log('OK env:', path.relative(root, filePath))
}

function pushVercelEnv(key, value) {
  console.log(`Enviando ${key} para Vercel Production...`)
  const res = spawnSync('npx', ['vercel', 'env', 'add', key, 'production', '--force'], {
    input: String(value),
    cwd: root,
    encoding: 'utf8',
    shell: true,
  })
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout)
    throw new Error(`Falha ao enviar ${key} para Vercel`)
  }
  console.log('OK vercel env:', key)
}

function redeploy() {
  console.log('Redeploy Production...')
  const res = spawnSync('npx', ['vercel', '--prod', '--yes'], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  })
  console.log(res.stdout || '')
  if (res.status !== 0) {
    console.error(res.stderr || '')
    throw new Error('Falha no redeploy Vercel')
  }
}

async function main() {
  console.log('1) Obtendo token do Firebase CLI...')
  const accessToken = await getAccessToken()

  console.log('2) Escolhendo service account...')
  const email = await pickServiceAccount(accessToken)
  console.log('   account:', email)

  console.log('3) Gerando chave privada...')
  const sa = await createKey(accessToken, email)
  fs.writeFileSync(saOut, JSON.stringify(sa, null, 2))
  console.log('OK arquivo: firebase-service-account.json')

  const compact = JSON.stringify(sa)
  upsertEnv(path.join(root, '.env.local'), compact)
  upsertEnv(path.join(root, 'functions', '.env'), compact)
  if (fs.existsSync(path.join(root, '.env'))) {
    upsertEnv(path.join(root, '.env'), compact)
  }

  console.log('4) Sincronizando Vercel...')
  pushVercelEnv('FIREBASE_SERVICE_ACCOUNT_KEY', compact)

  console.log('5) Redeploy...')
  redeploy()

  console.log('')
  console.log('Concluído. Service account instalada e Vercel atualizado.')
}

main().catch((err) => {
  console.error('ERRO:', err.message || err)
  if (err.status === 403) {
    console.error(
      'Sem permissão IAM. A conta logada no Firebase precisa ser Owner/Editor do projeto.',
    )
  }
  process.exit(1)
})
