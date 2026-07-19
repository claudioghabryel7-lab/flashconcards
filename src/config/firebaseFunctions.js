/**
 * URLs do backend — migrado para rotas Next.js/Vercel (sem Cloud Functions GCP).
 * Rotas relativas funcionam no browser e no SSR (same-origin).
 */

export const API_ROUTES = {
  healthCheck: '/api/health',

  createUserAndSendEmail: '/api/auth/create-user',

  webhookMercadoPago: '/api/mercadopago/webhook',

  createPixPayment: '/api/payments/create-pix',
  processBrickPayment: '/api/mercadopago/process-brick',
  reconcilePayment: '/api/payments/reconcile',

  createCheckoutPreference: '/api/payments/checkout-preference',
  getMercadoPagoPublicConfig: '/api/mercadopago/public-config',

  sendPasswordResetEmail: '/api/auth/password-reset/send',
  updateUserPassword: '/api/auth/password-reset/update',
  sendAdminBroadcastEmail: '/api/admin/emails/broadcast',
  sendEmailVerificationCode: '/api/auth/email-verification/send',
  verifyEmailCode: '/api/auth/email-verification/verify',
  sendEmailVerificationCodeV2: '/api/auth/email-verification/send',
  verifyEmailCodeV2: '/api/auth/email-verification/verify',
  sendRetroactiveWelcomeEmails: '/api/admin/emails/welcome-retroactive',

  generateConcursoNews: '/api/admin/generate-concurso-news',
  generateNewsFromLink: '/api/admin/generate-news-from-link',

  nudgeGenerationJobResume: '/api/generation/nudge',
  kickGenerationJob: '/api/generation/kick',
  cancelGenerationJob: '/api/generation/cancel',
  listActiveGenerationJobs: '/api/generation/list-active',
  runContentAutomationNow: '/api/admin/content-automation/run',

  processBrickRequest: '/api/payments/process-brick-request',
}

/** @deprecated Use API_ROUTES — alias mantido para compatibilidade */
export const FIREBASE_FUNCTIONS = API_ROUTES

export default API_ROUTES
