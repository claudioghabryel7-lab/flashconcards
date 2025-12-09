import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

const MATERIAS = [
  'Português',
  'Área de Atuação (PL)',
  'Raciocínio Lógico',
  'Constitucional',
  'Administrativo',
  'Legislação Estadual',
  'Realidade de Goiás',
  'Redação',
]

/**
 * Obtém a ordem das matérias para um curso específico
 * Prioridade: 1. Ordem personalizada do aluno, 2. Ordem do admin, 3. Ordem padrão
 */
export async function getSubjectOrder(courseId, userId) {
  try {
    // 1. Tentar carregar ordem personalizada do aluno
    if (userId) {
      const userProgressRef = doc(db, 'userProgress', userId)
      const userProgressDoc = await getDoc(userProgressRef)
      
      if (userProgressDoc.exists()) {
        const customOrder = userProgressDoc.data().customOrder || {}
        const courseCustomOrder = customOrder[courseId || 'alego-default']
        
        if (courseCustomOrder && courseCustomOrder.isCustom && courseCustomOrder.subjectOrder) {
          return {
            order: courseCustomOrder.subjectOrder,
            source: 'user',
            isCustom: true
          }
        }
      }
    }
    
    // 2. Tentar carregar ordem padrão do admin
    const courseConfigRef = doc(db, 'courses', courseId || 'alego-default', 'config', 'order')
    const courseConfigDoc = await getDoc(courseConfigRef)
    
    if (courseConfigDoc.exists()) {
      const config = courseConfigDoc.data()
      if (config.subjectOrder && config.subjectOrder.length > 0) {
        return {
          order: config.subjectOrder,
          source: 'admin',
          isCustom: false
        }
      }
    }
    
    // 3. Fallback: ordem padrão (MATERIAS)
    return {
      order: MATERIAS,
      source: 'default',
      isCustom: false
    }
  } catch (error) {
    console.error('Erro ao carregar ordem de matérias:', error)
    return {
      order: MATERIAS,
      source: 'default',
      isCustom: false
    }
  }
}

/**
 * Obtém a ordem dos módulos para uma matéria específica
 */
export async function getModuleOrder(courseId, userId, materia) {
  try {
    // 1. Tentar carregar ordem personalizada do aluno
    if (userId) {
      const userProgressRef = doc(db, 'userProgress', userId)
      const userProgressDoc = await getDoc(userProgressRef)
      
      if (userProgressDoc.exists()) {
        const customOrder = userProgressDoc.data().customOrder || {}
        const courseCustomOrder = customOrder[courseId || 'alego-default']
        
        if (courseCustomOrder && courseCustomOrder.isCustom && courseCustomOrder.moduleOrder) {
          const materiaModules = courseCustomOrder.moduleOrder[materia]
          if (materiaModules && materiaModules.length > 0) {
            return {
              order: materiaModules,
              source: 'user',
              isCustom: true
            }
          }
        }
      }
    }
    
    // 2. Tentar carregar ordem padrão do admin
    const courseConfigRef = doc(db, 'courses', courseId || 'alego-default', 'config', 'order')
    const courseConfigDoc = await getDoc(courseConfigRef)
    
    if (courseConfigDoc.exists()) {
      const config = courseConfigDoc.data()
      if (config.moduleOrder && config.moduleOrder[materia]) {
        return {
          order: config.moduleOrder[materia],
          source: 'admin',
          isCustom: false
        }
      }
    }
    
    // 3. Fallback: retornar null (usar ordenação padrão)
    return {
      order: null,
      source: 'default',
      isCustom: false
    }
  } catch (error) {
    console.error('Erro ao carregar ordem de módulos:', error)
    return {
      order: null,
      source: 'default',
      isCustom: false
    }
  }
}

/**
 * Aplica a ordem personalizada a uma lista de matérias
 * "Como estudar?" sempre será a primeira matéria
 */
export function applySubjectOrder(subjects, orderConfig) {
  const subjectsList = Object.keys(subjects)
  const COMO_ESTUDAR_VARIANTS = ['Como estudar?', 'Como estudar', 'Como Estudar?', 'Como Estudar']
  
  // Separar "Como estudar?" se existir
  const comoEstudar = subjectsList.find(m => COMO_ESTUDAR_VARIANTS.includes(m))
  const otherSubjects = subjectsList.filter(m => !COMO_ESTUDAR_VARIANTS.includes(m))
  
  if (!orderConfig || !orderConfig.order || orderConfig.order.length === 0) {
    const sortedOthers = otherSubjects.sort((a, b) => {
      const indexA = MATERIAS.indexOf(a)
      const indexB = MATERIAS.indexOf(b)
      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1
      return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
    })
    return comoEstudar ? [comoEstudar, ...sortedOthers] : sortedOthers
  }
  
  const orderedSubjects = []
  const subjectsSet = new Set(otherSubjects)
  
  // Adicionar matérias na ordem especificada (exceto "Como estudar?")
  orderConfig.order.forEach(materia => {
    if (!COMO_ESTUDAR_VARIANTS.includes(materia) && subjectsSet.has(materia)) {
      orderedSubjects.push(materia)
      subjectsSet.delete(materia)
    }
  })
  
  // Adicionar matérias restantes (que não estão na ordem) no final, alfabeticamente
  const remaining = Array.from(subjectsSet).sort((a, b) => {
    return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
  })
  
  const finalOrder = [...orderedSubjects, ...remaining]
  
  // Sempre colocar "Como estudar?" primeiro
  return comoEstudar ? [comoEstudar, ...finalOrder] : finalOrder
}

