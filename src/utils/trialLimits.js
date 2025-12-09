/**
 * Utilitários para verificar e aplicar limitações de teste
 */

/**
 * Verifica se o usuário está em modo de teste
 */
export function isTrialMode() {
  if (typeof window === 'undefined') return false
  const trialToken = localStorage.getItem('trialToken')
  return !!trialToken
}

/**
 * Obtém dados do teste ativo
 */
export function getTrialData() {
  if (typeof window === 'undefined') return null
  try {
    const trialData = localStorage.getItem('trialData')
    return trialData ? JSON.parse(trialData) : null
  } catch {
    return null
  }
}

/**
 * Verifica se pode acessar uma matéria específica (teste permite apenas 1)
 */
export function canAccessMateria(materia) {
  if (!isTrialMode()) return true
  const trialData = getTrialData()
  if (!trialData) return false
  // Se não tem matéria definida, permite a primeira que tentar acessar
  if (!trialData.materia) {
    // Salvar a primeira matéria acessada
    trialData.materia = materia
    localStorage.setItem('trialData', JSON.stringify(trialData))
    return true
  }
  return trialData.materia === materia
}

/**
 * Verifica se pode acessar um módulo (teste permite apenas 1)
 */
export function canAccessModulo(materia, modulo) {
  if (!isTrialMode()) return true
  if (!canAccessMateria(materia)) return false
  const trialData = getTrialData()
  if (!trialData) return false
  // Se não tem módulo definido, permite o primeiro que tentar acessar
  if (!trialData.modulo) {
    trialData.modulo = modulo
    localStorage.setItem('trialData', JSON.stringify(trialData))
    return true
  }
  return trialData.modulo === modulo && trialData.materia === materia
}

/**
 * Verifica se pode gerar mais questões (limite de 10 por matéria)
 */
let questionCounts = {}
export function canGenerateQuestions(materia) {
  if (!isTrialMode()) return true
  if (!canAccessMateria(materia)) return false
  const count = questionCounts[materia] || 0
  return count < 10
}

export function incrementQuestionCount(materia) {
  if (!isTrialMode()) return
  questionCounts[materia] = (questionCounts[materia] || 0) + 1
}

/**
 * Verifica se pode fazer simulado (limite de 1)
 */
let simuladoCount = 0
export function canDoSimulado() {
  if (!isTrialMode()) return true
  return simuladoCount < 1
}

export function incrementSimuladoCount() {
  if (!isTrialMode()) return
  simuladoCount++
}

/**
 * Verifica se pode acessar redação (teste não permite)
 */
export function canAccessRedacao() {
  if (!isTrialMode()) return true
  return false
}

/**
 * Limpa dados do teste
 */
export function clearTrialData() {
  localStorage.removeItem('trialToken')
  localStorage.removeItem('trialData')
  questionCounts = {}
  simuladoCount = 0
}

