/**
 * Sistema de Cache Inteligente
 * Reduz drasticamente requisições de IA compartilhando conteúdo entre alunos
 */

import { doc, getDoc, setDoc, serverTimestamp, updateDoc, increment, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * Obter ou criar cache de questões para um módulo
 */
export const getOrCreateQuestionsCache = async (materia, modulo, courseId = null) => {
  try {
    // Incluir courseId no cacheId para separar questões por curso
    const courseKey = courseId || 'alego-default'
    const cacheId = `${courseKey}_${materia}_${modulo}`.replace(/[^a-zA-Z0-9_]/g, '_')
    const cacheRef = doc(db, 'questoesCache', cacheId)
    const cacheSnap = await getDoc(cacheRef)
    
    if (cacheSnap.exists()) {
      const data = cacheSnap.data()
      
      // Verificar se o cache não foi marcado como ruim
      const score = calculateScore(data.likes || 0, data.dislikes || 0)
      
      // Se score < 70% e tem pelo menos 5 avaliações, considerar ruim
      if (score < 70 && (data.likes + data.dislikes) >= 5) {
        console.log(`⚠️ Cache de questões marcado como ruim (score: ${score}%)`)
        return null // Retornar null para forçar nova geração
      }
      
      // Verificar se o cache é do curso correto
      const cacheCourseId = data.courseId || 'alego-default'
      const requestedCourseId = courseId || 'alego-default'
      if (cacheCourseId !== requestedCourseId) {
        console.log(`⚠️ Cache de outro curso (${cacheCourseId} vs ${requestedCourseId})`)
        return null
      }
      
      return {
        id: cacheSnap.id,
        questoes: data.questoes || [],
        likes: data.likes || 0,
        dislikes: data.dislikes || 0,
        score,
        courseId: cacheCourseId,
        createdAt: data.createdAt,
        cached: true
      }
    }
    
    return null // Cache não existe
  } catch (error) {
    console.error('Erro ao buscar cache de questões:', error)
    return null
  }
}

/**
 * Salvar questões no cache
 */
export const saveQuestionsCache = async (materia, modulo, questoes, courseId = null) => {
  try {
    // Incluir courseId no cacheId para separar questões por curso
    const courseKey = courseId || 'alego-default'
    const cacheId = `${courseKey}_${materia}_${modulo}`.replace(/[^a-zA-Z0-9_]/g, '_')
    const cacheRef = doc(db, 'questoesCache', cacheId)
    
    await setDoc(cacheRef, {
      courseId: courseKey,
      materia,
      modulo,
      questoes,
      likes: 0,
      dislikes: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: false }) // Não fazer merge para criar novo cache limpo
    
    console.log(`✅ Cache de questões salvo: ${cacheId}`)
    return cacheId
  } catch (error) {
    console.error('Erro ao salvar cache de questões:', error)
    throw error
  }
}

/**
 * Avaliar cache de questões (like/dislike)
 */
export const rateQuestionsCache = async (materia, modulo, isLike, courseId = null) => {
  try {
    const courseKey = courseId || 'alego-default'
    const cacheId = `${courseKey}_${materia}_${modulo}`.replace(/[^a-zA-Z0-9_]/g, '_')
    const cacheRef = doc(db, 'questoesCache', cacheId)
    
    const update = {
      updatedAt: serverTimestamp(),
    }
    
    if (isLike) {
      update.likes = increment(1)
    } else {
      update.dislikes = increment(1)
    }
    
    await updateDoc(cacheRef, update)
    console.log(`✅ Avaliação registrada: ${isLike ? 'like' : 'dislike'}`)
  } catch (error) {
    console.error('Erro ao avaliar cache:', error)
  }
}

/**
 * Obter ou criar cache de explicação de flashcard
 */
export const getOrCreateExplanationCache = async (cardId) => {
  try {
    // Garantir que o ID seja sempre seguro para uso no Firestore
    // Remove qualquer caractere problemático (incluindo /) e mantém apenas [a-zA-Z0-9_]
    const safeId = String(cardId).replace(/[^a-zA-Z0-9_]/g, '_')
    const explanationRef = doc(db, 'explanationsCache', safeId)
    const explanationSnap = await getDoc(explanationRef)
    
    if (explanationSnap.exists()) {
      const data = explanationSnap.data()
      
      // Verificar score
      const score = calculateScore(data.likes || 0, data.dislikes || 0)
      
      // Se score < 70% e tem pelo menos 3 avaliações, considerar ruim
      if (score < 70 && (data.likes + data.dislikes) >= 3) {
        console.log(`⚠️ Explicação marcada como ruim (score: ${score}%)`)
        return null
      }
      
      return {
        id: explanationSnap.id,
        text: data.text,
        likes: data.likes || 0,
        dislikes: data.dislikes || 0,
        score,
        createdAt: data.createdAt,
        cached: true
      }
    }
    
    return null
  } catch (error) {
    console.error('Erro ao buscar cache de explicação:', error)
    return null
  }
}

/**
 * Salvar explicação no cache
 */
export const saveExplanationCache = async (cardId, explanationText) => {
  try {
    // Usar sempre o mesmo padrão de ID seguro
    const safeId = String(cardId).replace(/[^a-zA-Z0-9_]/g, '_')
    const explanationRef = doc(db, 'explanationsCache', safeId)
    
    await setDoc(explanationRef, {
      text: explanationText,
      likes: 0,
      dislikes: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: false })
    
    console.log(`✅ Explicação salva no cache: ${safeId}`)
    return true
  } catch (error) {
    console.error('Erro ao salvar explicação no cache:', error)
    throw error
  }
}

/**
 * Avaliar explicação (like/dislike)
 */
export const rateExplanationCache = async (cardId, isLike) => {
  try {
    // Garantir ID seguro também na avaliação
    const safeId = String(cardId).replace(/[^a-zA-Z0-9_]/g, '_')
    const explanationRef = doc(db, 'explanationsCache', safeId)
    
    const update = {
      updatedAt: serverTimestamp(),
    }
    
    if (isLike) {
      update.likes = increment(1)
    } else {
      update.dislikes = increment(1)
    }
    
    await updateDoc(explanationRef, update)
    console.log(`✅ Avaliação de explicação registrada: ${isLike ? 'like' : 'dislike'}`)
  } catch (error) {
    console.error('Erro ao avaliar explicação:', error)
  }
}

/**
 * Calcular score de qualidade (0-100)
 */
const calculateScore = (likes, dislikes) => {
  const total = likes + dislikes
  if (total === 0) return 100 // Sem avaliações = neutro
  
  return Math.round((likes / total) * 100)
}

/**
 * Avaliar questão individual
 */
export const rateIndividualQuestion = async (materia, modulo, questionIndex, isLike, courseId = null) => {
  try {
    const courseKey = courseId || 'alego-default'
    const cacheId = `${courseKey}_${materia}_${modulo}`.replace(/[^a-zA-Z0-9_]/g, '_')
    const cacheRef = doc(db, 'questoesCache', cacheId)
    const cacheSnap = await getDoc(cacheRef)
    
    if (!cacheSnap.exists()) return
    
    const data = cacheSnap.data()
    const questoes = data.questoes || []
    if (!questoes[questionIndex]) return
    
    // Inicializar avaliações individuais se não existir
    let questionRatings = data.questionRatings || {}
    const questionId = `q${questionIndex}`
    
    if (!questionRatings[questionId]) {
      questionRatings[questionId] = { likes: 0, dislikes: 0 }
    }
    
    // Incrementar avaliação
    if (isLike) {
      questionRatings[questionId].likes = (questionRatings[questionId].likes || 0) + 1
    } else {
      questionRatings[questionId].dislikes = (questionRatings[questionId].dislikes || 0) + 1
    }
    
    // Atualizar avaliações no cache
    await updateDoc(cacheRef, {
      questionRatings,
      updatedAt: serverTimestamp(),
    })
    
    // Verificar se questão precisa ser removida
    const qScore = calculateScore(questionRatings[questionId].likes, questionRatings[questionId].dislikes)
    const totalRatings = questionRatings[questionId].likes + questionRatings[questionId].dislikes
    
    // Se score < 60% e tem pelo menos 3 avaliações, remover questão
    if (qScore < 60 && totalRatings >= 3) {
      await removeBadQuestion(materia, modulo, questionIndex)
      return { removed: true, reason: 'Questão removida por baixa qualidade' }
    }
    
    return { 
      removed: false,
      likes: questionRatings[questionId].likes,
      dislikes: questionRatings[questionId].dislikes,
      score: qScore
    }
  } catch (error) {
    console.error('Erro ao avaliar questão individual:', error)
    throw error
  }
}

/**
 * Remover questão ruim do array
 */
export const removeBadQuestion = async (materia, modulo, questionIndex, courseId = null) => {
  try {
    const courseKey = courseId || 'alego-default'
    const cacheId = `${courseKey}_${materia}_${modulo}`.replace(/[^a-zA-Z0-9_]/g, '_')
    const cacheRef = doc(db, 'questoesCache', cacheId)
    const cacheSnap = await getDoc(cacheRef)
    
    if (!cacheSnap.exists()) return
    
    const data = cacheSnap.data()
    const questoes = [...(data.questoes || [])]
    
    if (questionIndex >= questoes.length) return { error: 'Question index out of bounds' }
    
    // Remover questão do array
    const removedQuestion = questoes.splice(questionIndex, 1)[0]
    
    // Remover avaliações da questão removida e reorganizar índices
    let questionRatings = { ...(data.questionRatings || {}) }
    const questionId = `q${questionIndex}`
    delete questionRatings[questionId]
    
    // Reorganizar índices das avaliações (questões posteriores)
    const reorganizedRatings = {}
    Object.keys(questionRatings).forEach((key) => {
      const idx = parseInt(key.replace('q', ''))
      if (idx > questionIndex) {
        reorganizedRatings[`q${idx - 1}`] = questionRatings[key]
      } else {
        reorganizedRatings[key] = questionRatings[key]
      }
    })
    
    // Atualizar cache com questões restantes e avaliações reorganizadas
    await updateDoc(cacheRef, {
      questoes,
      questionRatings: reorganizedRatings,
      updatedAt: serverTimestamp(),
    })
    
    console.log(`🗑️ Questão ${questionIndex} DELETADA permanentemente do cache (${cacheId})`)
    
    // Se não sobrou nenhuma questão, deletar cache completo
    if (questoes.length === 0) {
      await deleteDoc(cacheRef)
      console.log(`🗑️ Cache completo DELETADO (sem questões restantes)`)
      return { cacheDeleted: true }
    }
    
    return { questionRemoved: true, remainingQuestions: questoes.length, removedQuestion }
  } catch (error) {
    console.error('Erro ao remover questão ruim:', error)
    throw error
  }
}

/**
 * Remover cache automaticamente se score muito baixo (DELETAR DE VERDADE)
 */
export const autoRemoveBadCache = async (collectionName, docId) => {
  try {
    const docRef = doc(db, collectionName, docId)
    const docSnap = await getDoc(docRef)
    
    if (!docSnap.exists()) return false
    
    const data = docSnap.data()
    
    // Se já está marcado como removido, deletar de verdade
    if (data.removed) {
      await deleteDoc(docRef)
      console.log(`🗑️ Cache DELETADO permanentemente: ${docId}`)
      return true
    }
    
    const score = calculateScore(data.likes || 0, data.dislikes || 0)
    
    // Se score < 50% e tem pelo menos 10 avaliações, DELETAR de verdade
    if (score < 50 && (data.likes + data.dislikes) >= 10) {
      await deleteDoc(docRef)
      console.log(`🗑️ Cache DELETADO por score baixo: ${docId} (score: ${score}%)`)
      return true
    }
    
    return false
  } catch (error) {
    console.error('Erro ao verificar remoção automática:', error)
    return false
  }
}

/**
 * Obter ou criar cache de mapa mental para um módulo
 */
export const getOrCreateMindMapCache = async (courseId, materia, modulo) => {
  try {
    const cacheId = `${courseId || 'alego-default'}_${materia}_${modulo}`.replace(/[^a-zA-Z0-9_]/g, '_')
    const cacheRef = doc(db, 'mindMapsCache', cacheId)
    const cacheSnap = await getDoc(cacheRef)
    
    if (cacheSnap.exists()) {
      const data = cacheSnap.data()
      
      // Verificar score
      const score = calculateScore(data.likes || 0, data.dislikes || 0)
      
      // Se score < 70% e tem pelo menos 3 avaliações, considerar ruim
      if (score < 70 && (data.likes + data.dislikes) >= 3) {
        console.log(`⚠️ Mapa mental marcado como ruim (score: ${score}%)`)
        return null
      }
      
      return {
        id: cacheSnap.id,
        structure: data.structure || {},
        likes: data.likes || 0,
        dislikes: data.dislikes || 0,
        score,
        createdAt: data.createdAt,
        cached: true
      }
    }
    
    return null
  } catch (error) {
    console.error('Erro ao buscar cache de mapa mental:', error)
    return null
  }
}

/**
 * Salvar mapa mental no cache
 */
export const saveMindMapCache = async (courseId, materia, modulo, structure) => {
  try {
    const cacheId = `${courseId || 'alego-default'}_${materia}_${modulo}`.replace(/[^a-zA-Z0-9_]/g, '_')
    const cacheRef = doc(db, 'mindMapsCache', cacheId)
    
    await setDoc(cacheRef, {
      courseId: courseId || 'alego-default',
      materia,
      modulo,
      structure,
      likes: 0,
      dislikes: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: false })
    
    console.log(`✅ Mapa mental salvo no cache: ${cacheId}`)
    return true
  } catch (error) {
    console.error('Erro ao salvar mapa mental no cache:', error)
    throw error
  }
}

/**
 * Avaliar mapa mental (like/dislike)
 */
export const rateMindMapCache = async (courseId, materia, modulo, isLike) => {
  try {
    const cacheId = `${courseId || 'alego-default'}_${materia}_${modulo}`.replace(/[^a-zA-Z0-9_]/g, '_')
    const cacheRef = doc(db, 'mindMapsCache', cacheId)
    
    const update = {
      updatedAt: serverTimestamp(),
    }
    
    if (isLike) {
      update.likes = increment(1)
    } else {
      update.dislikes = increment(1)
    }
    
    await updateDoc(cacheRef, update)
    console.log(`✅ Avaliação de mapa mental registrada: ${isLike ? 'like' : 'dislike'}`)
  } catch (error) {
    console.error('Erro ao avaliar mapa mental:', error)
  }
}

