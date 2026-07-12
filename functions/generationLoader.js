/** Carrega módulos pesados de geração só quando necessário (evita timeout no deploy). */
let jobProcessorMod = null
let resumeMod = null
let dailyMod = null
let supervisorQueueMod = null
let kickMod = null

function getJobProcessor() {
  if (!jobProcessorMod) {
    jobProcessorMod = require('./generation/jobProcessor')
  }
  return jobProcessorMod
}

function getResumeModule() {
  if (!resumeMod) {
    resumeMod = require('./generation/generationJobResume')
  }
  return resumeMod
}

function getDailyModule() {
  if (!dailyMod) {
    dailyMod = require('./generation/guiaMentoradoDaily')
  }
  return dailyMod
}

function getSupervisorQueueModule() {
  if (!supervisorQueueMod) {
    supervisorQueueMod = require('./generation/professorSupervisorQueue')
  }
  return supervisorQueueMod
}

function getKickModule() {
  if (!kickMod) {
    kickMod = require('./generation/generationJobKick')
  }
  return kickMod
}

module.exports = {
  getJobProcessor,
  getResumeModule,
  getDailyModule,
  getSupervisorQueueModule,
  getKickModule,
}
