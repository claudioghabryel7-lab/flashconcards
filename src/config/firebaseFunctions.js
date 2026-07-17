/**
 * URLs das Cloud Functions — migrado para 2ª geração (Cloud Run) nos fluxos críticos.
 */

const FIREBASE_FUNCTIONS_BASE_URL = 'https://us-central1-plegi-d84c2.cloudfunctions.net'

export const FIREBASE_FUNCTIONS = {
  healthCheck: `${FIREBASE_FUNCTIONS_BASE_URL}/healthCheckV2`,

  createUserAndSendEmail: `${FIREBASE_FUNCTIONS_BASE_URL}/createUserAndSendEmail`,

  webhookMercadoPago: `${FIREBASE_FUNCTIONS_BASE_URL}/webhookMercadoPago`,

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
