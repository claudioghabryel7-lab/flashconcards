/**
 * Firebase Admin para rotas API do Next.js.
 * Lazy — não inicializa no import (evita quebrar `next build` / collect page data).
 */
const { getAdmin, ensureInitialized } = require('../../functions/firebaseAdmin.js')

module.exports = {
  getAdmin,
  ensureInitialized,
  get admin() {
    return getAdmin()
  },
}
