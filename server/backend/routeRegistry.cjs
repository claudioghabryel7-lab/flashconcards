/**
 * Slug kebab-case → export name em functions/index.js (inclui v2Exports via Object.assign).
 */
const ROUTE_MAP = {
  health: 'healthCheckV2',
  'create-user-and-send-email': 'createUserAndSendEmail',
  'webhook-mercado-pago': 'webhookMercadoPago',
  'create-pix-payment': 'createPixPaymentV2',
  'process-brick-payment': 'processBrickPaymentV2',
  'reconcile-payment': 'reconcilePaymentV2',
  'create-checkout-preference': 'createCheckoutPreference',
  'get-mercado-pago-public-config': 'getMercadoPagoPublicConfig',
  'send-password-reset-email': 'sendPasswordResetEmail',
  'update-user-password': 'updateUserPassword',
  'send-admin-broadcast-email': 'sendAdminBroadcastEmail',
  'send-email-verification-code': 'sendEmailVerificationCode',
  'verify-email-code': 'verifyEmailCode',
  'send-email-verification-code-v2': 'sendEmailVerificationCodeV2',
  'verify-email-code-v2': 'verifyEmailCodeV2',
  'send-retroactive-welcome-emails': 'sendRetroactiveWelcomeEmails',
  'generate-concurso-news': 'generateConcursoNews',
  'generate-news-from-link': 'generateNewsFromLink',
  'nudge-generation-job-resume': 'nudgeGenerationJobResume',
  'kick-generation-job': 'kickGenerationJob',
  'cancel-generation-job': 'cancelGenerationJob',
  'list-active-generation-jobs': 'listActiveGenerationJobs',
  'run-content-automation-now': 'runContentAutomationNow',
  'send-simulado-result-email': 'sendSimuladoResultEmail',
  'run-motivational-inactivity-push-now': 'runMotivationalInactivityPushNow',
}

let handlers = null

function loadHandlers() {
  if (!handlers) {
    require('./init.cjs')
    handlers = require('../../functions/index.js')
  }
  return handlers
}

function getHttpHandler(slug) {
  const exportName = ROUTE_MAP[slug]
  if (!exportName) return null
  const fn = loadHandlers()[exportName]
  if (typeof fn !== 'function') return null
  return fn
}

function listRoutes() {
  return Object.keys(ROUTE_MAP)
}

module.exports = { ROUTE_MAP, getHttpHandler, listRoutes }
