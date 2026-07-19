/**
 * Firebase Admin para rotas API do Next.js (diagnóstico admin).
 * Delega para functions/firebaseAdmin.js (init único + globalThis).
 */
const { getAdmin, ensureInitialized } = require('../../functions/firebaseAdmin.js')

module.exports = {
  getAdmin,
  ensureInitialized,
  admin: getAdmin(),
}
