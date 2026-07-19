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
      admin.initializeApp({
        projectId:
          process.env.VITE_FIREBASE_PROJECT_ID ||
          process.env.GCLOUD_PROJECT ||
          'plegi-d84c2',
      })
    }
    ready = true
  }
  return admin
}

module.exports = { getAdmin, admin }
