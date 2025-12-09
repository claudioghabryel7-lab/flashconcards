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
 * Verifica se pode acessar uma matéria específica (teste permite todas do curso)
 */
export function canAccessMateria(materia) {
  // No novo sistema, trial dá acesso completo ao curso, então todas as matérias são permitidas
  return true
}

/**
 * Verifica se pode acessar um módulo (teste permite todos do curso)
 */
export function canAccessModulo(materia, modulo) {
  // No novo sistema, trial dá acesso completo ao curso, então todos os módulos são permitidos
  return true
}

/**
 * Verifica se pode gerar mais questões (teste permite ilimitadas)
 */
export function canGenerateQuestions(materia) {
  // No novo sistema, trial dá acesso completo ao curso, então questões são ilimitadas
  return true
}

export function incrementQuestionCount(materia) {
  // Não precisa mais contar questões no trial
  return
}

/**
 * Verifica se pode fazer simulado (teste permite ilimitados)
 */
export function canDoSimulado() {
  // No novo sistema, trial dá acesso completo ao curso, então simulados são ilimitados
  return true
}

export function incrementSimuladoCount() {
  // Não precisa mais contar simulados no trial
  return
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
}




