import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { loadEditalVerticalizado } from './editalVerticalizadoLoader'

export async function validateGuiaMentoradoAutomation(courseId, { enabled, onDailyCron, onCronogramaGenerated }) {
  if (!courseId) return 'Selecione um curso.'
  if (!enabled && !onDailyCron && !onCronogramaGenerated) return null

  const edital = await loadEditalVerticalizado(courseId)
  if (!edital?.disciplinas?.length) {
    return 'Edital verticalizado obrigatório. Gere em Admin → Edital antes de ligar a automação.'
  }

  if (enabled || onDailyCron) {
    const cronSnap = await getDoc(doc(db, 'courses', courseId, 'config', 'guiaMentorado'))
    const cronogramaGeradoEm = cronSnap.exists ? cronSnap.data()?.cronogramaGeradoEm : null
    if (!cronogramaGeradoEm) {
      return 'Cronograma ainda não gerado neste curso. Gere o cronograma antes de ativar o cron diário.'
    }
  }

  return null
}
