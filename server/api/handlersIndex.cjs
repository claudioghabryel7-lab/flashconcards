/**
 * Índice único de handlers HTTP — carregado via require estático nas rotas Next.js.
 */
require('./initBackend.cjs')

module.exports = {
  ...require('../../functions/handlers/createPixPaymentHandler'),
  ...require('../../functions/handlers/reconcilePaymentHandler'),
  ...require('../../functions/handlers/createCheckoutPreferenceHandler'),
  ...require('../../functions/handlers/processBrickRequestHandler'),
  ...require('../../functions/handlers/webhookMercadoPagoHandler'),
  ...require('../../functions/handlers/createUserHandler'),
  ...require('../../functions/handlers/emailVerificationHandlers'),
  ...require('../../functions/handlers/passwordResetHandlers'),
  ...require('../../functions/handlers/generationHttpHandlers'),
  ...require('../../functions/handlers/adminAutomationHandlers'),
  ...require('../../functions/handlers/generateConcursoNewsHandler'),
}
