/**
 * Firebase Admin para rotas API do Next.js (diagnóstico admin).
 */
const path = require('path')

try {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') })
} catch {
  /* ignore */
}
try {
  require('dotenv').config({ path: path.join(__dirname, '../../functions/.env') })
} catch {
  /* ignore */
}

const admin = require('firebase-admin')

let ready = false

function getAdmin() {
  if (!ready) {
    if (!admin.apps.length) {
      const projectId =
        process.env.VITE_FIREBASE_PROJECT_ID ||
        process.env.GCLOUD_PROJECT ||
        'plegi-d84c2'

      let credential = undefined
      const saJson =
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
        process.env.FIREBASE_ADMIN_SDK_JSON

      if (saJson) {
        try {
          const parsed = typeof saJson === 'string' ? JSON.parse(saJson) : saJson
          credential = admin.credential.cert(parsed)
        } catch (err) {
          console.error('[initFirebaseAdmin] FIREBASE_SERVICE_ACCOUNT_KEY inválido:', err?.message)
        }
      }

      admin.initializeApp(credential ? { credential, projectId } : { projectId })
    }
    ready = true
  }
  return admin
}

module.exports = { getAdmin, admin }
