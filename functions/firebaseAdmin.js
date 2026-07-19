/**
 * Firebase Admin — init único (Next.js API + Cloud Functions).
 * require('firebase-admin') estático — Turbopack/Vercel não aceita resolve dinâmico.
 */
'use strict'

const path = require('path')
const fs = require('fs')
const admin = require('firebase-admin')

const GLOBAL_KEY = '__FLASHCON_FIREBASE_ADMIN__'
const ROOT_DIR = path.join(__dirname, '..')

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

function resolveCredential() {
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

  return undefined
}

function ensureInitialized() {
  if (global[GLOBAL_KEY]?.apps?.length) {
    return global[GLOBAL_KEY]
  }

  loadEnvFiles()

  if (!admin.apps.length) {
    const projectId =
      process.env.VITE_FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.GCP_PROJECT ||
      'plegi-d84c2'

    const credential = resolveCredential()
    if (!credential) {
      console.warn(
        '[firebaseAdmin] Sem FIREBASE_SERVICE_ACCOUNT_KEY / firebase-service-account.json. ' +
          'APIs que usam Admin SDK vão falhar; há fallback para email/auth via Identity Toolkit.',
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