/**
 * Aplica a ordem personalizada aos módulos de uma matéria
 * "Como estudar?" sempre será o primeiro módulo
 */
export function applyModuleOrder(modules, orderConfig) {
  const COMO_ESTUDAR_VARIANTS = ['Como estudar?', 'Como estudar', 'Como Estudar?', 'Como Estudar']
  
  // Separar "Como estudar?" se existir
  const comoEstudar = modules.find(m => COMO_ESTUDAR_VARIANTS.includes(m))
  const otherModules = modules.filter(m => !COMO_ESTUDAR_VARIANTS.includes(m))
  
  if (!orderConfig || !orderConfig.order || orderConfig.order.length === 0) {
    // Ordenação padrão: numérica primeiro, depois alfabética
    const sortedOthers = otherModules.sort((a, b) => {
      const extractNumber = (str) => {
        const match = str.match(/\d+/)
        return match ? parseInt(match[0], 10) : 999
      }
      const numA = extractNumber(a)
      const numB = extractNumber(b)
      if (numA !== 999 && numB !== 999) {
        return numA - numB
      }
      if (numA !== 999) return -1
      if (numB !== 999) return 1
      return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
    })
    return comoEstudar ? [comoEstudar, ...sortedOthers] : sortedOthers
  }
  
  const orderedModules = []
  const modulesSet = new Set(otherModules)
  
  // Adicionar módulos na ordem especificada (exceto "Como estudar?")
  orderConfig.order.forEach(modulo => {
    if (!COMO_ESTUDAR_VARIANTS.includes(modulo) && modulesSet.has(modulo)) {
      orderedModules.push(modulo)
      modulesSet.delete(modulo)
    }
  })
  
  // Adicionar módulos restantes no final
  const remaining = Array.from(modulesSet).sort((a, b) => {
    const extractNumber = (str) => {
      const match = str.match(/\d+/)
      return match ? parseInt(match[0], 10) : 999
    }
    const numA = extractNumber(a)
    const numB = extractNumber(b)
    if (numA !== 999 && numB !== 999) {
      return numA - numB
    }
    if (numA !== 999) return -1
    if (numB !== 999) return 1
    return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
  })
  
  const finalOrder = [...orderedModules, ...remaining]
  
  // Sempre colocar "Como estudar?" primeiro
  return comoEstudar ? [comoEstudar, ...finalOrder] : finalOrder
}

/**
 * Salva ordem personalizada do aluno
 */
export async function saveUserCustomOrder(userId, courseId, subjectOrder, moduleOrder = {}) {
  try {
    const userProgressRef = doc(db, 'userProgress', userId)
    const userProgressDoc = await getDoc(userProgressRef)
    
    const currentData = userProgressDoc.exists() ? userProgressDoc.data() : {}
    const currentCustomOrder = currentData.customOrder || {}
    
    // Atualizar ordem personalizada para este curso
    currentCustomOrder[courseId || 'alego-default'] = {
      subjectOrder,
      moduleOrder,
      isCustom: true,
      customizedAt: serverTimestamp()
    }
    
    await setDoc(userProgressRef, {
      ...currentData,
      customOrder: currentCustomOrder
    }, { merge: true })
    
    return true
  } catch (error) {
    console.error('Erro ao salvar ordem personalizada:', error)
    throw error
  }
}

/**
 * Remove ordem personalizada do aluno (volta para ordem padrão do admin)
 */
export async function removeUserCustomOrder(userId, courseId) {
  try {
    const userProgressRef = doc(db, 'userProgress', userId)
    const userProgressDoc = await getDoc(userProgressRef)
    
    if (!userProgressDoc.exists()) return true
    
    const currentData = userProgressDoc.data()
    const currentCustomOrder = currentData.customOrder || {}
    
    // Remover ordem personalizada para este curso
    delete currentCustomOrder[courseId || 'alego-default']
    
    await setDoc(userProgressRef, {
      ...currentData,
      customOrder: currentCustomOrder
    }, { merge: true })
    
    return true
  } catch (error) {
    console.error('Erro ao remover ordem personalizada:', error)
    throw error
  }
}

/**
 * Salva ordem padrão do admin
 */
export async function saveAdminOrder(courseId, subjectOrder, moduleOrder = {}) {
  try {
    const courseConfigRef = doc(db, 'courses', courseId || 'alego-default', 'config', 'order')
    
    await setDoc(courseConfigRef, {
      subjectOrder,
      moduleOrder,
      organizedBy: 'admin',
      organizedAt: serverTimestamp()
    }, { merge: true })
    
    return true
  } catch (error) {
    console.error('Erro ao salvar ordem do admin:', error)
    throw error
  }
}

