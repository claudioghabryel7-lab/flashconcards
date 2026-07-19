/**
 * Firebase Admin — ponto único de init (Next.js API + Cloud Functions).
 * Sempre carrega firebase-admin da raiz do monorepo.
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')

const GLOBAL_KEY = '__FLASHCON_FIREBASE_ADMIN__'
const ROOT_DIR = path.join(__dirname, '..')

/** Client OAuth público do Firebase CLI (ADC local). */
const FIREBASE_CLI_CLIENT_ID =
  '563584335869-fgrhgmd47bqnek1034q9jv48h7qbmqlj.apps.googleusercontent.com'
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

function resolveRootFirebaseAdmin() {
  return require(require.resolve('firebase-admin', { paths: [ROOT_DIR] }))
}

function loadEnvFiles() {
  for (const envPath of [
    path.join(ROOT_DIR, '.env.local'),
    path.join(ROOT_DIR, '.env'),
    path.join(__dirname, '.env'),
  ]) {
    try {
      require('dotenv').config({ path: envPath })
    } catch {
      /* ignore */
    }
  }
}

function readFirebaseCliRefreshToken() {
  const candidates = [
    path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'),
    path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
  ]

  for (const filePath of candidates) {
    if (!filePath || !fs.existsSync(filePath)) continue
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      const token =
        data?.tokens?.refresh_token ||
        data?.refresh_token ||
        data?.token?.refresh_token ||
        null
      if (token) return token
    } catch {
      /* ignore */
    }
  }
  return null
}

/**
 * Firestore Admin exige cert ou ADC. Gera ADC authorized_user
 * a partir do `firebase login` (arquivo local, gitignored).
 */
function ensureAdcFromFirebaseCli() {
  const adcPath = path.join(ROOT_DIR, '.firebase-adc.json')
  if (fs.existsSync(adcPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath
    return adcPath
  }

  const refreshToken = readFirebaseCliRefreshToken()
  if (!refreshToken) return null

  const payload = {
    type: 'authorized_user',
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: FIREBASE_CLI_CLIENT_SECRET,
    refresh_token: refreshToken,
  }

  fs.writeFileSync(adcPath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 })
  process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath
  return adcPath
}

function resolveCredential(admin) {
  const saJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
    process.env.FIREBASE_ADMIN_SDK_JSON

  if (saJson) {
    try {
      const parsed = typeof saJson === 'string' ? JSON.parse(saJson) : saJson
      return admin.credential.cert(parsed)
    } catch (err) {
      console.error('[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_KEY inválido:', err?.message)
    }
  }

  const localKeyPath = path.join(ROOT_DIR, 'firebase-service-account.json')
  if (fs.existsSync(localKeyPath)) {
    try {
      return admin.credential.cert(JSON.parse(fs.readFileSync(localKeyPath, 'utf8')))
    } catch (err) {
      console.error('[firebaseAdmin] firebase-service-account.json inválido:', err?.message)
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (credPath && fs.existsSync(credPath)) {
    try {
      return admin.credential.applicationDefault()
    } catch (err) {
      console.error('[firebaseAdmin] ADC inválido:', err?.message)
    }
  }

  const adcFromCli = ensureAdcFromFirebaseCli()
  if (adcFromCli) {
    try {
      return admin.credential.applicationDefault()
    } catch (err) {
      console.error('[firebaseAdmin] ADC do Firebase CLI inválido:', err?.message)
    }
  }

  const defaultAdc = path.join(
    process.env.APPDATA || path.join(os.homedir(), '.config'),
    'gcloud',
    'application_default_credentials.json',
  )
  if (fs.existsSync(defaultAdc)) {
    try {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = defaultAdc
      return admin.credential.applicationDefault()
    } catch {
      /* ignore */
    }
  }

  return undefined
}

function ensureInitialized() {
  if (global[GLOBAL_KEY]?.apps?.length) {
    return global[GLOBAL_KEY]
  }

  loadEnvFiles()
  const admin = resolveRootFirebaseAdmin()

  if (!admin.apps.length) {
    const projectId =
      process.env.VITE_FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.GCP_PROJECT ||
      'plegi-d84c2'

    const credential = resolveCredential(admin)

    if (!credential) {
      console.warn(
        '[firebaseAdmin] Sem credenciais. Rode `npx firebase login` ou coloque ' +
          'firebase-service-account.json / FIREBASE_SERVICE_ACCOUNT_KEY.',
      )
    }

    admin.initializeApp(credential ? { credential, projectId } : { projectId })

    try {
      admin.firestore().settings({ ignoreUndefinedProperties: true })
    } catch {
      /* já configurado */
    }
  }

  global[GLOBAL_KEY] = admin
  return admin
}

function getAdmin() {
  return ensureInitialized()
}

function getDb() {
  return getAdmin().firestore()
}

function getAuth() {
  return getAdmin().auth()
}

module.exports = {
  getAdmin,
  getDb,
  getAuth,
  ensureInitialized,
}
