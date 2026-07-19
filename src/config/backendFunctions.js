/**
 * URLs do backend — 100% fora do GCP quando VITE_USE_SUPABASE=true.
 * Compute: API routes Next.js (/api/backend/*) + cron Vercel (/api/cron/*).
 */
import { useSupabaseBackend } from '../lib/supabase/config.js'
import { FIREBASE_FUNCTIONS } from './firebaseFunctions.js'

const SLUG_MAP = {
  healthCheck: 'health',
  createUserAndSendEmail: 'create-user-and-send-email',
  webhookMercadoPago: 'webhook-mercado-pago',
  createPixPayment: 'create-pix-payment',
  processBrickPayment: 'process-brick-payment',
  reconcilePayment: 'reconcile-payment',
  createCheckoutPreference: 'create-checkout-preference',
  getMercadoPagoPublicConfig: 'get-mercado-pago-public-config',
  sendPasswordResetEmail: 'send-password-reset-email',
  updateUserPassword: 'update-user-password',
  sendAdminBroadcastEmail: 'send-admin-broadcast-email',
  sendEmailVerificationCode: 'send-email-verification-code',
  verifyEmailCode: 'verify-email-code',
  sendEmailVerificationCodeV2: 'send-email-verification-code-v2',
  verifyEmailCodeV2: 'verify-email-code-v2',
  sendRetroactiveWelcomeEmails: 'send-retroactive-welcome-emails',
  generateConcursoNews: 'generate-concurso-news',
  generateNewsFromLink: 'generate-news-from-link',
  nudgeGenerationJobResume: 'nudge-generation-job-resume',
  kickGenerationJob: 'kick-generation-job',
  cancelGenerationJob: 'cancel-generation-job',
  listActiveGenerationJobs: 'list-active-generation-jobs',
  runContentAutomationNow: 'run-content-automation-now',
  sendSimuladoResultEmail: 'send-simulado-result-email',
  runMotivationalInactivityPushNow: 'run-motivational-inactivity-push-now',
}

function localBackendUrl(slug) {
  if (typeof window !== 'undefined') return `/api/backend/${slug}`
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/api/backend/${slug}`
}

function buildLocalBackend() {
  const out = {}
  for (const [key, slug] of Object.entries(SLUG_MAP)) {
    if (key === 'getMercadoPagoPublicConfig') {
      out[key] = '/api/mercadopago/public-config'
    } else {
      out[key] = localBackendUrl(slug)
    }
  }
  return out
}

export const BACKEND_FUNCTIONS = useSupabaseBackend() ? buildLocalBackend() : { ...FIREBASE_FUNCTIONS }

export const GCP_BACKEND_KEYS = useSupabaseBackend()
  ? []
  : Object.keys(FIREBASE_FUNCTIONS)

export default BACKEND_FUNCTIONS
