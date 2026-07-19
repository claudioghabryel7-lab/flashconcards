/**
 * Inicializa firebase-admin com adapter Supabase (firestore_docs).
 */
const path = require('path')

try {
  require('dotenv').config({ path: path.join(__dirname, '../../functions/.env') })
} catch {
  /* dotenv opcional — Next.js carrega .env da raiz */
}
try {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') })
} catch {
  /* ignore */
}

process.env.USE_SUPABASE = process.env.USE_SUPABASE || 'true'

const admin = require('firebase-admin')
const { patchAdminFirestore } = require('../../functions/lib/database')

let ready = false

function initBackend() {
  if (ready) return admin
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'plegi-d84c2',
    })
  }
  patchAdminFirestore(admin)
  ready = true
  return admin
}

initBackend()

module.exports = { initBackend, admin }
