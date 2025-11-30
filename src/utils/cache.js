/**
 * Sistema de Cache Inteligente
 * Reduz drasticamente requisições de IA compartilhando conteúdo entre alunos
 */

import { doc, getDoc, setDoc, serverTimestamp, updateDoc, increment } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * Obter ou criar cache de questões para um módulo
 */
export const getOrCreateQuestionsCache = async (materia, modulo) => {
  try {
    const cacheId = `${materia}_${modulo}`.replace(/[^a-zA-Z0-9_]/g, '_')
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
      
      return {
        id: cacheSnap.id,
        questoes: data.questoes || [],
        likes: data.likes || 0,
        dislikes: data.dislikes || 0,
        score,
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
export const saveQuestionsCache = async (materia, modulo, questoes) => {
  try {
    const cacheId = `${materia}_${modulo}`.replace(/[^a-zA-Z0-9_]/g, '_')
    const cacheRef = doc(db, 'questoesCache', cacheId)
    
    await setDoc(cacheRef, {
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
export const rateQuestionsCache = async (materia, modulo, isLike) => {
  try {
    const cacheId = `${materia}_${modulo}`.replace(/[^a-zA-Z0-9_]/g, '_')
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
    const explanationRef = doc(db, 'explanationsCache', cardId)
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
    const explanationRef = doc(db, 'explanationsCache', cardId)
    
    await setDoc(explanationRef, {
      text: explanationText,
      likes: 0,
      dislikes: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: false })
    
    console.log(`✅ Explicação salva no cache: ${cardId}`)
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
    const explanationRef = doc(db, 'explanationsCache', cardId)
    
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
 * Remover cache automaticamente se score muito baixo
 */
export const autoRemoveBadCache = async (collectionName, docId) => {
  try {
    const docRef = doc(db, collectionName, docId)
    const docSnap = await getDoc(docRef)
    
    if (!docSnap.exists()) return
    
    const data = docSnap.data()
    const score = calculateScore(data.likes || 0, data.dislikes || 0)
    
    // Se score < 50% e tem pelo menos 10 avaliações, remover
    if (score < 50 && (data.likes + data.dislikes) >= 10) {
      // Marcar como removido ao invés de deletar (para histórico)
      await updateDoc(docRef, {
        removed: true,
        removedAt: serverTimestamp(),
        removedReason: 'Score muito baixo'
      })
      console.log(`🗑️ Cache removido automaticamente: ${docId} (score: ${score}%)`)
      return true
    }
    
    return false
  } catch (error) {
    console.error('Erro ao verificar remoção automática:', error)
    return false
  }
}

