const admin = require('firebase-admin')
const { getTodayKeyInSaoPaulo } = require('./guiaMentoradoShared')
const {
  shouldEnqueueRedacaoTheme,
  REDACAO_ROTATE_DAYS,
} = require('./professorSupervisorQueue')

function getDb() {
  return admin.firestore()
}

/**
 * Rotação semanal de tema de redação para cursos com hasRedacao no Guia Mentorado.
 * Independente do Professor IA (que só corrige Moderação).
 */
async function runWeeklyRedacaoThemeRotation() {
  const { processRedacaoItem } = require('./professorSupervisor')
  const db = getDb()
  const todayKey = getTodayKeyInSaoPaulo()
  const coursesSnap = await db.collection('courses').get()
  const results = []
  const noopUpdate = async () => {}

  for (const courseDoc of coursesSnap.docs) {
    const courseId = courseDoc.id
    if (courseDoc.data()?.active === false) continue

    try {
      const check = await shouldEnqueueRedacaoTheme(courseId)
      if (!check.ok) {
        results.push({ courseId, skipped: true, reason: 'not_due_or_no_redacao' })
        continue
      }

      const outcome = await processRedacaoItem(
        courseId,
        {
          rotateTheme: true,
          targetDate: todayKey,
          scope: 'rotate',
          currentTema: check.currentTema || '',
          reason: check.reason,
        },
        noopUpdate,
        'system',
        `redacao-weekly-${courseId}-${todayKey}`,
      )

      results.push({
        courseId,
        rotated: true,
        reason: check.reason,
        summary: outcome?.summary || null,
        themePublished: Boolean(outcome?.themePublished),
        rotateEveryDays: REDACAO_ROTATE_DAYS,
      })
      console.log(`[redacaoWeekly] ${courseId}:`, results[results.length - 1])
    } catch (err) {
      console.error(`[redacaoWeekly] erro em ${courseId}:`, err)
      results.push({ courseId, error: err.message })
    }
  }

  return results
}

module.exports = {
  runWeeklyRedacaoThemeRotation,
  REDACAO_ROTATE_DAYS,
}
