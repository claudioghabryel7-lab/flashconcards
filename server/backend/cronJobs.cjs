/**
 * Jobs agendados — mesma lógica dos pubsub.schedule do Firebase.
 */
const CRON_JOBS = {
  'reconcile-pending-pix-payments': 'reconcilePendingPixPayments',
  'mentorado-daily-content-release': 'mentoradoDailyContentRelease',
  'content-automation-tick': 'contentAutomationTick',
  'resume-waiting-generation-jobs': 'resumeWaitingGenerationJobs',
  'professor-supervisor-tick': 'professorSupervisorTick',
  'weekly-redacao-theme-rotation': 'weeklyRedacaoThemeRotation',
  'motivational-inactivity-push': 'motivationalInactivityPush',
  'expire-trial-users': 'expireTrialUsers',
  'purge-unverified-emails': 'purgeUnverifiedEmails',
  'expire-course-accesses': 'expireCourseAccesses',
  'process-course-auto-renewals': 'processCourseAutoRenewals',
  'scheduled-generate-concurso-news': 'scheduledGenerateConcursoNews',
}

let handlers = null

function loadHandlers() {
  if (!handlers) {
    require('./init.cjs')
    handlers = require('../../functions/index.js')
  }
  return handlers
}

async function runCronJob(slug) {
  const exportName = CRON_JOBS[slug]
  if (!exportName) return { ok: false, error: 'cron_not_found' }
  const fn = loadHandlers()[exportName]
  if (!fn || typeof fn.run !== 'function') {
    return { ok: false, error: 'cron_handler_missing' }
  }
  await fn.run()
  return { ok: true, job: exportName }
}

module.exports = { CRON_JOBS, runCronJob }
