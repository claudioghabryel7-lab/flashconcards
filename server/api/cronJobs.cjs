/**
 * Jobs agendados — executados via /api/cron/[job] (Vercel Cron).
 */
require('./initBackend.cjs')

const admin = require('firebase-admin')
const { getMercadoPagoAccessToken } = require('../../functions/mercadopagoConfig')
const { reconcilePendingTransactions } = require('../../functions/pixReconciliation')
const {
  runExpireTrialUsers,
  runPurgeUnverifiedEmails,
  runExpireCourseAccesses,
  runProcessCourseAutoRenewals,
} = require('../../functions/jobs/lifecycleJobs')
const { resumeWaitingGenerationJobs } = require('../../functions/generation/generationJobResume')
const { runContentAutomationRelease } = require('../../functions/generation/contentAutomationRelease')
const { runDailyMentoradoAutomationForAllCourses } = require('../../functions/generation/guiaMentoradoDaily')
const { runMotivationalInactivityPush } = require('../../functions/push/motivationalInactivityPush')
const { tickProfessorSupervisor } = require('../../functions/generation/professorSupervisorQueue')

const legacyFunctions = { config: () => ({}) }

const JOBS = {
  'resume-jobs': () => resumeWaitingGenerationJobs(),
  'reconcile-pix': () =>
    reconcilePendingTransactions({
      getMercadoPagoAccessToken,
      adminSdk: admin,
      functions: legacyFunctions,
      limit: 50,
    }),
  'expire-trials': () => runExpireTrialUsers(),
  'purge-unverified': () => runPurgeUnverifiedEmails(),
  'expire-course-access': () => runExpireCourseAccesses(),
  'auto-renewals': () => runProcessCourseAutoRenewals(),
  'content-automation': () => runContentAutomationRelease({ force: false, respectSchedule: true }),
  'mentorado-daily': () => runDailyMentoradoAutomationForAllCourses(),
  'motivational-push': () => runMotivationalInactivityPush(),
  'professor-supervisor': () => tickProfessorSupervisor(),
}

async function runCronJob(job) {
  const runner = JOBS[job]
  if (!runner) {
    const err = new Error(`Cron desconhecido: ${job}`)
    err.status = 404
    throw err
  }
  return runner()
}

module.exports = { runCronJob, JOBS }
