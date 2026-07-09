/** Idade em anos completos a partir de YYYY-MM-DD */
export function calculateAgeFromBirthDate(birthDateStr) {
  if (!birthDateStr) return null
  const birth = new Date(`${birthDateStr}T12:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }
  return age
}

/** Regras LGPD / CDC — menores de 18 */
export function getMinorConsentRules(age) {
  if (age == null || age >= 18) {
    return { isMinor: false, tier: 'adult', requiresParentalAck: false, blocked: false }
  }
  if (age < 13) {
    return {
      isMinor: true,
      tier: 'child',
      requiresParentalAck: true,
      blocked: false,
      title: 'Menor de 13 anos',
      message:
        'Pela LGPD (Art. 14), o tratamento de dados de crianças exige consentimento específico e em destaque do responsável legal. Ao continuar, você declara que possui autorização dos pais ou responsáveis para usar esta plataforma educacional.',
    }
  }
  return {
    isMinor: true,
    tier: 'teen',
    requiresParentalAck: true,
    blocked: false,
    title: 'Menor de 18 anos',
    message:
      'Recomendamos que o uso da plataforma seja feito com conhecimento dos pais ou responsáveis. Marque a confirmação abaixo para prosseguir com segurança.',
  }
}

export function validateOnboardingProfile({ displayName, email, birthDate, parentalAck }) {
  const errors = {}
  const name = (displayName || '').trim()
  if (!name || name.length < 2) errors.displayName = 'Informe seu nome completo.'
  const mail = (email || '').trim()
  if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    errors.email = 'Informe um e-mail válido.'
  }
  if (!birthDate) {
    errors.birthDate = 'Informe sua data de nascimento.'
  } else {
    const age = calculateAgeFromBirthDate(birthDate)
    if (age == null || age < 5 || age > 120) {
      errors.birthDate = 'Data de nascimento inválida.'
    } else {
      const rules = getMinorConsentRules(age)
      if (rules.requiresParentalAck && !parentalAck) {
        errors.parentalAck = 'Confirme a autorização dos responsáveis para continuar.'
      }
    }
  }
  return { errors, valid: Object.keys(errors).length === 0 }
}
