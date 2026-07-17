/**
 * Configuração das URLs das Funções Firebase
 *
 * Endpoints v2 (Cloud Run) eliminam cold start nos fluxos críticos.
 * Após deploy, confirme as URLs no console Firebase / Cloud Run.
 */

const FIREBASE_FUNCTIONS_BASE_URL = 'https://us-central1-plegi-d84c2.cloudfunctions.net'

export const FIREBASE_FUNCTIONS = {
  // Health check para monitores de uptime
  healthCheck: `${FIREBASE_FUNCTIONS_BASE_URL}/healthCheckV2`,

  createUserAndSendEmail: `${FIREBASE_FUNCTIONS_BASE_URL}/createUserAndSendEmail`,

  webhookMercadoPago: `${FIREBASE_FUNCTIONS_BASE_URL}/webhookMercadoPago`,

  // v2 — minInstances=1, retry automático, sem cold start no checkout
  createPixPayment: `${FIREBASE_FUNCTIONS_BASE_URL}/createPixPaymentV2`,
  processBrickPayment: `${FIREBASE_FUNCTIONS_BASE_URL}/processBrickPaymentV2`,

  createCheckoutPreference: `${FIREBASE_FUNCTIONS_BASE_URL}/createCheckoutPreference`,
  getMercadoPagoPublicConfig: `${FIREBASE_FUNCTIONS_BASE_URL}/getMercadoPagoPublicConfig`,

  sendPasswordResetEmail: `${FIREBASE_FUNCTIONS_BASE_URL}/sendPasswordResetEmail`,
  updateUserPassword: `${FIREBASE_FUNCTIONS_BASE_URL}/updateUserPassword`,
  sendAdminBroadcastEmail: `${FIREBASE_FUNCTIONS_BASE_URL}/sendAdminBroadcastEmail`,
  sendEmailVerificationCode: `${FIREBASE_FUNCTIONS_BASE_URL}/sendEmailVerificationCode`,
  verifyEmailCode: `${FIREBASE_FUNCTIONS_BASE_URL}/verifyEmailCode`,
  sendRetroactiveWelcomeEmails: `${FIREBASE_FUNCTIONS_BASE_URL}/sendRetroactiveWelcomeEmails`,

  generateConcursoNews: `${FIREBASE_FUNCTIONS_BASE_URL}/generateConcursoNews`,
  generateNewsFromLink: `${FIREBASE_FUNCTIONS_BASE_URL}/generateNewsFromLink`,

  nudgeGenerationJobResume: `${FIREBASE_FUNCTIONS_BASE_URL}/nudgeGenerationJobResume`,
  kickGenerationJob: `${FIREBASE_FUNCTIONS_BASE_URL}/kickGenerationJob`,
  cancelGenerationJob: `${FIREBASE_FUNCTIONS_BASE_URL}/cancelGenerationJob`,
  listActiveGenerationJobs: `${FIREBASE_FUNCTIONS_BASE_URL}/listActiveGenerationJobs`,
  runContentAutomationNow: `${FIREBASE_FUNCTIONS_BASE_URL}/runContentAutomationNow`,
}

export default FIREBASE_FUNCTIONS
